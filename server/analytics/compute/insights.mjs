/**
 * The insight engine (docs/archive/ANALYTICS_PHASE2.md, "Insights"). It turns computed analytics into
 * structured, testable observations; the UI only renders them. Every candidate carries its
 * test; the whole set is corrected with Benjamini–Hochberg so that looking at many patterns at
 * once does not manufacture discoveries. Records (biggest pot, best night) are descriptive and
 * need no test.
 *
 * The same engine will serve post-game summaries, admin analytics and bot analysis: it takes a
 * subject and computed pieces, not a page.
 */
import { benjaminiHochberg, round, twoSidedP } from './stats.mjs';

export const FDR = 0.1;
const THRESHOLDS = { rate: 0.08, perHand: 0.5, ratio: 0.15 };

const STAKE = { 'teen-patti': 'boots', 'texas-holdem': 'big blinds', blackjack: 'bets' };
const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;
const units = (x) => `${Math.abs(round(x, 1))} ${Math.abs(x) === 1 ? 'boot' : 'boots'}`;
const hands = (n) => `${n} ${n === 1 ? 'hand' : 'hands'}`;
const strength = (q) => (q < 0.01 ? 'consistently' : 'tends to');

function candidate(fields) {
	return {
		id: `${fields.type}:${fields.metric}:${fields.segment ?? ''}:${fields.opponent ?? ''}:${fields.game ?? ''}:${fields.variant ?? ''}`,
		window: null,
		game: null,
		variant: null,
		opponent: null,
		supportingHands: [],
		...fields
	};
}

/**
 * @param pieces { subject, window, overview, games, situational, styleChange, rivals, fairness }
 * @param names subject → { name }
 */
export function insights(pieces, names = {}) {
	const { subject, window = 'all' } = pieces;
	const tested = [];
	const records = [];
	const nameOf = (s) => names[s]?.name ?? (s?.startsWith('bot:') ? 'a bot' : 'a friend');

	const fair = pieces.overview?.fairShare;
	if (fair && fair.verdict !== 'insufficient')
		tested.push(
			candidate({
				type: 'fair-share',
				metric: 'wins-vs-fair-share',
				value: fair.wins,
				baseline: fair.expected,
				difference: fair.aboveFair,
				effect: (fair.ratio ?? 1) - 1,
				threshold: THRESHOLDS.ratio,
				n: fair.hands,
				p: fair.p,
				evidence: fair.evidence,
				text: (q) =>
					`You ${strength(q)} win ${fair.ratio > 1 ? 'more' : 'less'} than your fair share: ${fair.wins} wins where an average player at the same tables would expect ${fair.expected} (${fair.hands} hands).`
			})
		);

	const res = pieces.overview?.results;
	if (res && res.perHandSe !== null && res.perHandSe !== undefined && res.evidence !== 'insufficient')
		tested.push(
			candidate({
				type: 'results',
				metric: 'boots-per-hand',
				value: res.perHand,
				baseline: 0,
				difference: res.perHand,
				effect: res.perHand,
				threshold: THRESHOLDS.perHand,
				n: res.hands,
				p: twoSidedP(res.perHand / res.perHandSe),
				evidence: res.evidence,
				text: (q) => `You ${strength(q)} come out ${res.perHand > 0 ? 'ahead' : 'behind'}: ${units(res.perHand)} a hand over ${res.hands} hands and ${res.nights} nights.`
			})
		);

	for (const [label, pick] of [
		['best', 'best'],
		['worst', 'worst']
	]) {
		const choice = pieces.games?.labels?.[pick];
		if (!choice?.key) continue;
		const game = pieces.games.games.find((g) => g.key === choice.key);
		tested.push(
			candidate({
				type: 'game-edge',
				metric: `${label}-game`,
				game: choice.key,
				value: game.results.perHand,
				baseline: null,
				difference: choice.margin,
				effect: choice.margin,
				threshold: THRESHOLDS.perHand,
				n: game.results.hands,
				p: choice.p,
				evidence: game.results.evidence,
				text: () => `${gameName(choice.key)} is clearly your ${label} game: ${units(game.results.perHand)} a hand ${game.results.perHand >= 0 ? 'won' : 'lost'} over ${game.results.hands} hands.`
			})
		);
	}

	for (const c of pieces.situational ?? []) {
		if (c.evidence === 'insufficient' || c.diff === null) continue;
		const who = c.opponent ? nameOf(c.opponent) : null;
		tested.push(
			candidate({
				type: c.opponent ? 'opponent-pattern' : 'pattern',
				metric: `${c.action}-rate`,
				segment: c.segment,
				opponent: c.opponent ?? null,
				value: c.rate,
				baseline: c.baseline.rate,
				difference: c.diff,
				effect: c.diff,
				threshold: THRESHOLDS.rate,
				n: c.n,
				p: c.p,
				evidence: c.evidence,
				supportingHands: c.hands ?? [],
				text: (q) =>
					`${c.opponent ? `When ${who} is in the hand, you` : `${c.label}, you`} ${strength(q)} ${verb(c.action)} ${c.diff > 0 ? 'more' : 'less'}: ${pct(c.rate)} of the time against ${pct(c.baseline.rate)} otherwise (${c.n} chances).`
			})
		);
	}

	for (const c of pieces.styleChange ?? []) {
		if (c.evidence === 'insufficient' || c.diff === null) continue;
		tested.push(
			candidate({
				type: 'style-change',
				metric: `${c.action}-rate`,
				segment: 'recent-30d',
				value: c.rate,
				baseline: c.baseline.rate,
				difference: c.diff,
				effect: c.diff,
				threshold: THRESHOLDS.rate,
				n: c.n,
				p: c.p,
				evidence: c.evidence,
				text: (q) => `Your style is shifting: lately you ${strength(q)} ${verb(c.action)} ${pct(c.rate)} of the time, against ${pct(c.baseline.rate)} before (${c.n} recent chances).`
			})
		);
	}

	for (const r of pieces.rivals ?? []) {
		if (r.evidence === 'insufficient' || r.perHandSe === null || r.perHandSe === undefined) continue;
		tested.push(
			candidate({
				type: 'rival',
				metric: 'boots-per-hand-against',
				opponent: r.subject,
				value: r.perHand,
				baseline: 0,
				difference: r.perHand,
				effect: r.perHand,
				threshold: THRESHOLDS.perHand,
				n: r.hands,
				p: twoSidedP(r.perHand / r.perHandSe),
				evidence: r.evidence,
				text: (q) => `Against ${nameOf(r.subject)} you ${strength(q)} come out ${r.perHand > 0 ? 'ahead' : 'behind'}: ${units(r.units)} over ${r.hands} hands together.`
			})
		);
	}

	const t = pieces.overview?.trend;
	if (t && t.verdict !== 'insufficient' && t.p !== undefined)
		tested.push(
			candidate({
				type: 'trend',
				metric: 'boots-per-hand-recent',
				segment: 'recent-30d',
				value: t.recent,
				baseline: t.earlier,
				difference: t.diff,
				effect: t.diff,
				threshold: THRESHOLDS.perHand,
				n: t.recentHands,
				p: t.p,
				evidence: 'moderate',
				text: () => `Your last 30 days are ${t.diff > 0 ? 'better' : 'worse'} than before: ${units(t.recent)} a hand against ${units(t.earlier)} (${t.recentHands} recent hands).`
			})
		);

	if (pieces.fairness?.verdict === 'unusual')
		tested.push(
			candidate({
				type: 'fairness',
				metric: 'deck',
				value: null,
				baseline: null,
				difference: null,
				effect: 1,
				threshold: 0,
				n: pieces.fairness.cards,
				p: Math.min(pieces.fairness.rankTest.p, pieces.fairness.suitTest.p),
				evidence: 'moderate',
				text: () => `Your dealt cards look unusual for a fair deck (${pieces.fairness.cards} cards). That is chance or a dealing problem, never a skill; worth telling the club owner.`
			})
		);

	// Records: descriptive facts, no test needed.
	const best = pieces.overview?.results?.bestNight;
	if (best && best.units > 0)
		records.push(candidate({ type: 'record', metric: 'best-night', value: best.units, baseline: null, difference: null, n: best.hands, evidence: 'descriptive', supportingHands: [], nightId: best.nightId, text: () => `Your best night: up ${units(best.units)} over ${hands(best.hands)}.` }));
	const pot = pieces.overview?.biggestPot;
	if (pot) records.push(candidate({ type: 'record', metric: 'biggest-pot', value: pot.units, n: 1, evidence: 'descriptive', supportingHands: [pot.handId], game: pot.gameType, text: () => `Your biggest pot won: ${round(pot.units, 1)} ${STAKE[pot.gameType] ?? 'boots'} in ${gameName(pot.gameType)}.` }));

	const corrected = benjaminiHochberg(tested.map((c) => ({ ...c, p: c.p ?? 1 })), FDR);
	const finished = corrected.map((c) => {
		const bigEnough = Math.abs(c.effect ?? 0) >= c.threshold;
		const eligible = c.significant && bigEnough && c.evidence !== 'insufficient';
		return finish(c, subject, window, eligible, eligible ? 'shown' : !c.significant ? 'not-significant-after-correction' : !bigEnough ? 'effect-too-small' : 'not-enough-data');
	});
	return [
		...finished.sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.confidence.q - b.confidence.q),
		...records.map((r) => finish({ ...r, q: 0, significant: true }, subject, window, true, 'record'))
	];
}

function finish(c, subject, window, eligible, reason) {
	const { text, p, q, evidence, ...rest } = c;
	rest.magnitudeRatio = c.threshold ? round(Math.abs(c.effect ?? 0) / c.threshold, 2) : null;
	delete rest.effect;
	delete rest.threshold;
	delete rest.significant;
	return {
		...rest,
		subject,
		window,
		confidence: { p: round(p ?? null, 4), q: round(q ?? null, 4), evidence },
		eligible,
		reason,
		text: text(q ?? 1)
	};
}

const verb = (action) => ({ raise: 'raise', fold: 'pack or fold', call: 'call' })[action] ?? action;
export const gameName = (game) => ({ 'teen-patti': 'Teen Patti', 'texas-holdem': "Hold'em", blackjack: 'Blackjack', rummy: 'Rummy' })[game] ?? game;
