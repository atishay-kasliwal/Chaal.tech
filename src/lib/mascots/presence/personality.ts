import type { Personality } from './types.js';
import { DHONI_REACTIONS, DHONI_IDLES } from './reactions.ts';

/** One character enabled for review. Later personalities share the same director/renderer. */
export const DHONI_PRESENCE: Readonly<Personality> = Object.freeze({
	id: 'dhoni-calm@8',
	noticeMs: [90, 240] as const,
	eyeMs: [400, 600] as const,
	headLagMs: [190, 330] as const,
	headMs: [620, 900] as const,
	mouthLagMs: [90, 180] as const,
	mouthMs: [650, 900] as const,
	holdMs: [950, 1700] as const,
	returnMs: [1000, 1550] as const,
	blinkGapMs: [6000, 10500] as const,
	blinkDurationMs: [450, 650] as const,
	doubleBlinkChance: 0,
	idleGapMs: [6500, 13500] as const,
	breathPeriodMs: [5200, 7800] as const,
	// Head follows gaze; only the isolated shirt receives the breathing channel.
	headDegrees: 2.2,
	portraitTravel: 0,
	breathScale: 0.009,
	nodStrength: 0,
	browStrength: 0.28,
	mouthStrength: 0.85,
	reactions: DHONI_REACTIONS,
	idles: DHONI_IDLES
});
export const DHONI_ART = Object.freeze({
	id: 'bot-ms-dhoni',
	name: 'MS Dhoni',
	atlas: '/mascots/bot-ms-dhoni/signature/directions.webp',
	portrait: '/prototypes/dhoni-parts/portrait-v1.webp',
	cell: 4,
	mode: 'facial-parts' as const,
	capabilities: Object.freeze({
		eyes: true,
		eyelids: true,
		brows: true,
		mouthPoses: true,
		boundedDepthTurn: true,
		isolatedHead: true,
		isolatedBody: true
	})
});
