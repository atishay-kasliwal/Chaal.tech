import type { PresenceFrame } from './types.js';

/** Measured artwork registration in the approved 360px portrait canvas. */
export const DHONI_EYES = {
	clean: '/prototypes/dhoni-parts/clean-v1.webp',
	closed: '/prototypes/dhoni-parts/lids-v1.webp',
	cleanPatches: [
		{ target: [132, 101, 49, 55], source: [122, 103, 58.5, 65.8] },
		{ target: [182, 101, 49, 55], source: [181, 103, 58.5, 65.8] }
	],
	eyes: [
		{
			irisAsset: '/prototypes/dhoni-parts/iris-left-v1.webp',
			browAsset: '/prototypes/dhoni-parts/brow-left-v1.webp',
			center: [156.5, 134],
			aperture: [139, 121.5, 33, 25.5],
			iris: [149.5, 122.75, 14, 16.5],
			irisSource: [223, 463, 326, 326],
			brow: [136, 110, 43, 11.5],
			browSource: [113, 561, 459, 133]
		},
		{
			irisAsset: '/prototypes/dhoni-parts/iris-right-v1.webp',
			browAsset: '/prototypes/dhoni-parts/brow-right-v1.webp',
			center: [206, 134],
			aperture: [189, 121.5, 33, 25.5],
			iris: [199, 122.75, 14, 16.5],
			irisSource: [702, 463, 327, 326],
			brow: [184, 110, 43, 11.5],
			browSource: [684, 562, 458, 132]
		}
	],
	gazeTravel: [4.5, 2.2],
	browTravel: 12,
	browRotation: 7
} as const;

/** Continuous aperture closes onto the painted closed-lid line.
 * Geometric masks constrain real painted eye textures; they do not draw a new eye. */
export function eyeAperture(box: readonly number[], closure: number) {
	const [x, y, w, h] = box;
	const c = Number.isFinite(closure) ? Math.max(0, Math.min(1, closure)) : 0;
	const line = y + h * 0.57;
	const upper = line + (y - line) * (1 - c);
	const lower = line + (y + h - line) * (1 - c);
	return `M ${x} ${line} C ${x + w * 0.1} ${upper} ${x + w * 0.78} ${upper} ${x + w} ${line} C ${x + w * 0.78} ${lower} ${x + w * 0.1} ${lower} ${x} ${line} Z`;
}

/** Renderer-only geometry. The director supplies cosmetic channels, never game state. */
export function facialPose(frame: Pick<PresenceFrame, 'eyes' | 'brow' | 'blink'>) {
	const clamp = (v: number) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
	const gaze = { x: clamp(frame.eyes.x), y: clamp(frame.eyes.y) };
	const brow = clamp(frame.brow);
	return {
		x: gaze.x * DHONI_EYES.gazeTravel[0],
		y: gaze.y * DHONI_EYES.gazeTravel[1],
		closure: Math.max(0, clamp(frame.blink)),
		brows: [0, 1].map((side) => {
			const dominant = Math.abs(gaze.x) < 0.1 || (side === 1 ? gaze.x > 0 : gaze.x < 0);
			const amount = brow * (dominant ? 1 : 0.35);
			return {
				y: -amount * DHONI_EYES.browTravel,
				rotation: amount * DHONI_EYES.browRotation * (side ? -1 : 1)
			};
		})
	};
}
