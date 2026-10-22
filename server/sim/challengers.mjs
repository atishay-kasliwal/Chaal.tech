import { CANONICAL_STYLES } from '../bots/dna-styles.mjs';
import { styleConfigHash } from '../bots/identity.mjs';
import { CHARACTER_POLICY_V6 } from '../bots/character-v6.mjs';
import { CHARACTER_POLICY_V7 } from '../bots/character-v7.mjs';
import { CHARACTER_POLICY_V8, CHARACTER_POLICY_V9 } from '../bots/character-v8.mjs';

/**
 * Phase 4 challengers (brief §12): a champion plus the smallest stated change, never a broad
 * mutation. A challenger is an unpublished style with its champion, the change in words, and its
 * configuration hash. Offline only until a reviewer approves one.
 */
export function challenger(
	character,
	id,
	{ policy = CHARACTER_POLICY_V6, dna = {}, addQuirks = [], change, target = null }
) {
	const champion = CANONICAL_STYLES[character];
	const quirks = [
		...champion.tendencies.quirks.filter((q) => !addQuirks.some((a) => a.id === q.id)),
		...addQuirks
	].map((q) => ({ ...q }));
	const config = {
		policy,
		tendencies: {
			dna: { ...champion.tendencies.dna, ...dna },
			quirks,
			tempo: { ...champion.tendencies.tempo }
		},
		supportedGames: ['teen-patti']
	};
	return {
		id,
		character,
		champion: champion._id,
		change,
		// What it must fix (the exploit gate): { kind: 'event' | 'adapt' | 'exploit', ... }.
		target,
		style: Object.freeze({
			_id: id,
			botId: character,
			status: 'challenger',
			champion: champion._id,
			...config,
			configHash: styleConfigHash(config)
		})
	};
}

/** Samay's event-reaction challengers (brief §9): only the event mechanism differs from the champion. */
export const SAMAY_CHALLENGERS = Object.freeze(
	[
		['q060', [{ id: 'remembersYou', strength: 0.6 }], 'opponent-specific call-down quirk at 0.6'],
		['q100', [{ id: 'remembersYou', strength: 1 }], 'opponent-specific call-down quirk at 1.0'],
		['q125', [{ id: 'remembersYou', strength: 1.25 }], 'opponent-specific call-down quirk at 1.25'],
		['q150', [{ id: 'remembersYou', strength: 1.5 }], 'opponent-specific call-down quirk at 1.5'],
		[
			'r060',
			[{ id: 'remembersYouRead', strength: 0.6 }],
			'the same memory as a read about that raiser, 0.6'
		],
		[
			'r100',
			[{ id: 'remembersYouRead', strength: 1 }],
			'the same memory as a read about that raiser, 1.0'
		],
		[
			'r150',
			[{ id: 'remembersYouRead', strength: 1.5 }],
			'the same memory as a read about that raiser, 1.5'
		],
		[
			'g100',
			[
				{ id: 'stubbornStreak', strength: 1 },
				{ id: 'onToYou', strength: 1 }
			],
			'Phase 3.1 global event quirks at 1.0, on the champion policy'
		],
		[
			'm100',
			[
				{ id: 'remembersYouRead', strength: 1 },
				{ id: 'stubbornStreak', strength: 1 }
			],
			'read-based memory 1.0 plus digging in after a big loss 1.0'
		]
	].map(([tag, addQuirks, change]) =>
		challenger('samay-raina', `samay-raina@6-${tag}`, {
			addQuirks,
			change,
			target: { kind: 'event' }
		})
	)
);

/** Dhoni's challenger (Phase 4 exploit search): only the cost of staying blind is new. */
export const DHONI_CHALLENGERS = Object.freeze([
	challenger('ms-dhoni', 'ms-dhoni@7-blindcost', {
		policy: CHARACTER_POLICY_V7,
		change: 'tp-dna@3 plus a base factor: looking gets more attractive as the blind stake climbs',
		target: { kind: 'exploit', x: 'always-raise' }
	})
]);

/** Dhoni Phase 4.1: only repeated BLIND raises add pressure to look; seen aggression adds none. */
export const DHONI41_CHALLENGERS = Object.freeze([
	challenger('ms-dhoni', 'ms-dhoni@8-blindraises', {
		policy: CHARACTER_POLICY_V8,
		change: 'tp-dna@3 plus: from the second blind raiser still in, +0.2 to look each (cap 0.6)',
		target: { kind: 'exploit', x: 'always-raise' }
	}),
	challenger('ms-dhoni', 'ms-dhoni@9-blindcost', {
		policy: CHARACTER_POLICY_V9,
		change:
			'tp-dna@3 plus: each blind raiser still in adds pressure to look, by the stake (cap 0.6)',
		target: { kind: 'exploit', x: 'always-raise' }
	})
]);

/** Challenger sets by name (scripts/sim/phase4.mjs gates --set <name>). */
export const CHALLENGER_SETS = {
	samay: SAMAY_CHALLENGERS,
	dhoni: DHONI_CHALLENGERS,
	dhoni41: DHONI41_CHALLENGERS
};
