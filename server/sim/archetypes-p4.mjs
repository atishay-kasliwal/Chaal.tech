import { genome, play, adversary } from './adversary.mjs';

/**
 * Human archetypes added in Phase 4 (brief §2), on the adversary genome (./adversary.mjs) with no
 * target: their triggers react to anyone at the table. Kept apart from ./archetypes.mjs so the
 * Phase 3 population (server/sim/evaluate.mjs POOL) and every earlier report reproduce unchanged.
 */
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
const BLUFFER = {
	look: 1,
	blindRaise: 0.2,
	call: 0.35,
	raise: 0.7,
	bluff: 0.8,
	fold: 0.5,
	folds: 0.8,
	show: 0.6
};
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

export const P4_ARCHETYPES = Object.freeze({
	'human-loose-passive': {
		expect: 'plays far too many hands but almost never raises; folds only sometimes',
		g: genome({
			look: 1,
			blindRaise: 0,
			call: 0.15,
			raise: 0.92,
			bluff: 0,
			fold: 0.2,
			folds: 0.5,
			show: 0.7
		})
	},
	'human-value': {
		expect: 'low-bluff value player: raises good hands, never bluffs, respects raises',
		g: genome(VALUE)
	},
	'human-blind-heavy': {
		expect: 'stays blind four rounds, some blind raises, then ordinary',
		g: genome({ look: 4, blindRaise: 0.15 })
	},
	'human-pressure-bully': {
		expect: 'solid, and raises at whoever looks weak',
		g: genome(play(), { afterWeak: 0.6 })
	},
	/** Scenario: Dhoni's style switcher B (aggressive, then tight value). */
	'human-switch-reverse': {
		scenario: true,
		expect: 'a maniac for 100 hands, then a tight value player',
		g: genome(MANIAC, { b: VALUE, switchAt: 100 })
	},
	/** Scenario: establish a pattern, then reverse it. */
	'human-deceptive': {
		scenario: true,
		expect: 'bluffs relentlessly for 50 hands, then value only',
		g: genome(BLUFFER, { b: VALUE, switchAt: 50 })
	},
	/** Scenario: a rock for comparison inside the same genome family. */
	'human-rock-p4': { scenario: true, expect: 'extreme rock', g: genome(ROCK) }
});

/** A fresh decider per seat (each has its own memory of the table). */
export const p4Decider = (id) => adversary(P4_ARCHETYPES[id].g, null);
export const P4_ARCHETYPE_IDS = Object.freeze(
	Object.keys(P4_ARCHETYPES).filter((id) => !P4_ARCHETYPES[id].scenario)
);
export const P4_SCENARIO_IDS = Object.freeze(
	Object.keys(P4_ARCHETYPES).filter((id) => P4_ARCHETYPES[id].scenario)
);
