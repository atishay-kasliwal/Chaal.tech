/** The 3 2 5 seat view a client receives (server/tricks/three-two-five.mjs projection). */
export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Card = { rank: number; suit: Suit | '' };
export type TrickUser = {
	id: string;
	username: string;
	connected: boolean;
	ready: boolean;
	isBot: boolean;
	characterId: string | null;
	mascotId: string | null;
	autoMoves: number;
	cardCount: number;
	cardsInHand: Card[];
};
export type Play = { id: string; card: Card };
export type TrickRoom = {
	stage: string;
	round: number;
	hostId: string;
	isStarted: boolean;
	gameShow: boolean;
	dealerId: string | null;
	order: string[];
	quotas: Record<string, number>;
	tricks: Record<string, number>;
	scores: Record<string, number>;
	lastRound: Record<string, number> | null;
	trump: Suit | null;
	trick: { leader: string; plays: Play[] } | null;
	history: { winner: string; plays: Play[] }[];
	pull: {
		index: number;
		total: number;
		puller: string;
		victim: string;
		step: 'take' | 'give';
		faceDown: number;
		taken: Card | null;
	} | null;
	currentPlayerId: string | null;
	result: {
		reason: string;
		diffs: Record<string, number> | null;
		tricks: Record<string, number>;
		quotas: Record<string, number>;
	} | null;
	usersList: TrickUser[];
	legalActions: {
		start: boolean;
		ready: boolean;
		addBot: boolean;
		chooseTrump: boolean;
		pull: number;
		give: Card[];
		play: Card[];
	};
};
