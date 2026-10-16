interface Card {
	rank: number;
	suit: string;
	copy?: number;
}
interface User {
	/** Stable server-issued player ID, independent of the Socket.IO connection. */
	id: string;
	username: string;
	/** Null when another player has hidden their balance from the table. */
	balance: number | null;
	balanceHidden?: boolean;
	/** Sent instead of a hidden balance: enough to pay the boot, and any chips at all. */
	coversBoot?: boolean;
	hasChips?: boolean;
	handBet: number | null;
	seatNumber: number;
	/** Hidden cards are rank-zero placeholders; no private identities are transmitted. */
	cardsInHand: Card[];
	/** Server-written name of a hand this viewer may see, e.g. "Pair of 9s". */
	handName?: string | null;
	/** Indexes of jokers in a visible hand. */
	wildCards?: number[];
	/** Present for server-run bots: their difficulty. */
	bot?: 'easy' | 'normal' | 'hard';
	isBlind: boolean;
	isPacked: boolean;
	connected: boolean;
	ready?: boolean;
	hasLeft: boolean;
	folded?: boolean;
	isAllIn?: boolean;
	streetBet?: number;
	cardCount?: number;
	status?: string;
	wager?: number;
	blackjackOutcome?: string | null;
}
interface ChipRequest {
	from: string;
	to: string;
	amount: number;
}
interface RoomData {
	name: string;
	/** Who picks the next game between hands, until when, and what they picked. */
	chooser?: { playerId: string; handId: string; deadline: number; choice: string | null };
	/** Open chip requests this viewer sent or received. */
	chipRequests?: ChipRequest[];
	/** Amounts this viewer may ask for; present only when they are below 10% of the buy-in. */
	chipRequestAmounts?: number[];
	selfId: string;
	hostId: string | null;
	revision: number;
	handId: string | null;
	rulesVersion: string;
	gameType?: 'teen-patti' | 'texas-holdem' | 'blackjack' | 'rummy';
	variantState?: { wildRank: number; indicator: Card } & { wildColor?: 'red' | 'black' };
	stage?: string;
	board?: Card[];
	dealerCards?: Card[];
	dealerTotal?: number | null;
	wildRank?: number;
	indicator?: Card | null;
	discardPile?: Card[];
	stockCount?: number;
	hasDrawn?: boolean;
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
	/** Present on rooms created with table options (boot, auto-ready, visible turn timer). */
	boot?: number;
	autoReady?: boolean;
	/** Pot limit in boots; 0 when off. Reaching it forces a Show among everyone still in. */
	potLimit?: number;
	turnMs?: number | null;
	deadline: number | null;
	usersList: User[];
	result: {
		winnerId: string;
		winnerName: string;
		amount: number;
		reason: string;
		handId: string;
		revealedPlayerIds?: string[];
		/** Split pots: each winner's share. */
		winners?: { id: string; name: string; amount: number }[];
	} | null;
	legalActions: {
		start: boolean;
		ready?: boolean;
		see?: boolean;
		/** Out of the hand (packed or it ended): look at your own cards. */
		peek?: boolean;
		/** Out of the hand: show your cards to everyone. */
		reveal?: boolean;
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
		hit?: boolean;
		stand?: boolean;
		double?: boolean;
		setBet?: boolean;
		drawStock?: boolean;
		drawDiscard?: boolean;
		discard?: boolean;
		declare?: boolean;
		addBot?: boolean;
	};
}
