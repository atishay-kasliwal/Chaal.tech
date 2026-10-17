/** Shapes of the /analytics/* responses (server/analytics/api.mjs and compute/*.mjs). */

export type Evidence = 'insufficient' | 'early' | 'moderate' | 'strong' | 'descriptive';
export type Names = Record<string, { name: string; kind: 'human' | 'bot'; characterId: string | null; mascotId: string | null }>;

export interface NightMark {
	nightId: string;
	units: number;
	hands: number;
	at: number;
}
export interface Results {
	hands: number;
	nights: number;
	units: number;
	perHand: number | null;
	perHandLow: number | null;
	perHandHigh: number | null;
	perNight: number | null;
	evidence: Evidence;
	verdict: string;
	bestNight: NightMark | null;
	worstNight: NightMark | null;
}
export interface FairShare {
	hands: number;
	wins: number;
	expected: number;
	aboveFair: number;
	ratio: number | null;
	p: number;
	evidence: Evidence;
	verdict: string;
}
export interface Trend {
	verdict: string;
	recent: number | null;
	earlier: number | null;
	diff?: number;
	recentHands: number;
	earlierHands: number;
}
export interface Overview {
	hands: number;
	nights: number;
	games: Record<string, number>;
	withBots: number;
	fairShare: FairShare;
	results: Results;
	rummy: Results | null;
	cumulative: { i: number; at: number; units: number }[];
	recentNights: NightMark[];
	trend: Trend;
	biggestPot: { handId: string; units: number; gameType: string; at: number } | null;
}

export interface Insight {
	id: string;
	type: string;
	metric: string;
	value: number | null;
	baseline: number | null;
	difference: number | null;
	n: number;
	confidence: { p: number | null; q: number | null; evidence: Evidence };
	window: string;
	game: string | null;
	variant: string | null;
	opponent: string | null;
	supportingHands: string[];
	eligible: boolean;
	reason: string;
	text: string;
}

export interface Pick {
	key: string | null;
	reason?: string;
	candidate?: string;
}
export interface GameGroup {
	key: string;
	hands: number;
	nights: number;
	wins: number;
	fairShare: FairShare;
	results: Results;
	shrunkPerHand: number | null;
	averagePot: number | null;
}
export interface GamesView {
	games: GameGroup[];
	variants: GameGroup[];
	labels: { mostPlayed: string | null; mostProfitable: string | null; best: Pick; worst: Pick; bestVariant: Pick; worstVariant: Pick };
}

export interface CardGroup {
	key: string;
	hands: number;
	share: number | null;
	perHand: number | null;
	perHandLow: number | null;
	perHandHigh: number | null;
	packed: number | null;
	evidence: Evidence;
}
export interface CardFace {
	rank: number;
	suit: string;
	count: number;
	expected: number;
}
export interface CardsView {
	cards: {
		hands: number;
		teenPatti: { hands: number; categories: CardGroup[]; tiers: CardGroup[]; note: string } | null;
		holdem: { hands: number; classes: CardGroup[]; tiers: CardGroup[] } | null;
		blackjack: { hands: number; starts: CardGroup[]; byDealer: CardGroup[] } | null;
		rummy: { hands: number; jokers: CardGroup[] } | null;
	};
	fairness: {
		cards: number;
		verdict: 'insufficient' | 'fair' | 'unusual';
		note: string;
		ranks: { rank: number; count: number; expected: number }[];
		suits: { suit: string; count: number; expected: number }[];
		mostDealt: CardFace[];
	};
}

export interface Count {
	k: number;
	n: number;
}
export interface Contrast {
	segment: string;
	label: string;
	opponent?: string | null;
	action: string;
	n: number;
	rate: number | null;
	baseline: { k: number; n: number; rate: number | null };
	diff: number | null;
	p: number;
	q: number | null;
	significant: boolean;
	evidence: Evidence;
}
export interface PatternsView {
	core: {
		decisions: number;
		fold: Count;
		raise: Count;
		call: Count;
		show: Count;
		timeout: Count;
		disconnectedTimeouts: number;
		teenPatti: { blindDecisionsPerHand: number | null; seeFirst: Count; blindRaise: Count; seenRaise: Count; showWon: Count };
		holdem: { aggressionFactor: number | null; betToPot: number | null };
	};
	club: { raise: number | null; fold: number | null; call: number | null; show: number | null; timeout: number | null };
	situations: Contrast[];
	styleChange: Contrast[];
	names: Names;
}

export interface Rival {
	subject: string;
	kind: 'human' | 'bot';
	hands: number;
	nights: number;
	games: Record<string, number>;
	units: number;
	points: number | null;
	perHand: number | null;
	verdict: string;
	fair: { you: number | null; them: number | null };
	contests: { won: number; lost: number; split: number };
	biggestWin: { handId: string; units: number } | null;
	biggestLoss: { handId: string; units: number } | null;
	lastMet: number;
	recentNights: { nightId: string; at: number; hands: number; units: number }[];
	cumulative: { i: number; units: number }[];
	byGame?: { game: string; hands: number; units: number; points: number | null }[];
}

export interface NightRow {
	nightId: string;
	startedAt: number;
	endedAt: number;
	hands: number;
	games: Record<string, number>;
	units: number;
	withBots: boolean;
}
export interface HandRow {
	handId: string;
	at: number;
	gameType: string;
	rulesVersion: string | null;
	players: number;
	withBots: boolean;
	exit: string;
	units: number | null;
	points: number | null;
}
export interface HandsPage {
	total: number;
	page: number;
	pageSize: number;
	hands: HandRow[];
}

export interface Card {
	rank: number;
	suit: string;
}
export interface Actor {
	subject: string;
	name: string;
	you?: boolean;
}
export interface HandEvent {
	i: number;
	sub: number | null;
	by: Actor;
	action: string;
	automatic: boolean;
	amount?: number;
	amountUnits?: number;
	players?: Actor[];
	yours?: { blind: boolean | null };
}
export interface HandView {
	handNo: number | null;
	gameType: string;
	rulesVersion: string | null;
	completedAt: number;
	unit: string;
	seats: (Actor & { seat: number; exit: string | null; units: number | null })[];
	yourCards: { final: Card[]; hand: string | null } | null;
	events: HandEvent[];
	shown: (Actor & { cards: Card[]; hand: string | null; late: boolean })[];
	outcome: { pot: number | null; potUnits: number | null; winners: Actor[] };
	youLeftAt: number | null;
}
