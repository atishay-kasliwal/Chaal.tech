/** Types for the browser practice harness (src/routes/test-pakad); the bot itself is plain JS. */
export type Move = {
	action: string;
	payload: Record<string, unknown>;
	reason?: string;
	trace?: unknown;
};
export type Decider = ((
	view: Record<string, unknown>,
	selfId: string,
	random: () => number,
	memory: Record<string, unknown>
) => Move) & {
	observe: (view: Record<string, unknown>, selfId: string, memory: Record<string, unknown>) => void;
	characterId: string | null;
};
export const BRAIN_PAKAD: string;
export function botPakad(
	characterId: string | null,
	options?: { personality?: boolean; adaptive?: boolean }
): Decider;
