import { situation, candidates, move, strength, forcedMove } from '../bots/brain.mjs';

/**
 * Phase 4 adversaries: opponent strategies built to find out how a champion can be beaten.
 * Simulation only, never seated in a room, never colluding: each copy decides alone, from its own
 * projection (the public table plus its own cards) and its own record of what it has seen, exactly
 * what a person in that seat could know. Every strategy is a small genome of readable numbers, so
 * a strategy that hurts a bot can be read back as a sentence (describe below).
 *
 * Genome (all rates in [0, 1]):
 *  - a, b: two ways of playing, each { look, blindRaise, call, raise, bluff, fold, folds, show }
 *    look: blind rounds before looking; blindRaise: chance of a blind raise;
 *    call / raise / show: hand strength (chance to beat everyone still in) needed to call, to raise
 *    for value, to ask for a show; bluff: chance of raising a hand below `call`;
 *    fold, folds: facing pressure, a hand below `fold` is packed with chance `folds`.
 *  - switchAt: from this hand of the session on, play `b` (200 or more: never). period: if set,
 *    alternate between `a` and `b` every `period` hands instead.
 *  - triggers, read only from public information about the target (or about anyone, with no
 *    target): afterWeak (extra raise chance when the target looks weak: packed last hand, or only
 *    calling after looking), afterLoss (for three hands after the target lost 20 boots or more in a
 *    hand), vsShort (when the target holds under 40% of the others' average stack).
 */
export const ADVERSARY_VERSION = 'adv@1';
export const BIG_LOSS = 20;

const PLAY_GENES = ['look', 'blindRaise', 'call', 'raise', 'bluff', 'fold', 'folds', 'show'];
const TRIGGERS = ['afterWeak', 'afterLoss', 'vsShort'];
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const r2 = (x) => Math.round(x * 100) / 100;

export const play = (over = {}) => ({
	look: 1,
	blindRaise: 0.1,
	call: 0.35,
	raise: 0.75,
	bluff: 0.05,
	fold: 0.5,
	folds: 0.8,
	show: 0.6,
	...over
});
export const genome = (a, over = {}) => ({
	a: play(a),
	b: play(over.b ?? a),
	switchAt: 200,
	period: 0,
	afterWeak: 0,
	afterLoss: 0,
	vsShort: 0,
	...over,
	...(over.b ? { b: play(over.b) } : {})
});

const has = (cands, n) => cands.includes(n);
const pick = (cands, ...names) => names.find((n) => has(cands, n)) ?? cands[0];

/** A decider for one seat. `targetId` is the bot id of the player under study (or null). */
export function adversary(g, targetId = null) {
	const mem = { hand: null, n: -1, start: {}, packed: {}, lostAt: {}, packedPrev: {} };
	const observe = (view) => {
		const users = view.usersList;
		if (view.handId !== mem.hand) {
			// A new hand: settle the last one from public balances (what each player had before
			// the boot then, against what they have before the boot now).
			for (const u of users) {
				const now = (u.balance ?? 0) + (u.handBet ?? 0);
				const before = mem.start[u.id];
				if (before != null && before - now >= BIG_LOSS * Math.max(view.boot ?? 1, 1))
					mem.lostAt[u.id] = mem.n;
				mem.start[u.id] = now;
				mem.packedPrev[u.id] = !!mem.packed[u.id];
				mem.packed[u.id] = false;
			}
			mem.hand = view.handId;
			mem.n++;
		}
		for (const u of users) if (u.isPacked) mem.packed[u.id] = true;
	};
	return (view, botId, random) => {
		const sit = situation(view, botId);
		const forced = forcedMove(sit, random);
		if (forced) return forced;
		if (!sit.myTurn) return null;
		observe(view);
		const cands = candidates(sit);
		const p =
			g.period > 0
				? Math.floor(mem.n / g.period) % 2
					? g.b
					: g.a
				: mem.n >= g.switchAt
					? g.b
					: g.a;
		const pickMove = () => {
			// Triggers: extra pressure on a target that looks weak, just lost big, or is short.
			const targets = sit.opponents.filter((u) => !targetId || u.id === targetId);
			if (targets.length && has(cands, 'raise')) {
				const others = view.usersList.filter((u) => u.id !== botId && u.balance != null);
				const avg = others.reduce((s, u) => s + u.balance, 0) / Math.max(others.length, 1);
				let boost = 0;
				const why = [];
				const weak = targets.some(
					(u) => mem.packedPrev[u.id] || (!u.isBlind && (u.handBet ?? 0) <= (sit.me.handBet ?? 0))
				);
				if (g.afterWeak && weak) ((boost += g.afterWeak), why.push('after-weak'));
				const lost = targets.some((u) => mem.lostAt[u.id] != null && mem.n - mem.lostAt[u.id] <= 3);
				if (g.afterLoss && lost) ((boost += g.afterLoss), why.push('after-loss'));
				const short = targets.some((u) => (u.balance ?? 0) < 0.4 * avg);
				if (g.vsShort && short) ((boost += g.vsShort), why.push('vs-short'));
				if (boost > 0 && random() < Math.min(1, boost)) return { name: 'raise', reason: why[0] };
			}
			if (!sit.seen) {
				if (has(cands, 'see') && sit.rounds >= p.look) return { name: 'see', reason: 'look' };
				if (random() < p.blindRaise && has(cands, 'raise'))
					return { name: 'raise', reason: 'blind-raise' };
				return { name: pick(cands, 'chaal', 'see', 'pack'), reason: 'blind' };
			}
			const s = strength(sit, random).multi;
			if (has(cands, 'show') && s >= p.show) return { name: 'show', reason: 'show' };
			if (s >= p.raise && has(cands, 'raise')) return { name: 'raise', reason: 'value' };
			if (s < p.call && random() < p.bluff && has(cands, 'raise'))
				return { name: 'raise', reason: 'bluff' };
			if (sit.seenBetters > 0 && s < p.fold && random() < p.folds)
				return { name: 'pack', reason: 'respect' };
			if (s >= p.call && has(cands, 'chaal')) return { name: 'chaal', reason: 'call' };
			return { name: has(cands, 'pack') ? 'pack' : cands[0], reason: 'weak' };
		};
		const choice = pickMove();
		return {
			...move(sit, choice.name),
			reason: choice.reason,
			trace: { probs: { [choice.name]: 1 } }
		};
	};
}

/* ---------------------------------------- fixed suite ---------------------------------------- */

const ROCK = {
	look: 0,
	blindRaise: 0,
	call: 0.6,
	raise: 0.88,
	bluff: 0,
	fold: 0.78,
	folds: 0.95,
	show: 0.7
};
const MANIAC = {
	look: 2,
	blindRaise: 0.8,
	call: 0.08,
	raise: 0.18,
	bluff: 0.6,
	fold: 0,
	folds: 0,
	show: 0.75
};
const VALUE = {
	look: 1,
	blindRaise: 0,
	call: 0.42,
	raise: 0.68,
	bluff: 0,
	fold: 0.55,
	folds: 0.9,
	show: 0.6
};
const BLUFFER = {
	look: 1,
	blindRaise: 0.2,
	call: 0.35,
	raise: 0.7,
	bluff: 0.55,
	fold: 0.5,
	folds: 0.9,
	show: 0.6
};

/**
 * The fixed exploit suite (Phase 4 brief §5): simple strategies, each one idea. Evaluation
 * opponents only. Targeted ones press the player under study, reading only public information.
 */
export const EXPLOITS = Object.freeze({
	'always-raise': {
		says: 'raises whenever a raise is legal, blind or seen',
		g: genome({
			look: 3,
			blindRaise: 1,
			call: 0,
			raise: 0,
			bluff: 1,
			fold: 0,
			folds: 0,
			show: 0.95
		})
	},
	'raise-often': {
		says: 'raises very often: most blind bets and any half-decent seen hand, many bluffs',
		g: genome({
			look: 2,
			blindRaise: 0.6,
			call: 0.15,
			raise: 0.3,
			bluff: 0.6,
			fold: 0.1,
			folds: 0.5,
			show: 0.8
		})
	},
	'never-raise': {
		says: 'almost never raises: calls decent hands, raises only near-certain winners',
		g: genome({
			look: 1,
			blindRaise: 0,
			call: 0.35,
			raise: 0.97,
			bluff: 0,
			fold: 0.4,
			folds: 0.6,
			show: 0.6
		})
	},
	'call-everything': {
		says: 'calls nearly everything, never folds to pressure, shows late',
		g: genome({
			look: 1,
			blindRaise: 0,
			call: 0,
			raise: 0.95,
			bluff: 0,
			fold: 0,
			folds: 0,
			show: 0.9
		})
	},
	'fold-a-lot': {
		says: 'looks at once and folds anything short of a strong hand, especially to a raise',
		g: genome({ ...ROCK, call: 0.65, fold: 0.85, folds: 1 })
	},
	'bluff-a-lot': {
		says: 'ordinary values, but bluff-raises most weak hands',
		g: genome({ ...BLUFFER, bluff: 0.8, folds: 0.7 })
	},
	'never-bluff': {
		says: 'value only: raises good hands, never raises a weak one',
		g: genome(VALUE)
	},
	'stay-blind': {
		says: 'stays blind for five rounds, sometimes raising blind',
		g: genome({ look: 5, blindRaise: 0.25, call: 0.35, raise: 0.75, bluff: 0.05 })
	},
	'pressure-weakness': {
		says: 'solid player who raises at the target whenever it looks weak',
		g: genome(play(), { afterWeak: 0.7 })
	},
	'pressure-after-loss': {
		says: 'solid player who attacks the target for three hands after it loses a big pot',
		g: genome(play(), { afterLoss: 0.8 })
	},
	'attack-short': {
		says: 'solid player who raises at the target whenever its stack is short',
		g: genome(play(), { vsShort: 0.8 })
	},
	alternate: {
		says: 'alternates every 10 hands between a maniac and a rock',
		g: genome(MANIAC, { b: ROCK, period: 10 })
	},
	'sudden-change': {
		says: 'rock for 60 hands, then a maniac',
		g: genome(ROCK, { b: MANIAC, switchAt: 60 })
	},
	'loose-then-value': {
		says: 'hyper-aggressive bluffer for 40 hands to build a loose image, then value only',
		g: genome(MANIAC, { b: VALUE, switchAt: 40 })
	},
	'value-then-bluff': {
		says: 'value only for 60 hands to build a tight image, then bluffs relentlessly',
		g: genome(VALUE, { b: { ...BLUFFER, bluff: 0.8 }, switchAt: 60 })
	}
});

/* ------------------------------------------- search ------------------------------------------- */

const RANGES = {
	look: [0, 5],
	blindRaise: [0, 1],
	call: [0, 0.8],
	raise: [0.1, 1],
	bluff: [0, 1],
	fold: [0, 0.9],
	folds: [0, 1],
	show: [0.3, 1]
};

/** A random genome: the search's generation 0 also starts from every fixed strategy. */
export function randomGenome(random) {
	const side = () =>
		Object.fromEntries(
			PLAY_GENES.map((k) => {
				const [lo, hi] = RANGES[k];
				const v = lo + random() * (hi - lo);
				return [k, k === 'look' ? Math.round(v) : r2(v)];
			})
		);
	const mode = random();
	return {
		a: side(),
		b: side(),
		switchAt: mode < 0.5 ? 200 : Math.round(20 + random() * 60),
		period: mode > 0.8 ? Math.round(5 + random() * 30) : 0,
		afterWeak: random() < 0.4 ? r2(random()) : 0,
		afterLoss: random() < 0.4 ? r2(random()) : 0,
		vsShort: random() < 0.3 ? r2(random()) : 0
	};
}

/** Change one to three genes a little (or a schedule). */
export function mutateGenome(g, random) {
	const out = structuredClone(g);
	const n = 1 + Math.floor(random() * 3);
	for (let i = 0; i < n; i++) {
		const r = random();
		if (r < 0.7) {
			const side = random() < 0.5 || out.switchAt >= 200 ? 'a' : 'b';
			const k = PLAY_GENES[Math.floor(random() * PLAY_GENES.length)];
			const [lo, hi] = RANGES[k];
			const step = (hi - lo) * 0.2 * (random() * 2 - 1);
			out[side][k] =
				k === 'look'
					? clamp(Math.round(out[side][k] + step * 2), lo, hi)
					: r2(clamp(out[side][k] + step, lo, hi));
			if (out.switchAt >= 200 && !out.period) out.b = { ...out.a };
		} else if (r < 0.9) {
			const k = TRIGGERS[Math.floor(random() * TRIGGERS.length)];
			out[k] = r2(clamp(out[k] + 0.3 * (random() * 2 - 1)));
		} else if (out.period)
			out.period = Math.round(clamp(out.period + 10 * (random() * 2 - 1), 4, 60));
		else
			out.switchAt = Math.round(
				clamp(out.switchAt >= 200 ? 100 : out.switchAt + 40 * (random() * 2 - 1), 10, 200)
			);
	}
	return out;
}

export function crossGenomes(x, y, random) {
	const out = structuredClone(random() < 0.5 ? x : y);
	const other = out === x ? y : x;
	for (const side of ['a', 'b'])
		for (const k of PLAY_GENES) if (random() < 0.5) out[side][k] = other[side][k];
	for (const k of TRIGGERS) if (random() < 0.5) out[k] = other[k];
	return out;
}

/* ------------------------------------------ describe ------------------------------------------ */

const pct = (x) => `${Math.round(x * 100)}%`;
function describePlay(p) {
	const parts = [];
	parts.push(
		p.look === 0 ? 'looks at once' : `looks after ${p.look} blind round${p.look > 1 ? 's' : ''}`
	);
	if (p.blindRaise >= 0.05) parts.push(`raises ${pct(p.blindRaise)} of blind bets`);
	parts.push(p.call <= 0.05 ? 'calls with anything' : `calls with a ${pct(p.call)}+ chance to win`);
	parts.push(
		p.raise >= 0.95 ? 'almost never raises for value' : `raises for value from ${pct(p.raise)}`
	);
	if (p.bluff >= 0.05) parts.push(`bluff-raises ${pct(p.bluff)} of weak hands`);
	if (p.folds >= 0.05 && p.fold >= 0.05)
		parts.push(`facing pressure folds hands under ${pct(p.fold)} (${pct(p.folds)} of the time)`);
	else parts.push('never folds to pressure');
	return parts.join(', ');
}

/** The strategy as one or two sentences: what a player would have to do to repeat it. */
export function describe(g, target = 'the target') {
	const sameSides = JSON.stringify(g.a) === JSON.stringify(g.b);
	let s;
	if (g.period > 0 && !sameSides)
		s = `Alternates every ${g.period} hands between (1) ${describePlay(g.a)} and (2) ${describePlay(g.b)}.`;
	else if (g.switchAt < 200 && !sameSides)
		s = `For ${g.switchAt} hands ${describePlay(g.a)}; then ${describePlay(g.b)}.`;
	else s = `${describePlay(g.a)[0].toUpperCase()}${describePlay(g.a).slice(1)}.`;
	const t = [];
	if (g.afterWeak >= 0.05)
		t.push(`raises at ${target} ${pct(g.afterWeak)} of the time when ${target} looks weak`);
	if (g.afterLoss >= 0.05)
		t.push(`${pct(g.afterLoss)} for three hands after ${target} loses a big pot`);
	if (g.vsShort >= 0.05) t.push(`${pct(g.vsShort)} when ${target} is short-stacked`);
	if (t.length) s += ` Extra pressure: ${t.join('; ')}.`;
	return s;
}
