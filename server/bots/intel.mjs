/**
 * Bot intelligence for the owner (docs/archive/ANALYTICS_PHASE5.md, "Bot intelligence"). Bots are software, so
 * the analysis can be blunt: how predictable, how exploitable, how each published version performs.
 * Built from the club's public hand records and the bots' own derived caches (adaptation reports,
 * memory summaries). It never reads a bot's sealed decision traces and never names a person as
 * exploitable: findings about people are aggregate counts.
 *
 * Nothing here changes a bot. Findings feed the evolution workflow (evolution.mjs), where an owner
 * reviews them and publishes a new immutable style version.
 */
import {
	collectDecisions,
	coreRates,
	situational,
	clubPrior
} from '../analytics/compute/patterns.mjs';
import { handFacts } from '../analytics/compute/facts.mjs';
import { clusteredMean, evidence, round, wilson } from '../analytics/compute/stats.mjs';
import { fairShare } from '../analytics/compute/performance.mjs';
import { adaptationAnalysis } from './memory/diagnostics.mjs';
import { familiarity } from './memory/model.mjs';

const FAMILIARITY = ['Just met', 'Learning', 'Familiar', 'Knows your game', 'Very familiar'];

const botSeats = (record, botId, styleId = null) =>
	record.seats.filter(
		(s) => s.kind === 'bot' && s.bot?.botId === botId && (!styleId || s.bot.styleId === styleId)
	);

/** Humans' net result against one bot, from the chips that actually moved between them. */
export function humansAgainst(records, botId, styleId = null) {
	const nights = new Map();
	let hands = 0;
	for (const record of records) {
		const bots = botSeats(record, botId, styleId);
		if (!bots.length || record.outcome?.pot === null || record.outcome?.pot === undefined) continue;
		const facts = handFacts(record);
		const humans = record.seats.filter((s) => s.kind === 'human');
		for (const human of humans) {
			let chips = 0;
			for (const bot of bots)
				for (const flow of record.flows ?? []) {
					if (flow.from === bot.p && flow.to === human.p) chips += flow.amt;
					if (flow.from === human.p && flow.to === bot.p) chips -= flow.amt;
				}
			const unit = facts.get(human.p)?.unit ?? 1;
			const n = nights.get(record.nightId) ?? { sum: 0, n: 0 };
			n.sum += chips / unit;
			n.n++;
			nights.set(record.nightId, n);
			hands++;
		}
	}
	const c = clusteredMean([...nights.values()]);
	return {
		humanHands: hands,
		nights: nights.size,
		perHand: round(c.mean, 2),
		low: round(c.low, 2),
		high: round(c.high, 2),
		evidence: evidence(hands, 40)
	};
}

/** The bot's own results from its seat, in the same units as everyone's. */
export function botResults(records, botId, styleId = null) {
	const facts = [];
	for (const record of records)
		for (const seat of botSeats(record, botId, styleId)) {
			const f = handFacts(record).get(seat.p);
			if (f) facts.push(f);
		}
	const complete = facts.filter((f) => f.complete && f.stake);
	const nights = new Map();
	for (const f of complete) {
		const n = nights.get(f.nightId) ?? { sum: 0, n: 0 };
		n.sum += f.units;
		n.n++;
		nights.set(f.nightId, n);
	}
	const c = clusteredMean([...nights.values()]);
	return {
		hands: facts.length,
		perHand: round(c.mean, 2),
		low: round(c.low, 2),
		high: round(c.high, 2),
		fair: fairShare(facts),
		evidence: evidence(complete.length, 40)
	};
}

/**
 * How well a public context predicts the bot's action, judged only on decisions before each one
 * (walk-forward). A bot whose next move is easy to guess from the table alone is predictable.
 */
export function predictability(decisions, { warmup = 10, minimum = 100 } = {}) {
	const ordered = decisions.filter((d) => d.betting).sort((a, b) => a.at - b.at || a.i - b.i);
	const bucket = (x) => (x === null ? 'n' : x < 10 ? 's' : x < 30 ? 'm' : 'l');
	const cells = new Map();
	const overall = {};
	const top = (counts) =>
		Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
	let n = 0;
	let hit = 0;
	let baseline = 0;
	for (const d of ordered) {
		const key = [
			d.game,
			d.blind,
			d.facing,
			bucket(d.potUnits),
			d.options.raise,
			d.live.length
		].join('|');
		const cell = cells.get(key) ?? { n: 0, counts: {} };
		if (cell.n >= warmup) {
			n++;
			hit += Number(top(cell.counts) === d.action);
			baseline += Number(top(overall) === d.action);
		}
		cell.n++;
		cell.counts[d.action] = (cell.counts[d.action] ?? 0) + 1;
		cells.set(key, cell);
		overall[d.action] = (overall[d.action] ?? 0) + 1;
	}
	const sure = [...cells.entries()].filter(
		([, c]) => c.n >= 30 && Math.max(...Object.values(c.counts)) / c.n >= 0.9
	).length;
	return {
		decisions: ordered.length,
		judged: n,
		accuracy: n >= minimum ? round(hit / n, 3) : null,
		baseline: n >= minimum ? round(baseline / n, 3) : null,
		nearDeterministicContexts: sure,
		status: n >= minimum ? 'descriptive' : 'insufficient',
		method:
			'Walk-forward: each decision is predicted from earlier decisions in the same public situation.'
	};
}

/** What changed between two published versions, in the config's own terms. */
export function configDiff(older, newer) {
	if (!older) return [];
	const out = [];
	if (older.policy !== newer.policy)
		out.push({ key: 'policy', from: older.policy, to: newer.policy });
	for (const key of new Set([
		...Object.keys(older.tendencies ?? {}),
		...Object.keys(newer.tendencies ?? {})
	]))
		if (older.tendencies?.[key] !== newer.tendencies?.[key])
			out.push({
				key: `tendencies.${key}`,
				from: older.tendencies?.[key] ?? null,
				to: newer.tendencies?.[key] ?? null
			});
	for (const key of new Set([
		...Object.keys(older.memory ?? {}),
		...Object.keys(newer.memory ?? {})
	]))
		if (older.memory?.[key] !== newer.memory?.[key])
			out.push({
				key: `memory.${key}`,
				from: older.memory?.[key] ?? null,
				to: newer.memory?.[key] ?? null
			});
	return out;
}

/* ----------------------------------------- exploitability ----------------------------------------- */

export const EXPLOIT = Object.freeze({
	minDecisions: 50,
	overFold: 0.62,
	predictable: 0.88,
	lowRaise: 0.04,
	adaptedGap: 1
});

/**
 * Practical weaknesses worth an owner's look. Each finding carries its evidence and a suggested,
 * bounded change the evolution workflow can turn into a draft. None is applied automatically.
 */
export function exploitFindings({ botId, decisions, human, reports = null, memoryHealth = null }) {
	const betting = decisions.filter((d) => d.betting && d.game === 'teen-patti');
	const findings = [];
	const add = (f) => findings.push({ botId, severity: 'review', ...f });
	const facing = betting.filter((d) => d.facing === 'raise' && d.options.fold);
	if (facing.length >= EXPLOIT.minDecisions) {
		const k = facing.filter((d) => d.action === 'fold').length;
		const w = wilson(k, facing.length);
		if (w.low > EXPLOIT.overFold)
			add({
				id: 'folds-too-often-to-raises',
				title: 'Folds too often when raised',
				evidence: {
					n: facing.length,
					k,
					rate: round(w.rate, 3),
					low: round(w.low, 3),
					high: round(w.high, 3),
					humansPerHand: human?.perHand ?? null
				},
				why: 'A player who simply keeps raising wins most pots without a showdown. Folding a weak hand is correct, so the cost is in the chips already put in; the simulation decides whether a change helps.',
				suggestion: { strongRaiseChance: -0.15 }
			});
	}
	const blind = betting.filter((d) => d.blind === true && d.options.raise);
	if (blind.length >= EXPLOIT.minDecisions) {
		const k = blind.filter((d) => d.action === 'raise').length;
		const w = wilson(k, blind.length);
		if (w.high < EXPLOIT.lowRaise)
			add({
				id: 'never-raises-blind',
				title: 'Almost never raises while blind',
				evidence: {
					n: blind.length,
					k,
					rate: round(w.rate, 3),
					low: round(w.low, 3),
					high: round(w.high, 3)
				},
				why: 'Opponents can safely stay in cheaply against a bot that never pressures blind.',
				suggestion: { bluff: 0.02 }
			});
	}
	const p = predictability(decisions);
	if (p.status === 'descriptive' && p.accuracy >= EXPLOIT.predictable)
		add({
			id: 'too-predictable',
			title: 'Its next action is easy to guess',
			evidence: {
				accuracy: p.accuracy,
				baseline: p.baseline,
				judged: p.judged,
				deterministicContexts: p.nearDeterministicContexts
			},
			why: 'The same public situation almost always gets the same response.',
			suggestion: { randomness: 0.04 }
		});
	if (
		reports?.adapted?.hands >= 50 &&
		reports?.base?.hands >= 50 &&
		reports.adapted.bootsPerHand !== null &&
		reports.base.bootsPerHand !== null &&
		reports.base.bootsPerHand - reports.adapted.bootsPerHand >= EXPLOIT.adaptedGap
	)
		add({
			id: 'adaptation-overreacts',
			title: 'Hands where it adapts do worse than hands where it does not',
			evidence: {
				adaptedHands: reports.adapted.hands,
				adaptedPerHand: round(reports.adapted.bootsPerHand, 2),
				baseHands: reports.base.hands,
				basePerHand: round(reports.base.bootsPerHand, 2)
			},
			why: 'Different cards and opponents confound this, so treat it as a prompt to look, not proof.',
			suggestion: { memory: { maxInfluence: -0.03 } },
			severity: 'watch'
		});
	if (memoryHealth && memoryHealth.changedPlayers >= 3)
		add({
			id: 'memory-may-be-manipulated',
			title: 'Several players recently changed how they play against it',
			evidence: { players: memoryHealth.changedPlayers, models: memoryHealth.models },
			why: 'A bot that adapts to history can be taught a habit and then punished for it. Counts only; no player is named.',
			suggestion: { memory: { recencyWeight: -0.1 } },
			severity: 'watch'
		});
	if (human?.evidence !== 'insufficient' && human?.low > 0.5 && human.humanHands >= 100)
		add({
			id: 'humans-beat-it-comfortably',
			title: 'Players beat it comfortably',
			evidence: {
				humanHands: human.humanHands,
				perHand: human.perHand,
				low: human.low,
				high: human.high
			},
			why: 'Players win more than half a boot a hand against it, even at the low end of the range.',
			suggestion: {},
			severity: 'watch'
		});
	return findings;
}

/* ----------------------------------------- the whole picture ----------------------------------------- */

/**
 * @param records the club's public hand records (with events: the decision projection)
 * @param bots bot documents; @param styles every style document
 * @param reports bot_adaptation_reports docs, @param memories bot_memory docs
 */
export function analyzeBots({
	records,
	decisionRecords = records,
	bots,
	styles,
	reports = [],
	memories = [],
	evolutions = [],
	now = Date.now()
}) {
	const factsByHand = new Map();
	for (const record of decisionRecords)
		for (const f of handFacts(record).values()) factsByHand.set(`${record._id}|${f.seatId}`, f);
	const humanDecisions = collectDecisions(
		decisionRecords,
		(r) => r.seats.filter((s) => s.kind === 'human').map((s) => s.p),
		factsByHand
	);
	const prior = clubPrior(humanDecisions);
	const total = records.length;
	return bots.map((bot) => {
		const botId = bot._id;
		const own = records.filter((r) => botSeats(r, botId).length);
		const decisions = collectDecisions(
			decisionRecords.filter((r) => botSeats(r, botId).length),
			(r) => botSeats(r, botId).map((s) => s.p),
			factsByHand
		);
		const myReports = reports.filter((r) => r.botId === botId);
		const adaptation = myReports.length ? adaptationAnalysis(myReports) : null;
		const mem = memories.filter((m) => m.botId === botId);
		const models = mem.flatMap((m) => m.models.filter((p) => p.kind === 'human'));
		const familiarityCounts = Object.fromEntries(FAMILIARITY.map((f) => [f, 0]));
		for (const model of models) familiarityCounts[familiarity(model, now)]++;
		const changed = models.filter((m) =>
			Object.values(m.metrics).some(
				(c) => c.hands >= 20 && c.rn >= 30 && c.n >= 80 && Math.abs(c.rk / c.rn - c.k / c.n) >= 0.15
			)
		).length;
		const human = humansAgainst(records, botId);
		const rates = coreRates(decisions);
		const rows = [...new Set(own.map((r) => r.gameType))].map((game) => ({
			game,
			hands: own.filter((r) => r.gameType === game).length,
			...botResults(
				own.filter((r) => r.gameType === game),
				botId
			),
			human: humansAgainst(
				own.filter((r) => r.gameType === game),
				botId
			)
		}));
		const variants = [
			...new Set(own.filter((r) => r.gameType === 'teen-patti').map((r) => r.rulesVersion))
		]
			.map((variant) => ({
				variant,
				hands: own.filter((r) => r.rulesVersion === variant).length,
				...botResults(
					own.filter((r) => r.rulesVersion === variant),
					botId
				)
			}))
			.sort((a, b) => b.hands - a.hands);
		const reasons = adaptation?.reasons ?? {};
		const findings = exploitFindings({
			botId,
			decisions: decisions.decisions,
			human,
			reports: adaptation
				? { adapted: adaptation.performance.adapted, base: adaptation.performance.base }
				: null,
			memoryHealth: { changedPlayers: changed, models: models.length }
		});
		const seen = own.map((r) => r.completedAt);
		return {
			botId,
			name: bot.name,
			status: bot.status,
			usage: {
				hands: own.length,
				share: total ? round(own.length / total, 3) : null,
				nights: new Set(own.map((r) => r.nightId)).size,
				firstSeen: seen.length ? Math.min(...seen) : null,
				lastSeen: seen.length ? Math.max(...seen) : null
			},
			performance: { bot: botResults(own, botId), humansAgainst: human },
			byGame: rows,
			byVariant: variants,
			decisions: {
				count: rates.decisions,
				fold: rates.fold,
				raise: rates.raise,
				call: rates.call,
				show: rates.show,
				blindRaise: rates.teenPatti.blindRaise,
				vsClub: { fold: prior.fold, raise: prior.raise }
			},
			situational: situational(decisions, prior, { opponents: false })
				.filter((c) => c.significant)
				.slice(0, 5),
			predictability: predictability(decisions.decisions),
			adaptation: adaptation && {
				decisions: adaptation.decisions,
				adapted: adaptation.adapted,
				redirected: adaptation.redirected,
				behaviorChanges: adaptation.behaviorChanges,
				unavailable: adaptation.unavailable,
				performance: adaptation.performance,
				effectiveness: adaptation.causality
			},
			reasons: Object.entries(reasons)
				.sort((a, b) => b[1] - a[1])
				.slice(0, 6)
				.map(([code, count]) => ({ code, count })),
			familiarity: { models: models.length, counts: familiarityCounts, changedPlayers: changed },
			exploitability: findings,
			versions: lineage({
				bot,
				styles: styles.filter((s) => s.botId === botId),
				records: own,
				decisionRecords,
				evolutions: evolutions.filter((e) => e.botId === botId),
				now
			})
		};
	});
}

/** Every published version of one character, with what it did and why it was replaced. */
export function lineage({ bot, styles, records, decisionRecords = records, evolutions = [] }) {
	const ordered = [...styles].sort((a, b) => a.version - b.version);
	return ordered.map((style, index) => {
		const own = records.filter((r) => botSeats(r, bot._id, style._id).length);
		const next = ordered.slice(index + 1).find((s) => s.status === 'published');
		const evolution = evolutions.find((e) => e.draftStyleId === style._id);
		const decisions = collectDecisions(
			decisionRecords.filter((r) => botSeats(r, bot._id, style._id).length),
			(r) => botSeats(r, bot._id, style._id).map((s) => s.p)
		);
		return {
			styleId: style._id,
			version: style.version,
			status: style.status,
			current: bot.currentStyle === style._id,
			policy: style.policy,
			publishedAt: style.publishedAt ?? null,
			replacedAt: next?.publishedAt ?? null,
			hands: own.length,
			nights: new Set(own.map((r) => r.nightId)).size,
			difficulty: style.difficulty ?? null,
			predictability: predictability(decisions.decisions),
			performance: {
				bot: botResults(own, bot._id, style._id),
				humansAgainst: humansAgainst(own, bot._id, style._id)
			},
			changes: configDiff(ordered[index - 1], style),
			reason: evolution
				? { finding: evolution.finding?.title ?? null, note: evolution.review?.note ?? null }
				: style.notes
					? { finding: null, note: style.notes }
					: null
		};
	});
}
