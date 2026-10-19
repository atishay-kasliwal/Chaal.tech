import type { MotionChannels } from './types.js';

/** The approved shirt expands around its lower edge. Head and neck stay independent.
 * At maximum inhale the shoulder rises less than 0.5px on the 360px source canvas. */
export const DHONI_BODY = {
	pivot: [180, 248],
	maxBreathScale: 0.009,
	widthRatio: 0.2
} as const;

export function bodyPose(frame: Pick<MotionChannels, 'breath'>) {
	const amount = Number.isFinite(frame.breath)
		? Math.max(0, Math.min(DHONI_BODY.maxBreathScale, frame.breath))
		: 0;
	return { scaleX: 1 + amount * DHONI_BODY.widthRatio, scaleY: 1 + amount };
}
