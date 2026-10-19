/** Generated eyelid paintings, registered to the unchanged 360px center portrait.
 * Coordinates are normalized to a 360px atlas cell. Only these small eye regions
 * render; generated hair, face outlines and jerseys never replace approved art. */
export const DHONI_BLINK = {
	closed: '/prototypes/dhoni-blink/closed-v1.webp',
	half: '/prototypes/dhoni-blink/half-v1.webp',
	eyes: [
		{ target: [132, 115, 49, 39], closed: [132, 115, 49, 39], half: [119, 157, 56, 44] },
		{ target: [181, 115, 49, 39], closed: [181, 115, 49, 39], half: [179, 157, 56, 44] }
	]
} as const;

export type BlinkStage = 'open' | 'half' | 'closed';
/** Three actual eyelid drawings: fast close, brief closure, slower open.
 * No portrait scaling or eye-shaped CSS primitives stand in for eyelid artwork. */
export function blinkStage(closure: number): BlinkStage {
	return closure >= 0.8 ? 'closed' : closure >= 0.16 ? 'half' : 'open';
}
