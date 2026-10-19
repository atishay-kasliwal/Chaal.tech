import type { IdleReaction, Personality } from './types.js';

/** Public-event expression choices live with the personality, never in table UI. */
export const DHONI_REACTIONS: Personality['reactions'] = Object.freeze({
	PLAYER_RAISED: {
		variations: ['notice', 'consider'],
		roll: 0,
		lean: 0.18,
		brow: 0.55,
		mouth: -0.35
	},
	PLAYER_CALLED: {
		variations: ['acknowledge', 'quiet-attention'],
		attentionScale: 0.65,
		roll: 0,
		lean: 0.08,
		brow: 0.08,
		mouth: 0.12
	},
	PLAYER_FOLDED: {
		variations: ['release', 'back-to-table'],
		roll: 0,
		lean: -0.08,
		brow: -0.08,
		mouth: -0.12
	},
	BOT_TURN: {
		variations: ['settle-in', 'focus'],
		target: { x: 0, y: 0.45 },
		roll: 0,
		lean: 0.28,
		brow: 0.18,
		mouth: -0.45
	},
	BOT_WON: {
		variations: ['quiet-nod', 'small-lift'],
		target: { x: 0, y: 0.12 },
		roll: 0.24,
		lean: 0.12,
		brow: 0.35,
		mouth: 0.9
	},
	BOT_LOST: {
		variations: ['accept', 'release-tension'],
		target: { x: 0.12, y: 0.28 },
		roll: -0.24,
		lean: -0.2,
		brow: -0.28,
		mouth: -0.85
	},
	NEUTRAL: { variations: ['neutral'], target: { x: 0, y: 0 }, roll: 0, lean: 0, brow: 0, mouth: 0 }
});

export const DHONI_IDLES: readonly Readonly<IdleReaction>[] = Object.freeze([
	{ variations: ['pot-glance'], target: { x: 0, y: 0.23 }, roll: 0, lean: 0, brow: 0, mouth: 0 },
	{ variations: ['small-tilt'], target: { x: 0.2, y: 0 }, roll: 0.3, lean: 0, brow: 0, mouth: 0 },
	{ variations: ['settle'], target: { x: 0, y: 0.08 }, roll: 0, lean: -0.15, brow: 0, mouth: -0.1 },
	{ variations: ['look-away'], target: { x: -0.26, y: -0.06 }, roll: 0, lean: 0, brow: 0, mouth: 0 }
]);
