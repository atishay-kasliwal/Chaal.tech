/** Types for the browser practice harness (src/routes/test-325); the generators are plain JS. */
export function hash128(text: string): number[];
export function stream(
	simSeed: unknown,
	...coordinates: unknown[]
): { seed: number[]; draws: number; random: () => number };
export function shuffle<T>(items: T[], random: () => number): T[];
