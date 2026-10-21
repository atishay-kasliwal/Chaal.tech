import { situation, candidates, move, strength, forcedMove } from '../bots/brain.mjs';

/**
 * Baseline opponents for simulation only (never seated in a real room). Simple, fixed rules on the
 * shared base brain, so they are independent of the character policy they help measure. Each
 * reports one-hot (or uniform) probabilities so entropy is defined for them.
 */

export function wrap(rule) {
	return (view, botId, random) => {
		const sit = situation(view, botId);
		const forced = forcedMove(sit, random);
		if (forced) return forced;
		if (!sit.myTurn) return null;
		const cands = candidates(sit);
		const pick = rule(sit, cands, random);
		const probs = pick.probs ?? { [pick.name]: 1 };
		return { ...move(sit, pick.name), reason: pick.reason, trace: { probs } };
	};
}

export const has = (cands, name) => cands.includes(name);

export const BASELINES = Object.freeze({
	/** Uniform over legal candidates. */
	'baseline-random': wrap((sit, cands, random) => ({
		name: cands[Math.floor(random() * cands.length)],
		reason: 'random',
		probs: Object.fromEntries(cands.map((c) => [c, 1 / cands.length]))
	})),
	/** Looks at once, plays only good hands, raises only very good ones. */
	'baseline-rock': wrap((sit, cands, random) => {
		if (!sit.seen)
			return has(cands, 'see')
				? { name: 'see', reason: 'see' }
				: { name: has(cands, 'chaal') ? 'chaal' : 'pack', reason: 'blind' };
		const s = strength(sit, random).multi;
		if (has(cands, 'show') && s >= 0.6) return { name: 'show', reason: 'strong' };
		if (s >= 0.75 && has(cands, 'raise')) return { name: 'raise', reason: 'strong' };
		if (s >= 0.5 && has(cands, 'chaal')) return { name: 'chaal', reason: 'good' };
		return { name: 'pack', reason: 'weak' };
	}),
	/** Looks after one blind round, then calls everything; shows heads-up after four rounds. */
	'baseline-station': wrap((sit, cands) => {
		if (!sit.seen && has(cands, 'see') && sit.rounds >= 1) return { name: 'see', reason: 'see' };
		if (has(cands, 'show') && sit.rounds >= 4) return { name: 'show', reason: 'curious' };
		if (has(cands, 'chaal')) return { name: 'chaal', reason: 'call' };
		return { name: has(cands, 'show') ? 'show' : 'pack', reason: 'forced' };
	}),
	/** Raises blind for two rounds, then raises almost everything. */
	'baseline-aggressive': wrap((sit, cands, random) => {
		if (!sit.seen) {
			if (has(cands, 'see') && sit.rounds >= 2) return { name: 'see', reason: 'see' };
			return {
				name: has(cands, 'raise') ? 'raise' : has(cands, 'chaal') ? 'chaal' : 'pack',
				reason: 'pressure'
			};
		}
		const s = strength(sit, random).multi;
		if (s < 0.12) return { name: has(cands, 'chaal') ? 'chaal' : 'pack', reason: 'slow' };
		return {
			name: has(cands, 'raise') ? 'raise' : has(cands, 'chaal') ? 'chaal' : 'pack',
			reason: 'pressure'
		};
	})
});
