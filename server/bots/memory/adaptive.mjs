/** tp-adaptive@1. Keep this implementation replayable when a later policy ships.
 * Base character decisions are sampled unchanged, then a small mixture may redirect one legal
 * betting choice. Total variation from that sampled base recommendation is bounded by epsilon.
 * These trace probabilities are CONDITIONAL on the base sample, not hand-strength estimates.
 */
import { decide } from '../strategy.mjs';
import { snapshotHash, unavailableMemory } from './provider.mjs';
import { MEMORY_VERSION } from './observations.mjs';

export const ADAPTIVE_POLICY = 'tp-adaptive@1';
export const MEMORY_RANGES = Object.freeze({ maxInfluence: [0, .12], pressureResponse: [0,1], seenResponse: [0,1], blindResponse: [0,1], recencyWeight: [0,.65] });
export function defaultMemory(tendencies) {
	return { schema: MEMORY_VERSION, maxInfluence: .10,
		pressureResponse: Math.min(1, .25 + tendencies.strongRaiseChance * .75),
		seenResponse: Math.min(1, .3 + tendencies.pressureRead * 2),
		blindResponse: Math.min(1, .2 + tendencies.bluff * 3), recencyWeight: .5 };
}
const subject = user => user.botId ? `bot:${user.botId}` : user.id;
export function publicDecisionContext(view, seatId) {
	const me = view.usersList.find(u => u.id === seatId);
	return { blind: !!me?.isBlind, live: view.usersList.filter(u => u.id !== seatId && u.cardsInHand?.length && !u.isPacked).length,
		pot: view.pot >= (view.boot ?? 1) * 20 ? 'large' : 'small',
		price: view.legalActions.minBet >= (view.boot ?? 1) * 8 ? 'high' : 'low',
		canRaise: !!view.legalActions.bet && view.legalActions.maxBet > view.legalActions.minBet };
}
const choiceKey = (move, legal) => move.action === 'bet' ? move.payload.amount > legal.minBet ? 'raise' : 'call' : move.action;
function validateSnapshot(snapshot, view, seatId, botId) {
	if (snapshot.schema !== MEMORY_VERSION || snapshot.botId !== botId || snapshot.game !== (view.gameType ?? 'teen-patti') || snapshot.variant !== (view.rulesVersion ?? null) || snapshot.handId !== view.handId || snapshot.id !== snapshotHash(snapshot)) throw new Error('Invalid frozen memory scope/hash');
	const ids = new Set(view.usersList.filter(u => u.id !== seatId).map(subject));
	if (snapshot.models.some(m => !ids.has(m.playerId) || m.lastPlayed >= snapshot.asOf) || snapshot.episodes.some(e => !ids.has(e.playerId) || e.at >= snapshot.asOf) || (snapshot.through !== null && snapshot.through >= snapshot.asOf && snapshot.through !== 0)) throw new Error('Invalid frozen memory time/player boundary');
}
function evidence(metric, model, recencyWeight, asOf) {
	// Three pre-specified hypotheses, conservative interval and effect-size gates; no scanning
	// hundreds of situations for a lucky pattern. Independent hands/nights matter as well as n.
	if (!metric || metric.opportunities < 30 || metric.hands < 20 || model.nights < 3 || metric.confidence < .15 || metric.lastObserved >= asOf) return null;
	const estimate = metric.changed ? metric.longTerm * (1-recencyWeight) + metric.recent * recencyWeight : metric.longTerm;
	const margin = 2.4 * Math.sqrt(Math.max(.01, metric.observed * (1-metric.observed)) / metric.opportunities);
	if (metric.observed - margin <= metric.baseline || estimate - metric.baseline < .08) return null;
	return { ...metric, estimate, strength: Math.min(1, (estimate-metric.baseline) / .35) * metric.confidence };
}

export function adaptiveDecision(view, seatId, random, style, memory) {
	const snapshot = memory ?? unavailableMemory({ botId: style.botId, game: view.gameType ?? 'teen-patti', variant: view.rulesVersion ?? null, handId: view.handId, asOf: 0, nightId: null }, 'provider-not-connected');
	validateSnapshot(snapshot, view, seatId, style.botId);
	const base = decide(view, seatId, random, style.tendencies);
	if (!base) return null;
	const legal = view.legalActions;
	const baseKey = choiceKey(base, legal);
	const context = publicDecisionContext(view, seatId);
	const candidates = [];
	const active = view.usersList.filter(u => u.id !== seatId && u.cardsInHand?.length && !u.isPacked);
	if (snapshot.status === 'available' && ['pack','call','raise'].includes(baseKey)) {
		for (const opponent of active) {
			const model = snapshot.models.find(m => m.playerId === subject(opponent));
			if (!model) continue;
			const add = (key, reason, response, target) => {
				if (target === baseKey) return;
				const e = evidence(model.metrics[key], model, style.memory.recencyWeight, snapshot.asOf);
				if (!e) return;
				// Working/episodic observations can temper a historical estimate, never magnify it.
				const nowPressure = snapshot.session.working.actions.filter(a => a.playerId === model.playerId && a.action === 'bet').length;
				const contradiction = snapshot.episodes.some(ep => ep.playerId === model.playerId && ep.tags.includes('blind-pressure') && ep.at > model.lastPlayed - 86400000);
				const caution = reason === 'opponent-fold-pressure' && (nowPressure >= 3 || contradiction) ? .5 : 1;
				candidates.push({ reason, playerId: model.playerId, metric: key, target,
					weight: e.strength * response * caution,
					evidence: { opportunities: e.opportunities, successes: e.successes, hands: e.hands,
						baseline: e.baseline, observed: e.observed, estimate: e.estimate, confidence: e.confidence,
						recentSamples: e.recentSamples, changed: e.changed }, workingCaution: caution });
			};
			if (context.canRaise) add('pressure:fold', 'opponent-fold-pressure', style.memory.pressureResponse, 'raise');
			if (!opponent.isBlind && legal.bet && baseKey === 'pack') add('seen:raise', 'opponent-seen-raises', style.memory.seenResponse, 'call');
			if (opponent.isBlind && legal.bet && baseKey === 'pack') add('all:staysBlind', 'opponent-stays-blind', style.memory.blindResponse, 'call');
		}
	}
	// Select the strongest predeclared signal. No multi-opponent amplification.
	candidates.sort((a,b) => b.weight-a.weight || a.reason.localeCompare(b.reason) || a.playerId.localeCompare(b.playerId));
	const adaptation = candidates[0];
	const epsilon = adaptation ? Math.min(style.memory.maxInfluence, style.memory.maxInfluence * adaptation.weight) : 0;
	const finalProbabilities = { [baseKey]: 1-epsilon };
	if (epsilon) finalProbabilities[adaptation.target] = (finalProbabilities[adaptation.target] ?? 0) + epsilon;
	let move = base;
	let redirected = false;
	if (epsilon && random() < epsilon) {
		move = { action: 'bet', payload: { amount: adaptation.target === 'raise' ? legal.maxBet : legal.minBet }, reason: adaptation.reason };
		redirected = true;
	}
	const trace = {
		policy: ADAPTIVE_POLICY, botId: style.botId, styleId: style._id, styleVersion: style.version,
		memoryVersion: MEMORY_VERSION, memorySnapshot: snapshot.id, memoryRevision: snapshot.revision,
		memoryStatus: snapshot.status, modelRefs: snapshot.models.map(m => ({ playerId: m.playerId, lastPlayed: m.lastPlayed, hands: m.hands })),
		episodicRefs: snapshot.episodes.map(e => e.id), context,
		legalActions: { pack: !!legal.pack, bet: !!legal.bet, minBet: legal.minBet ?? null, maxBet: legal.maxBet ?? null, show: !!legal.show, see: !!legal.see },
		probabilityBasis: 'conditional-on-base-recommendation', baseAction: baseKey,
		baseProbabilities: { [baseKey]: 1 }, finalProbabilities,
		adaptations: epsilon ? [{ ...adaptation, effect: epsilon }] : [], redirected,
		confidence: adaptation?.evidence.confidence ?? 0,
		reasonCodes: [base.reason, ...(epsilon ? [adaptation.reason] : []), ...(snapshot.status === 'unavailable' ? ['memory-unavailable'] : [])],
		chosenAction: choiceKey(move, legal)
	};
	return { ...move, memory: snapshot, adaptive: trace };
}
