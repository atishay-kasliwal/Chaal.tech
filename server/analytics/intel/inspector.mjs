/**
 * Owner decision inspector (BOT_BRAIN.md §20 Phase 6): the web version of scripts/bots-explain.mjs.
 * Reads a finished hand's sealed record, replays it, and explains every bot decision from its stored
 * trace: the probabilities over candidates, the named utility deltas, the bot's mood and beliefs, the
 * route through its policy's decision graph and a one-line reason in plain words.
 *
 * Owner only, finished hands only. A trace carries the bot's own hand strength and mind, so the Worker
 * authorises the owner before calling, and a hand is served only once its public record exists (the
 * recorder writes that last, when the hand is complete) and its sealed record replayed verified.
 * Responses are built field by field: no cards, decks, seeds or replay inputs ever leave this module.
 */
import { castMember } from '../../../src/lib/bots/cast.js';
import { COLLECTIONS, readSealed } from '../store.mjs';
import { replayHand } from '../recorder.mjs';
import { subjectNames } from '../data.mjs';
import { limits } from '../../engine.mjs';
import { cardName } from '../../tricks/cards.mjs';
import { explainDecision } from '../../sim/explain.mjs';
import { CHARACTER_GRAPH } from '../../bots/character.mjs';
import { CHARACTER_GRAPH_V2 } from '../../bots/character-v2.mjs';
import { CHARACTER_GRAPH_V3 } from '../../bots/character-v3.mjs';
import {
	DNA_POLICY_V1,
	DNA_POLICY_V2,
	DNA_POLICY_V3,
	DNA_POLICY_V4,
	DNA_POLICY_V5,
	DNA_POLICY_V6,
	DNA_POLICY_V7,
	DNA_POLICY_V8,
	DNA_POLICY_V9
} from '../../bots/dna-policies.mjs';
import { ClubError } from '../../club/members.mjs';

/* ------------------------------------------------------------------------------------------ */
/* Graphs                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const nodesOf = (graph) => graph.nodes.map(({ id, label }) => ({ id, label: label ?? '' }));
// tp-dna@3 to @9 run the same node list with different rules (character-v3.mjs characterPolicy).
const V3_NODES = nodesOf(CHARACTER_GRAPH_V3);
const GRAPHS = Object.freeze({
	[DNA_POLICY_V1]: nodesOf(CHARACTER_GRAPH),
	[DNA_POLICY_V2]: nodesOf(CHARACTER_GRAPH_V2),
	...Object.fromEntries(
		[DNA_POLICY_V3, DNA_POLICY_V4, DNA_POLICY_V5, DNA_POLICY_V6, DNA_POLICY_V7, DNA_POLICY_V8, DNA_POLICY_V9].map((p) => [p, V3_NODES])
	)
});

/** Every policy whose decisions run as a graph, with its nodes in order. */
export const policyGraphs = () => Object.entries(GRAPHS).map(([policy, nodes]) => ({ policy, nodes }));

/* ------------------------------------------------------------------------------------------ */
/* Words                                                                                        */
/* ------------------------------------------------------------------------------------------ */

const words = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ').toLowerCase();
const BASE_LABELS = {
	equity: 'hand strength vs price',
	'value-raise': 'value raise',
	'blind-cheap': 'blind bets are cheap',
	'see-timing': 'time to look',
	'blind-pressure': 'pressure to look',
	'blind-show': 'blind show',
	'show-value': 'show value',
	'stack-pressure': 'stack at risk',
	'future-cost': 'cost of staying in'
};
const KIND_LABELS = { dna: 'trait', state: 'mood', social: 'relation', model: 'read', quirk: 'quirk' };
/** A factor name in plain words: `social.rivalry` is "rivalry", `dna.blindAggression` "blind aggression (trait)". */
export function factorLabel(f) {
	const [kind, name = ''] = String(f).split('.');
	if (kind === 'base') return BASE_LABELS[name] ?? words(name);
	if (kind === 'social') return words(name);
	return KIND_LABELS[kind] ? `${words(name)} (${KIND_LABELS[kind]})` : words(f);
}
const FACTOR_NODE = { base: 'assess', dna: 'personalize', state: 'state', social: 'social', model: 'beliefs', quirk: 'quirks' };

const MOVE_WORDS = {
	pack: 'Packed',
	chaal: 'Called (chaal)',
	raise: 'Raised',
	see: 'Looked at the cards',
	show: 'Asked for a show',
	table: 'Played the table move',
	discard: 'Discarded',
	pass: 'Passed',
	chooseTrump: 'Chose trump',
	reveal: 'Revealed trump',
	pair: 'Declared a pair'
};
const REASON_WORDS = {
	'only-move': 'it was the only move',
	'table-move': 'a forced table move',
	discard: 'a forced discard',
	noise: 'a rare random slip',
	mixing: 'mixing it up',
	'fundamentals-held': 'the fundamentals held',
	'pot-odds-call': 'the pot odds made calling worth it',
	'strong-raise': 'a strong hand',
	'weak-pack': 'a weak hand',
	'stack-guard': 'protecting the stack',
	'show-strong': 'a hand strong enough to show',
	'blind-see': 'it was time to look',
	'blind-pressure-see': 'pressure from seen players to look',
	'blind-hold': 'staying blind is cheap',
	'blind-raise': 'pressing while blind',
	'blind-show': 'a blind show',
	'blind-stack-guard': 'protecting the stack while blind'
};
export const reasonWords = (code) => (code ? (REASON_WORDS[code] ?? words(code)) : 'no recorded reason');

const signed = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;
const pct = (p) => `${Math.round(p * 100)}%`;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* ------------------------------------------------------------------------------------------ */
/* One decision                                                                                 */
/* ------------------------------------------------------------------------------------------ */

/** The candidate the bot actually took, in its policy's move names. */
function chosenMove(t, before, actor) {
	if (t.chosen === 'bet') {
		const amount = num(t.params?.amount) ?? 0;
		const min = actor && before?.maxStake !== undefined ? limits(before, actor).min : null;
		if (t.probs && 'raise' in t.probs && !('chaal' in t.probs)) return 'raise';
		if (t.probs && 'chaal' in t.probs && !('raise' in t.probs)) return 'chaal';
		return min !== null && amount > min ? 'raise' : 'chaal';
	}
	if (t.chosen === 'play' && t.params?.card?.rank) return cardName(t.params.card);
	if (t.chosen === 'bid') return String(t.params?.value ?? 'bid');
	return t.chosen;
}

/** Probabilities over candidates, as an ordered list. Trick traces keep them as arrays beside `cands`. */
function probabilityList(t, chosen) {
	const trace = t.trace ?? {};
	if (Array.isArray(trace.probs) && Array.isArray(trace.cands))
		return trace.cands.map((move, k) => ({
			move: String(move),
			p: num(trace.probs[k]) ?? 0,
			chosen: String(move) === chosen,
			...(Array.isArray(trace.base) ? { base: num(trace.base[k]) } : {}),
			...(Array.isArray(trace.persona) ? { personality: num(trace.persona[k]) } : {})
		}));
	const probs = t.adaptive?.finalProbabilities ?? (trace.probs && !Array.isArray(trace.probs) ? trace.probs : t.probs) ?? {};
	return Object.entries(probs)
		.filter(([, p]) => typeof p === 'number')
		.map(([move, p]) => ({ move, p, chosen: move === chosen, ...(trace.utility ? { utility: num(trace.utility[move]) } : {}) }));
}

const delta = (f, d) => ({ factor: f, label: factorLabel(f), d: Object.fromEntries(Object.entries(d ?? {}).filter(([, v]) => typeof v === 'number')) });
const moved = (o) => o && typeof o === 'object' && Object.values(o).some((v) => typeof v === 'number' && v !== 0);
const numbers = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'number')) : null);

/** What each graph node contributed to this decision, read back from the trace. */
function nodeContributions(nodes, trace, ctx) {
	const path = Array.isArray(trace.path) ? trace.path : [];
	const factors = (trace.factors ?? []).filter((x) => Array.isArray(x) && typeof x[0] === 'string');
	return nodes.map((node) => {
		const order = path.indexOf(node.id);
		const out = { id: node.id, label: node.label, visited: order >= 0, order: order >= 0 ? order + 1 : null, notes: [], deltas: [], total: null };
		if (order < 0) return out;
		const add = (note) => note && out.notes.push(note);
		const own = factors.filter(([f]) => FACTOR_NODE[f.split('.')[0]] === node.id).map(([f, d]) => delta(f, d));
		out.deltas = own;
		switch (node.id) {
			case 'perceive':
				add(ctx.situation);
				if (path.length === 1) add(`Stopped here: ${reasonWords(ctx.reason)}.`);
				break;
			case 'recall':
				if (trace.mood) add(`Mood: ${Object.entries(trace.mood).map(([k, v]) => `${words(k)} ${Number(v).toFixed(2)}`).join(', ')}`);
				if (trace.pressure !== undefined) add(`Pressure: ${trace.pressure} seen ${trace.pressure === 1 ? 'player' : 'players'} betting`);
				if (trace.facing) add(`Facing a raise from ${ctx.name(trace.facing)}`);
				if (trace.memoryRefs?.length) add(`${trace.memoryRefs.length} beliefs about players in this hand`);
				break;
			case 'assess':
				if (trace.eq !== undefined) add(`Hand strength: beats one random hand ${pct(trace.eq)}, everyone still in ${pct(trace.s)}`);
				if (path.at(-1) === 'assess') add(`Stopped here: ${reasonWords(ctx.reason)}.`);
				out.total = numbers(trace.base);
				break;
			case 'personalize':
				out.total = numbers(trace.persona);
				break;
			case 'state':
			case 'social':
				out.total = numbers(trace[node.id]);
				break;
			case 'beliefs':
				out.total = numbers(trace.model);
				break;
			case 'quirks':
				out.total = numbers(trace.quirk);
				break;
			case 'bound':
				if (trace.lambda !== undefined) add(`Personality scaled by ${trace.lambda} (base clarity ${trace.clarity})`);
				if (trace.capped?.length) add(`Capped: ${trace.capped.map(words).join(', ')}`);
				break;
			case 'choose':
				if (trace.tau !== undefined) add(`Softmax at temperature ${trace.tau}`);
				if (ctx.chosenP !== null) add(`Drew ${ctx.chosen} (${pct(ctx.chosenP)} likely)`);
				if (trace.noise) add('A random slip: the draw ignored the scores.');
				out.total = numbers(trace.utility);
				break;
			case 'explain': {
				add(`Primary reason: ${reasonWords(ctx.reason)}`);
				if (trace.secondary?.length) add(`Also: ${trace.secondary.map(reasonWords).join(', ')}`);
				const against = trace.key ?? trace.rival;
				if (against && trace.margins?.length) add(`Over ${against}: ${trace.margins.map(([f, m]) => `${factorLabel(f)} ${signed(m)}`).join(', ')}`);
				if (trace.resisted?.length) add(`Resisted: ${trace.resisted.map(reasonWords).join(', ')}`);
				break;
			}
		}
		return out;
	});
}

/** One sentence: what the bot did, how likely that was, and what tipped it. */
function whyLine({ chosen, chosenP, reason, trace, adaptive, game }) {
	const did = MOVE_WORDS[chosen] ?? (game === 'teen-patti' ? words(chosen) : `Played ${chosen}`);
	const likely = chosenP !== null && chosenP < 0.995 ? ` (${pct(chosenP)} likely)` : '';
	if (trace.noise) return `${did}${likely}: a rare random slip, not a judgement.`;
	if (!trace.probs && !adaptive) return `${did}: ${reasonWords(reason)}.`;
	let line = `${did}${likely}: ${reasonWords(reason)}`;
	const against = trace.key ?? trace.rival;
	const top = (trace.margins ?? []).find(([, m]) => m > 0);
	if (against && top) line += `. Biggest edge over ${against}: ${factorLabel(top[0])} ${signed(top[1])}`;
	if (trace.override && trace.baseBest) line += `. Personality overrode the base brain, which preferred ${trace.baseBest}`;
	else if (trace.resisted?.length) line += `. It held back from ${trace.resisted.map(reasonWords).join(' and ')}`;
	if (adaptive?.redirected && adaptive.adaptations?.[0]) line += `. Memory redirected it: ${reasonWords(adaptive.adaptations[0].reason)}`;
	return `${line}.`;
}

/**
 * Explain one recorded bot decision. `before` is the replayed table just before the move; `name`
 * turns a player id into a display name. Pure: no database, no cards in the result.
 */
export function decisionView(t, before, { name = (id) => id, botName = null } = {}) {
	const actor = before?.players?.find((p) => p.id === t.p) ?? null;
	const game = before?.gameType ?? 'teen-patti';
	const trace = t.trace && typeof t.trace === 'object' ? t.trace : {};
	const adaptive = t.adaptive ?? null;
	const chosen = chosenMove(t, before, actor);
	const probs = probabilityList(t, chosen);
	const chosenP = probs.find((p) => p.chosen)?.p ?? (probs.length ? 0 : null);
	const alive = (before?.players ?? []).filter((p) => p.cards?.length && !p.isPacked && !p.departed).length;
	const blind = typeof actor?.isBlind === 'boolean' ? actor.isBlind : null;
	const rounds = game === 'teen-patti' && before ? Math.round(((actor?.handBet ?? 0) / Math.max(before.boot ?? 1, 1)) * 10) / 10 : null;
	const situation = [blind === null ? null : blind ? 'Blind' : 'Seen', rounds === null ? null : `${rounds} ${rounds === 1 ? 'round' : 'rounds'} in`, `${alive} players in`].filter(Boolean).join(', ');
	const who = botName ?? actor?.username ?? t.p;
	const nodes = GRAPHS[t.policy] ?? (Array.isArray(trace.path) ? trace.path.map((id) => ({ id, label: '' })) : null);
	const ctx = { situation, reason: t.reason, chosen, chosenP, name };
	const named = {
		...trace,
		...(trace.facing ? { facing: name(trace.facing) } : {}),
		...(trace.memoryRefs ? { memoryRefs: trace.memoryRefs.map(([id, ...rest]) => [name(id), ...rest]) } : {})
	};
	const text = Array.isArray(trace.probs)
		? null
		: explainDecision({
				name: `${who} (${t.styleId ?? 'unknown style'}, ${t.verified ?? 'not checked'})`,
				move: { reason: t.reason, trace: Object.keys(trace).length ? named : { probs: t.probs } },
				decision: { name: chosen, blind, rounds: rounds ?? 0, alive, facing: false, showOk: false }
			});
	return {
		i: t.i,
		botId: t.botId ?? null,
		name: who,
		styleId: t.styleId ?? null,
		policy: t.policy ?? adaptive?.policy ?? null,
		verified: t.verified ?? 'not-checked',
		action: chosen,
		actionLabel: MOVE_WORDS[chosen] ?? (game === 'teen-patti' ? words(chosen) : `Played ${chosen}`),
		amount: num(t.params?.amount),
		probs,
		reason: t.reason ?? null,
		reasonText: reasonWords(t.reason),
		secondary: (trace.secondary ?? []).map(reasonWords),
		why: whyLine({ chosen, chosenP, reason: t.reason, trace, adaptive, game }),
		situation,
		key: trace.key ?? trace.rival ?? null,
		deltas: (trace.factors ?? []).filter((x) => Array.isArray(x) && typeof x[0] === 'string').map(([f, d]) => delta(f, d)),
		margins: (trace.margins ?? []).map(([f, m]) => ({ factor: f, label: factorLabel(f), m })),
		groups: Object.fromEntries(['base', 'persona', 'state', 'social', 'model', 'quirk'].filter((g) => moved(trace[g])).map((g) => [g, numbers(trace[g])])),
		override: trace.baseBest ? { baseBest: trace.baseBest, best: trace.best, override: !!trace.override } : null,
		strength: trace.eq !== undefined ? { single: trace.eq, multi: trace.s } : null,
		mind: trace.mood
			? {
					mood: numbers(trace.mood),
					pressure: trace.pressure ?? 0,
					facing: trace.facing ? name(trace.facing) : null,
					beliefs: (trace.memoryRefs ?? []).map(([id, stat, p, n]) => ({ about: name(id), stat: words(stat), p, n }))
				}
			: null,
		bound: trace.lambda !== undefined ? { clarity: trace.clarity, lambda: trace.lambda, capped: trace.capped ?? [] } : null,
		resisted: (trace.resisted ?? []).map(reasonWords),
		adaptive: adaptive
			? {
					baseAction: adaptive.baseAction ?? null,
					redirected: !!adaptive.redirected,
					confidence: num(adaptive.confidence),
					adaptations: (adaptive.adaptations ?? []).map((a) => ({ reason: reasonWords(a.reason), about: a.playerId ? name(a.playerId) : null, target: a.target ?? null, effect: num(a.effect) })),
					reasons: (adaptive.reasonCodes ?? []).map(reasonWords)
				}
			: null,
		path: Array.isArray(trace.path) ? trace.path : [],
		graph: nodes ? nodeContributions(nodes, trace, ctx) : null,
		text
	};
}

/* ------------------------------------------------------------------------------------------ */
/* Routes                                                                                       */
/* ------------------------------------------------------------------------------------------ */

const titleCase = (id) => String(id).split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
const seatName = (names, seat) =>
	(seat.bot?.botId ? (castMember(seat.bot.botId)?.name ?? names[`bot:${seat.bot.botId}`]?.name ?? titleCase(seat.bot.botId)) : names[seat.p]?.name) ?? (seat.kind === 'bot' ? 'A bot' : 'A friend');

/** Recent finished hands that had a bot at the table, newest first. Public records only. */
export async function inspectableHands(db, { limit = 30 } = {}) {
	const n = Math.max(1, Math.min(Number(limit) || 30, 60));
	const [records, names] = await Promise.all([
		db
			.collection(COLLECTIONS.records)
			.find({ complete: true, 'seats.kind': 'bot' }, { projection: { _id: 1, gameType: 1, rulesVersion: 1, completedAt: 1, nightId: 1, handNo: 1, seats: 1, practice: 1 } })
			.sort({ completedAt: -1 })
			.limit(n)
			.toArray(),
		subjectNames(db)
	]);
	return {
		hands: records.map((r) => ({
			id: r._id,
			gameType: r.gameType,
			rulesVersion: r.rulesVersion ?? null,
			completedAt: r.completedAt ?? null,
			nightId: r.nightId ?? null,
			handNo: r.handNo ?? null,
			practice: !!r.practice,
			seats: (r.seats ?? []).map((s) => ({ name: seatName(names, s), kind: s.kind, styleId: s.bot?.styleId ?? null, policy: s.bot?.policy ?? null }))
		})),
		graphs: policyGraphs()
	};
}

const notServed = () => new ClubError('That hand is not finished or was not recorded.', 'HAND_NOT_FOUND', 404);

/** Every bot decision in one finished hand, explained. */
export async function inspectHand(db, handId) {
	if (typeof handId !== 'string' || !handId || handId.length > 200) throw new ClubError('Choose a hand', 'INVALID_HAND', 400);
	// The public record is written last, only for a complete hand: no record, no inspection.
	const record = await db.collection(COLLECTIONS.records).findOne({ _id: handId, complete: true }, { projection: { _id: 1, gameType: 1, rulesVersion: 1, completedAt: 1, nightId: 1, handNo: 1, seats: 1 } });
	if (!record) throw notServed();
	const doc = await db.collection(COLLECTIONS.sealed).findOne({ _id: handId });
	if (!doc || doc.status !== 'verified') throw notServed();
	const sealed = await readSealed(doc);
	if (!Array.isArray(sealed.steps) || !sealed.preDeal) throw notServed();
	let states;
	try {
		states = replayHand(sealed.preDeal, sealed.steps);
	} catch {
		throw new ClubError('This hand no longer replays with the running code.', 'REPLAY_UNAVAILABLE', 409);
	}
	const names = await subjectNames(db);
	const usernames = new Map();
	for (const state of [states[0], states.at(-1)]) for (const p of state?.players ?? []) if (p.username) usernames.set(p.id, p.username);
	const seatsById = new Map((record.seats ?? []).map((s) => [s.p, s]));
	const name = (id) => {
		const seat = seatsById.get(id);
		return seat ? seatName(names, seat) : (names[id]?.name ?? usernames.get(id) ?? 'someone');
	};
	const decisions = (sealed.botTrace ?? []).map((t) => decisionView(t, states[t.i], { name, botName: t.botId ? (castMember(t.botId)?.name ?? names[`bot:${t.botId}`]?.name ?? null) : null }));
	const policies = [...new Set(decisions.map((d) => d.policy).filter((p) => GRAPHS[p]))];
	return {
		hand: {
			id: record._id,
			gameType: record.gameType,
			rulesVersion: record.rulesVersion ?? null,
			completedAt: record.completedAt ?? null,
			nightId: record.nightId ?? null,
			handNo: record.handNo ?? null,
			seats: (record.seats ?? []).map((s) => ({ name: seatName(names, s), kind: s.kind, styleId: s.bot?.styleId ?? null }))
		},
		decisions,
		graphs: Object.fromEntries(policies.map((p) => [p, GRAPHS[p]]))
	};
}
