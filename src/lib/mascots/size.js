/** Club-wide mascot sizing, shared by the server validator and client controls. */
export const MASCOT_SIZE = Object.freeze({ min: 60, max: 160, step: 5, default: 100 });

/** @param {unknown} value @returns {value is number} */
export function isMascotSize(value) {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= MASCOT_SIZE.min &&
		value <= MASCOT_SIZE.max &&
		(value - MASCOT_SIZE.min) % MASCOT_SIZE.step === 0
	);
}
