/**
 * 3 2 5 Phase 2 evaluation (docs/archive/games/325_PHASE2_REPORT.md). Deterministic: every deal and every
 * decision draw comes from (seed, table, round, seat, k), so comparisons are matched: the same deals
 * and the same draws for the other seats, only the hero changes.
 *
 *   node scripts/sim/325-eval.mjs [--seed 52] [--scale 1]
 * Writes .sim/325/eval-<seed>.json and prints a summary.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { runTable325, randomPlayer } from '../../server/sim/tricks/table-325.mjs';
import { bot325 } from '../../server/bots/tricks/bot-325.mjs';
import { legalPlays } from '../../server/tricks/cards.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const SEED = opt('seed', 52);
const SCALE = opt('scale', 1);
// Personality strength under test (1 = as built).
const PS = opt('persona', 1);
const ROUNDS = 12;
const CHARS = Object.keys(CANONICAL_STYLES);
const SHORT = { 'rohit-sharma': 'Rohit', 'virat-kohli': 'Virat', gg: 'GG', 'samay-raina': 'Samay', 'ms-dhoni': 'Dhoni' };
const totals = { rounds: 0, decisions: 0, ms: 0 };

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / Math.max(xs.length, 1);
const sd = (xs) => Math.sqrt(xs.reduce((s, x) => s + (x - mean(xs)) ** 2, 0) / Math.max(xs.length - 1, 1));
const ci = (xs) => ({ mean: mean(xs), ci: (1.96 * sd(xs)) / Math.sqrt(Math.max(xs.length, 1)), n: xs.length });
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Play one table; collect per-seat round results and decision-level facts for `watch` seats. */
function play(seed, table, seats, watch = [0]) {
	const facts = Object.fromEntries(watch.map((s) => [s, newFacts()]));
	const t0 = performance.now();
	const { results, room } = runTable325(
		{ seed, table, rounds: ROUNDS, seats },
		{
			onDecision({ seat, view, move }) {
				totals.decisions++;
				if (!(seat in facts)) return;
				const f = facts[seat];
				const tr = move.trace;
				if (move.action === 'chooseTrump') {
					const me = view.usersList.find((u) => u.id === view.selfId).cardsInHand;
					const len = (s) => me.filter((c) => c.suit === s).length;
					const longest = Math.max(...['spades', 'hearts', 'diamonds', 'clubs'].map(len));
					f.trump.n++;
					if (len(move.payload.suit) === longest) f.trump.longest++;
				}
				if (move.action === 'play' && tr?.pWin) {
					f.plays++;
					if (tr.reason === 'play-character' || move.reason === 'play-character') f.characterChoice++;
					f.lambda += tr.lambda;
					const i = tr.cands.findIndex((x) => x === tr.cands[tr.probs.indexOf(Math.max(...tr.probs))]);
					void i;
					const chosen = tr.cands.indexOf(cardLabel(move.payload.card));
					const p = tr.pWin[chosen];
					if (p > 0.2 && p < 0.8) f.uncertain.n++;
					if (p > 0.2 && p < 0.8 && tr.pWin.some((q) => q < p - 0.1)) f.uncertain.contested++;
					const leading = !view.trick.plays.length;
					if (leading) {
						f.leads++;
						const ledBefore = new Set(view.history.map((t) => t.plays[0].card.suit));
						if (!ledBefore.has(move.payload.card.suit)) f.newSuitLeads++;
					}
				}
				if (move.reason?.endsWith('-character')) f.overrides++;
				f.decisions++;
			},
			onRound({ room: r }) {
				for (const s of watch) {
					const id = `p${s}`;
					const f = facts[s];
					f.rounds.push({ quota: r.result.quotas[id], tricks: r.result.tricks[id], diff: r.result.diffs[id], pulled: r.last ? 0 : 0 });
					for (const [k, t] of r.history.entries()) {
						const mine = t.plays.find((p) => p.id === id);
						const led = t.plays[0].card.suit;
						if (mine.card.suit === r.trump && led !== r.trump) {
							f.ruffs++;
							if (t.winner === id) f.ruffsWon++;
						}
						if (mine.card.suit === r.trump && t.winner !== id) f.trumpLost++;
						if (mine.card.suit === r.trump) f.trumpsPlayed++;
						if (k < 3 && t.plays[0].id === id && led === r.trump) f.earlyTrumpLeads++;
					}
				}
			}
		}
	);
	totals.ms += performance.now() - t0;
	totals.rounds += results.length;
	return { facts, scores: Object.fromEntries([0, 1, 2].map((s) => [s, room.scores[`p${s}`]])) };
}
const cardLabel = (c) => `${{ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[c.rank] ?? c.rank}${{ spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }[c.suit]}`;
function newFacts() {
	return { rounds: [], trump: { n: 0, longest: 0 }, plays: 0, leads: 0, newSuitLeads: 0, uncertain: { n: 0, contested: 0 }, characterChoice: 0, overrides: 0, decisions: 0, lambda: 0, ruffs: 0, ruffsWon: 0, trumpLost: 0, trumpsPlayed: 0, earlyTrumpLeads: 0 };
}
function merge(list) {
	const out = newFacts();
	for (const f of list) {
		out.rounds.push(...f.rounds);
		for (const k of Object.keys(f)) if (typeof f[k] === 'number') out[k] += f[k];
		for (const k of ['trump', 'uncertain']) for (const j of Object.keys(f[k])) out[k][j] += f[k][j];
	}
	return out;
}
/** The readable profile of a seat's play. */
function profile(f) {
	const byRole = Object.fromEntries([5, 3, 2].map((q) => {
		const rs = f.rounds.filter((r) => r.quota === q);
		return [q, { rounds: rs.length, success: r3(mean(rs.map((r) => (r.tricks >= q ? 1 : 0)))), meanDiff: r3(mean(rs.map((r) => r.diff))), overshoot: r3(mean(rs.map((r) => Math.max(0, r.diff)))), shortfall: r3(mean(rs.map((r) => Math.max(0, -r.diff)))) }];
	}));
	return {
		rounds: f.rounds.length,
		meanDiff: r3(mean(f.rounds.map((r) => r.diff))),
		sdDiff: r3(sd(f.rounds.map((r) => r.diff))),
		byRole,
		trumpLongest: r3(f.trump.longest / Math.max(f.trump.n, 1)),
		contestRate: r3(f.uncertain.contested / Math.max(f.uncertain.n, 1)),
		newSuitLeadRate: r3(f.newSuitLeads / Math.max(f.leads, 1)),
		earlyTrumpLeadRate: r3(f.earlyTrumpLeads / Math.max(f.rounds.length, 1)),
		ruffWinRate: r3(f.ruffsWon / Math.max(f.ruffs, 1)),
		wastedTrumpRate: r3(f.trumpLost / Math.max(f.trumpsPlayed, 1)),
		characterOverrideRate: r3(f.overrides / Math.max(f.decisions, 1)),
		meanLambda: r3(f.lambda / Math.max(f.plays, 1))
	};
}

/* Opponents with clear tendencies, for the adaptation study: the baseline brain with one habit. */
const base = () => bot325(null, { personality: false, adaptive: false });
function habit(kind) {
	const b = base();
	const decide = (view, id, random, memory) => {
		const move = b(view, id, random, memory);
		if (move.action !== 'play') return move;
		const me = view.usersList.find((u) => u.id === id).cardsInHand;
		const led = view.trick.plays[0]?.card.suit;
		const legal = legalPlays(me, led);
		const voidInLed = led && !me.some((c) => c.suit === led);
		const trumps = legal.filter((c) => c.suit === view.trump);
		const low = (xs) => xs.slice().sort((a, b2) => a.rank - b2.rank)[0];
		if (kind === 'hoarder' && voidInLed && legal.some((c) => c.suit !== view.trump))
			return { ...move, payload: { card: low(legal.filter((c) => c.suit !== view.trump)) } };
		if (kind === 'ruffer' && voidInLed && trumps.length) return { ...move, payload: { card: low(trumps) } };
		if (kind === 'ducker' && led && !voidInLed) return { ...move, payload: { card: low(legal) } };
		return move;
	};
	decide.observe = b.observe;
	return decide;
}

mkdirSync('.sim/325', { recursive: true });
const out = { seed: SEED, personaScale: PS, rounds: ROUNDS, strength: {}, profiles: {}, identity: {}, adaptation: {}, roles: {}, totals };
const T = Math.round(80 * SCALE);

// 1. Strength: each hero in seat 0 against two baseline brains, on the same deals.
const heroes = { random: () => randomPlayer, baseline: base, ...Object.fromEntries(CHARS.map((c) => [c, () => bot325(c, { personaScale: PS })])) };
const perTable = {};
for (const [key, make] of Object.entries(heroes)) {
	perTable[key] = [];
	const facts = [];
	for (let t = 0; t < T; t++) {
		const r = play(SEED, t, [make(), base(), base()]);
		perTable[key].push(r.scores[0] / ROUNDS);
		facts.push(r.facts[0]);
	}
	out.profiles[key] = profile(merge(facts));
}
for (const key of Object.keys(heroes)) {
	const diff = perTable[key].map((x, i) => x - perTable.baseline[i]);
	out.strength[key] = { perRound: ci(perTable[key]), vsBaseline: ci(diff) };
	console.log(`${(SHORT[key] ?? key).padEnd(8)} tricks over quota per round ${r3(out.strength[key].perRound.mean)} ± ${r3(out.strength[key].perRound.ci)}; vs baseline ${r3(out.strength[key].vsBaseline.mean)} ± ${r3(out.strength[key].vsBaseline.ci)}`);
}

// 2. Mixed character tables: personality fingerprints and blind identification.
const triples = [];
for (let a = 0; a < CHARS.length; a++) for (let b = a + 1; b < CHARS.length; b++) for (let c = b + 1; c < CHARS.length; c++) triples.push([CHARS[a], CHARS[b], CHARS[c]]);
const sessions = [];
const mixed = Object.fromEntries(CHARS.map((c) => [c, []]));
const TM = Math.round(16 * SCALE);
for (const [ti, trio] of triples.entries())
	for (let t = 0; t < TM; t++) {
		const r = play(SEED + 1, 1000 + ti * 100 + t, trio.map((c) => bot325(c, { personaScale: PS })), [0, 1, 2]);
		trio.forEach((c, s) => {
			mixed[c].push(r.facts[s]);
			const p = profile(r.facts[s]);
			sessions.push({ c, x: [p.trumpLongest, p.contestRate, p.newSuitLeadRate, p.earlyTrumpLeadRate, p.wastedTrumpRate, p.characterOverrideRate, p.meanDiff] });
		});
	}
for (const c of CHARS) out.profiles[`${c}:mixed`] = profile(merge(mixed[c]));
{
	const dim = sessions[0].x.length;
	const mu = Array.from({ length: dim }, (_, i) => mean(sessions.map((s) => s.x[i])));
	const sg = Array.from({ length: dim }, (_, i) => sd(sessions.map((s) => s.x[i])) || 1);
	const z = (x) => x.map((v, i) => (v - mu[i]) / sg[i]);
	const zs = sessions.map((s) => ({ c: s.c, v: z(s.x) }));
	const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
	const confusion = Object.fromEntries(CHARS.map((c) => [c, Object.fromEntries(CHARS.map((d) => [d, 0]))]));
	for (const s of zs) {
		const cent = (c) => {
			const rows = zs.filter((x) => x.c === c && x !== s).map((x) => x.v);
			return rows[0].map((_, i) => mean(rows.map((r) => r[i])));
		};
		const best = CHARS.reduce((a, b) => (dist(s.v, cent(a)) <= dist(s.v, cent(b)) ? a : b));
		confusion[s.c][best]++;
	}
	const acc = CHARS.reduce((n, c) => n + confusion[c][c], 0) / zs.length;
	out.identity = { sessions: zs.length, roundsPerSession: ROUNDS, accuracy: r3(acc), chance: r3(1 / CHARS.length), confusion };
	console.log(`identification from ${ROUNDS}-round sessions: ${Math.round(acc * 100)}% (chance 20%)`);
}

// 3. Adaptation: the same character with and without session learning, against clear habits.
const TA = Math.round(30 * SCALE);
for (const kind of ['hoarder', 'ruffer', 'ducker']) {
	out.adaptation[kind] = {};
	for (const c of CHARS) {
		const a = [];
		const n = [];
		for (let t = 0; t < TA; t++) {
			a.push(play(SEED + 2, 5000 + t, [bot325(c, { personaScale: PS }), habit(kind), habit(kind)]).scores[0] / ROUNDS);
			n.push(play(SEED + 2, 5000 + t, [bot325(c, { adaptive: false, personaScale: PS }), habit(kind), habit(kind)]).scores[0] / ROUNDS);
		}
		out.adaptation[kind][c] = { adaptive: ci(a), static: ci(n), gain: ci(a.map((x, i) => x - n[i])) };
	}
	console.log(`adaptation vs ${kind}: ${CHARS.map((c) => `${SHORT[c]} ${r3(out.adaptation[kind][c].gain.mean)}±${r3(out.adaptation[kind][c].gain.ci)}`).join(' ')}`);
}

// 4. Seat and role advantage among equal players (baseline in every seat).
{
	const rs = [];
	for (let t = 0; t < T; t++) rs.push(...[0, 1, 2].flatMap((s) => play(SEED + 3, 9000 + t, [base(), base(), base()], [0, 1, 2]).facts[s].rounds));
	out.roles = Object.fromEntries([5, 3, 2].map((q) => [q, ci(rs.filter((r) => r.quota === q).map((r) => r.diff))]));
	console.log(`role advantage (baseline everywhere): ${[5, 3, 2].map((q) => `${q}: ${r3(out.roles[q].mean)}±${r3(out.roles[q].ci)}`).join(' ')}`);
}
writeFileSync(`.sim/325/eval-${SEED}-p${PS}.json`, JSON.stringify(out, null, '\t'));
console.log(`325 eval: ${totals.rounds} rounds, ${totals.decisions} decisions, ${(totals.ms / 1000).toFixed(0)} s, ${(totals.ms / Math.max(totals.decisions, 1)).toFixed(2)} ms per decision`);
