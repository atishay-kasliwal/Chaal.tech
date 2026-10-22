/** Types for the browser practice harness (src/routes/test-pakad); the engine itself is plain JS. */
export type Card = { rank: number; suit: string };
export type Room = {
	isStarted: boolean;
	gameShow: boolean;
	currentPlayerId: string | null;
	players: {
		id: string;
		bot?: { characterId: string } | null;
		departed: boolean;
		seatNumber: number | null;
	}[];
	[key: string]: unknown;
};
export type Ctx = {
	now: number;
	turnMs: number;
	connected: Set<string>;
	deck?: Card[];
	handId?: string;
};
export const RULES_VERSION: string;
export function freshPakadDeck(): Card[];
export function newRoom(name: string, table: number, hostId: string): Room;
export function transition(
	room: Room,
	id: string,
	action: string,
	payload?: Record<string, unknown>,
	ctx?: Ctx
): Room;
export function projection(room: Room, id: string, connected: Set<string>): Record<string, unknown>;
