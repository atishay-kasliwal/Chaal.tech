/** Types for the browser practice harness (src/routes/test-29); the bot itself is plain JS. */
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
export const BRAIN_29: string;
export function bot29(
	characterId: string | null,
	options?: { personality?: boolean; adaptive?: boolean }
): Decider;
