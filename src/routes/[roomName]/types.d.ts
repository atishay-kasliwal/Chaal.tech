interface Card {
	rank: number;
	suit: string;
}
interface User {
	/** Stable server-issued player ID, independent of the Socket.IO connection. */
	id: string;
	username: string;
	balance: number;
	handBet: number | null;
	seatNumber: number;
	/** Hidden cards are rank-zero placeholders; no private identities are transmitted. */
	cardsInHand: Card[];
	isBlind: boolean;
	isPacked: boolean;
	connected: boolean;
	ready?: boolean;
	hasLeft: boolean;
	folded?: boolean;
	isAllIn?: boolean;
	streetBet?: number;
}
interface RoomData {
	name: string;
	selfId: string;
	hostId: string | null;
	revision: number;
	handId: string | null;
	rulesVersion: string;
	gameType?: 'teen-patti' | 'texas-holdem';
	variantState?: { wildRank: number; indicator: Card };
	stage?: string;
	board?: Card[];
	buttonSeat?: number | null;
	smallBlind?: number;
	bigBlind?: number;
	currentBet?: number;
	minRaise?: number;
	currentPlayer: number;
	gameShow: boolean;
	isStarted: boolean;
	initiator: string | null;
	maxStake: number;
	pot: number;
	table: number;
	deadline: number | null;
	usersList: User[];
	result: {
		winnerId: string;
		winnerName: string;
		amount: number;
		reason: string;
		handId: string;
	} | null;
	legalActions: {
		start: boolean;
		ready?: boolean;
		see?: boolean;
		pack?: boolean;
		bet?: boolean;
		show?: boolean;
		minBet?: number;
		maxBet?: number;
		check?: boolean;
		call?: boolean;
		fold?: boolean;
		raise?: boolean;
		toCall?: number;
		minRaiseTo?: number;
		maxRaiseTo?: number;
	};
}
