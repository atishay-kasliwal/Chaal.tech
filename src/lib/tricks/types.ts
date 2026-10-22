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

/** The 10 Pakad seat view a client receives (server/tricks/ten-pakad.mjs projection). */
export type Pile = { count: number; tens: number };
export type PakadUser = TrickUser & { seatNumber: number; team: 0 | 1 };
export type PakadRoom = {
	stage: string;
	hand: number;
	hostId: string;
	isStarted: boolean;
	gameShow: boolean;
	dealerId: string | null;
	order: string[];
	teams: Record<string, 0 | 1>;
	trump: Suit | null;
	trumpSetBy: { id: string; trick: number; card: Card } | { drawn: Card } | null;
	trick: { leader: string; plays: Play[] } | null;
	lastTrick: { plays: Play[]; winner: string; collected: boolean; n: number } | null;
	tricksPlayed: number;
	centre: Pile;
	captured: [Pile, Pile];
	streak: { id: string; wins: number } | null;
	match: {
		kots: [number, number];
		handsWon: [number, number];
		run: { team: 0 | 1 | null; hands: number };
	};
	currentPlayerId: string | null;
	result: {
		reason: string;
		tens: [number, number] | null;
		winnerTeam?: 0 | 1;
		kot?: 'four-tens' | 'seven-in-a-row' | null;
		dealingTeam?: 0 | 1;
	} | null;
	usersList: PakadUser[];
	legalActions: { start: boolean; ready: boolean; addBot: boolean; play: Card[] };
};
