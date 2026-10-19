import type { MotionChannels } from './types.js';

/** Real painted closed-mouth poses, softly blended over the original mouth only.
 * These are expression poses, not speech visemes or a claimed deformable mouth mesh. */
export const DHONI_MOUTH = {
	target: [146, 161, 70, 34],
	source: [145, 161, 70, 34],
	smile: '/prototypes/dhoni-parts/mouth-smile-v1.webp',
	composed: '/prototypes/dhoni-parts/mouth-composed-v1.webp'
} as const;

export function mouthPose(frame: Pick<MotionChannels, 'mouth'>) {
	const amount = Number.isFinite(frame.mouth) ? Math.max(-1, Math.min(1, frame.mouth)) : 0;
	return { smile: Math.max(0, amount), composed: Math.max(0, -amount) };
}
