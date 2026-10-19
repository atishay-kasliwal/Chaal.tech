import type { MotionChannels, Personality } from './types.js';

/** Jaw separation is registered against the approved, unchanged center portrait.
 * Head/hair pixels remain the original artwork; only the hidden neck is repainted. */
export const DHONI_HEAD = {
	neck: '/prototypes/dhoni-parts/neck-v1.webp',
	outline: 'M70 20 H290 V175 H238 C233 195 213 221 180 221 C149 221 126 201 122 175 H70 Z',
	pivot: [180, 209],
	neckTarget: [146, 170, 70, 59],
	neckSource: [128, 162, 85, 70],
	travel: [1.8, 1.6],
	maxRoll: 2.5,
	gazeCompensation: 0.2
} as const;

const finite = (v: number) => (Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Isolated head tilt/translation, not perspective yaw or whole-portrait movement. */
export function headPose(
	frame: Pick<MotionChannels, 'head' | 'eyes' | 'roll'>,
	personality: Pick<Personality, 'headDegrees'>
) {
	const x = finite(frame.head.x),
		y = finite(frame.head.y);
	return {
		x: x * DHONI_HEAD.travel[0],
		y: y * DHONI_HEAD.travel[1],
		roll:
			finite(x + finite(frame.roll)) *
			Math.min(
				DHONI_HEAD.maxRoll,
				Number.isFinite(personality.headDegrees) ? Math.max(0, personality.headDegrees) : 0
			),
		eyes: {
			x: finite(frame.eyes.x - x * DHONI_HEAD.gazeCompensation),
			y: finite(frame.eyes.y - y * DHONI_HEAD.gazeCompensation)
		}
	};
}
