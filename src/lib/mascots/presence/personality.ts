import type { Personality } from './types.js';

/** One character enabled for review. Later personalities share the same director/renderer. */
export const DHONI_PRESENCE: Readonly<Personality> = Object.freeze({
	id: 'dhoni-calm@2',
	noticeMs: [90, 240] as const,
	eyeMs: [150, 240] as const,
	headLagMs: [190, 330] as const,
	headMs: [440, 720] as const,
	holdMs: [950, 1700] as const,
	returnMs: [1000, 1550] as const,
	blinkGapMs: [3200, 7100] as const,
	blinkDurationMs: [135, 195] as const,
	idleGapMs: [6500, 13500] as const,
	breathPeriodMs: [5200, 7800] as const,
	headDegrees: 4,
	portraitTravel: 0.04,
	breathScale: 0.006,
	nodStrength: 0.3,
	browStrength: 0.28
});
export const DHONI_ART = Object.freeze({
	id: 'bot-ms-dhoni',
	name: 'MS Dhoni',
	atlas: '/mascots/bot-ms-dhoni/signature/directions.webp',
	cell: 4,
	mode: 'flattened-portrait' as const,
	capabilities: Object.freeze({
		eyes: false,
		eyelids: false,
		brows: false,
		isolatedHead: false,
		isolatedBody: false
	})
});
