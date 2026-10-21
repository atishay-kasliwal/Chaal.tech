/**
 * Character target bands (BOT_BRAIN.md §29, Phase 3): for each character, the region of believable
 * behaviour it should occupy, as ranges (never exact values), each with the reason it describes
 * that character. Measured in the Phase 3 population (server/sim/evaluate.mjs `measure`).
 *
 * Bands are judged per candidate: a measurement inside its band passes; outside, the miss is the
 * distance to the band in units of the band's scale. `core` bands are the identity itself: a
 * candidate far outside one is rejected whatever else it does. There is no universal reward: each
 * character has its own list, and competence is compared separately (paired with the ancestor).
 *
 * Population references (Phase 3 baseline, seed 31, all opponents pooled) are noted where useful.
 */
export const TARGETS_VERSION = 'targets@1';

const band = (key, min, max, why, { core = false, scale = null } = {}) => ({
	key,
	min,
	max,
	why,
	core,
	scale
});

export const TARGETS = Object.freeze({
	'rohit-sharma': [
		band(
			'blindRounds',
			1.4,
			2.2,
			'Blind King: stays blind far longer than anyone (population about 0.8 blind bets a hand; v3 1.59).',
			{ core: true, scale: 0.3 }
		),
		band(
			'blindRaiseRate',
			0.25,
			0.45,
			'Comfortable applying pressure blind (v3 43%), but not a blind-raising caricature.',
			{ core: true }
		),
		band(
			'neverLooked',
			0.03,
			0.15,
			'Occasionally refuses to look at all, out of pride; still looks when it matters.'
		),
		band(
			'blindWinBlindRaiseDeltaX',
			0.03,
			0.4,
			'A blind win makes him bolder blind in the next hands, beyond what any player shows after a win.',
			{ scale: 0.03 }
		),
		band(
			'seenRaiseRate',
			0.15,
			0.3,
			'Once he looks he plays a normal, slightly loose game: not a second maniac.'
		),
		band(
			'badActionRate',
			0,
			0.03,
			'Blind play is a style, not an excuse for bad seen decisions (v3 0.6%).'
		),
		band('bigOverrideRate', 0, 0.05, 'Personality rarely overrules clear card evidence.'),
		band('entropy', 0.55, 1.5, 'Varied enough to feel human.')
	],
	'virat-kohli': [
		band('seenRaiseRate', 0.35, 0.6, 'Maniac: raises more than anyone once he has seen (v3 40%).', {
			core: true
		}),
		band(
			'thinRaise',
			0.15,
			0.4,
			'Bluffs, raising without the goods, more than everyone else (v3 21%; next highest about 6%).',
			{ core: true }
		),
		band('aggression', 1.2, 3, 'Raises far more often than he calls.', { scale: 0.3 }),
		band('blindRaiseRate', 0.12, 0.35, 'Creates pressure blind too, but less than the Blind King.'),
		band(
			'lossAggressionDeltaX',
			0.4,
			3,
			'Emotional: painful losses make him hotter, well beyond any table effect.',
			{ scale: 0.2 }
		),
		band(
			'weakCallRate',
			0,
			0.04,
			'Controlled chaos: he raises junk sometimes but does not call off chips with it.'
		),
		band('strongPackRate', 0, 0.01, 'Never throws away strong hands.'),
		band(
			'bigOverrideRate',
			0,
			0.09,
			'Overplays marginal spots, but rarely overrides clear evidence (v3 10%: slightly too reckless).'
		),
		band('badActionRate', 0, 0.04, 'Loses some value to personality, not to nonsense.'),
		band('entropy', 0.55, 1.5, 'Volatile, never mechanical.')
	],
	gg: [
		band(
			'stayAfterSeeing',
			0.2,
			0.35,
			'Rock: continues after looking far less often than others (population about 0.45).',
			{ core: true }
		),
		band(
			'continueMid',
			0,
			0.08,
			'Enters few marginal situations: a third to two thirds of a fair share is a pack.',
			{ core: true }
		),
		band('thinRaise', 0, 0.03, 'Rarely bluffs, so his aggression means something.'),
		band('valueRaise', 0.45, 1, 'Still raises excellent hands for value.'),
		band('monsterNoRaiseRate', 0, 0.04, 'Does not slow-play monsters into nothing.'),
		band(
			'strongPackRate',
			0,
			0.03,
			'Selective, not a bot that simply folds: strong hands are played (v3 4%).'
		),
		band(
			'seenFoldToRaise',
			0.12,
			0.4,
			'Respects pressure: a raise against him means something (v3 8%, too sticky for a rock).'
		),
		band(
			'lossPackDeltaX',
			0.015,
			0.3,
			'Tightens when uncomfortable, beyond the table effect of being short after a loss.',
			{ scale: 0.015 }
		),
		band('lookAtOnce', 0.35, 0.8, 'Usually looks early, not mechanically at once.'),
		band('badActionRate', 0, 0.03, 'Disciplined: few bad actions.'),
		band('entropy', 0.3, 1.2, 'Selective, but not a deterministic robot.')
	],
	'samay-raina': [
		band(
			'continueMid',
			0.65,
			1,
			'Calling Station: with a third to two thirds of a fair share he keeps going (v3 70%).',
			{ core: true }
		),
		band('seenFoldToRaise', 0, 0.05, 'Hates folding once involved.', { core: true }),
		band('showRate', 0.25, 0.7, 'Wants to see what you have: asks for the show.'),
		band('seenRaiseRate', 0, 0.1, 'A caller, not a raiser.'),
		band('monsterNoRaiseRate', 0, 0.05, 'Still raises his monsters (v3 5.7%).'),
		band(
			'continueWeak',
			0,
			0.05,
			'Curious persistence, not passive stupidity: hopeless hands still go.'
		),
		band(
			'lossPackDeltaX',
			-0.3,
			-0.015,
			'Reacts to a painful loss by getting even more stubborn (v3 shows no reaction).',
			{ scale: 0.015 }
		),
		band(
			'caughtBluffFoldDeltaX',
			-0.5,
			-0.01,
			'Catching a bluff makes him call down even more afterwards (v3 shows no reaction).',
			{ scale: 0.01 }
		),
		band('badActionRate', 0, 0.03, 'Pays people off sometimes, by character; not constantly.')
	],
	'ms-dhoni': [
		band(
			'bluffIndex',
			0.1,
			0.4,
			'Adaptive Shark: bluffs players who give up too much far more than players who call, but selectively (v3 49% more).',
			{ core: true }
		),
		band('bluffGrowth', 0.05, 0.4, 'The bluffing against folders grows as evidence accumulates.'),
		band('bluffVsCallerLate', 0, 0.02, 'Stops bluffing players who call too much.'),
		band(
			'valueGrowthVsCaller',
			0,
			0.5,
			'Value bets more against a calling station as he learns it.',
			{ scale: 0.02 }
		),
		band(
			'callIndex',
			-0.03,
			0.3,
			'Folds no more to a maniac than to raises in general: their aggression carries less information. Not core: late seen spots against a maniac are few, so the index is noisy (with a 0.02 scale the ancestor DNA was rejected on noise alone; on 24 tables @3 measures +0.03 and v4 -0.01).',
			{ scale: 0.05 }
		),
		band(
			'blindFoldVsManiacLate',
			0,
			0.05,
			'Does not give up unseen cards to a maniac: looks instead.'
		),
		band('aggression', 0.5, 1.2, 'Starts balanced: neither passive nor a maniac.', { scale: 0.2 }),
		band(
			'blindRounds',
			0.7,
			1.2,
			'Ordinary blind play: his identity is adaptation, not a static gimmick.',
			{ scale: 0.2 }
		),
		band('showRate', 0.15, 0.5, 'Finishes hands calmly.'),
		band('badActionRate', 0, 0.02, 'The strongest character: fewest bad actions.')
	]
});

/** Judge measurements against a character's bands. */
export function judgeBands(character, m) {
	const results = TARGETS[character].map((b) => {
		const v = m[b.key];
		if (v === null || v === undefined || Number.isNaN(v))
			return {
				key: b.key,
				value: null,
				pass: false,
				miss: 1,
				core: b.core,
				min: b.min,
				max: b.max
			};
		const scale = b.scale ?? Math.max(b.max - b.min, 0.05);
		const out = v < b.min ? b.min - v : v > b.max ? v - b.max : 0;
		return {
			key: b.key,
			value: v,
			pass: out === 0,
			miss: out / scale,
			core: b.core,
			min: b.min,
			max: b.max
		};
	});
	return {
		results,
		passed: results.filter((r) => r.pass).length,
		// Violation: summed misses (capped at 3 each), core bands counted double.
		violation: results.reduce((s, r) => s + Math.min(r.miss, 3) * (r.core ? 2 : 1), 0)
	};
}
