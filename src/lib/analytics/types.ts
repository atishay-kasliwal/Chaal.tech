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

/* ------------------------------------------ Phase 5: intelligence ------------------------------------------ */

export interface Compare {
	n: number;
	actual: number | null;
	expected: number | null;
	difference: number | null;
	low: number | null;
	high: number | null;
	z: number | null;
	p: number | null;
	evidence: Evidence;
	tier: 'weak' | 'moderate' | 'strong';
	verdict: 'above' | 'below' | 'as-expected' | 'insufficient';
}
export interface StrengthBand {
	hands: number;
	wins: number;
	units: number;
	perHand: number | null;
	stayRate: number | null;
	evidence: Evidence;
}
export interface SkillGame {
	game: string;
	model: 'exact' | 'estimated' | 'outcome-only' | 'unavailable';
	unit?: string;
	hands: number;
	cards?: Compare;
	play?: Compare;
	outcome?: Compare;
	wins?: Compare;
	boots?: { total: number; perHand: number | null; low: number | null; high: number | null };
	byStrength?: Record<'weak' | 'average' | 'strong', StrengthBand>;
	decisions?: Record<string, unknown> & {
		kind?: string;
		evaluated?: number;
		mistakes?: number;
		mistakeRate?: number | null;
		betsLostPer100?: number | null;
		common?: { action: string; total: number; dealerUp: number; cost: number; count: number }[];
		evidence?: Evidence;
		packedStrongHands?: { k: number; n: number; rate: number | null };
		playedWeakToTheEnd?: { k: number; n: number; rate: number | null };
		foldedAbovePotOdds?: number;
		continuedBelowPotOdds?: number;
		note?: string;
	};
	points?: { perHand: number | null; total: number };
	limitations: string[];
	reason?: string;
}
export interface NightLuck {
	nightId: string;
	at: number;
	hands: number;
	units: number;
	luck: 'hot' | 'cold' | 'average' | 'unknown';
	cards: Compare | null;
	blackjack: Compare | null;
}
export interface Dimension {
	id: string;
	label: string;
	kind: 'skill' | 'result' | 'style';
	recent: { n: number; value: number | null };
	baseline: { n: number; value: number | null };
	change: number | null;
	p: number | null;
	tier: string;
	evidence: Evidence;
	direction: 'better' | 'worse' | 'steady' | 'unclear' | 'changed';
	note: string | null;
}
export interface Improvement {
	window: { days: number; recentHands: number; baselineHands: number };
	verdict: 'improving' | 'slipping' | 'mixed' | 'steady' | 'not-enough';
	dimensions: Dimension[];
	luckNote: string | null;
}
export interface SkillView {
	skill: { games: Record<string, SkillGame>; nights: NightLuck[]; method: Record<string, string> };
	improvement: Improvement;
}
export interface RecordItem {
	id: string;
	label: string;
	value: number | string;
	unit: string;
	nightId?: string;
	handId?: string;
	subject?: string;
	at?: number;
	detail?: string;
	holder?: string | null;
	game?: string;
}
export interface Achievement {
	id: string;
	title: string;
	description: string;
	earnedAt: number | null;
	progress: { value: number; target: number } | null;
}
export interface RecordsView {
	empty: boolean;
	records: RecordItem[];
	achievements: { earned: Achievement[]; next: Achievement[] };
}
export interface RecapHighlight {
	id: string;
	topic: string;
	scope: 'personal' | 'social' | 'club';
	text: string;
	evidence: { nightId?: string | null; hands?: string[] };
}
export interface Recap {
	nightId: string;
	startedAt: number;
	endedAt: number;
	minutes: number;
	hands: number;
	results: { humans: { subject: string; hands: number; units: number; you: boolean }[]; bots: { subject: string; hands: number; units: number }[] };
	you: { hands: number; units: number; luck: string | null };
	highlights: RecapHighlight[];
	empty: string | null;
}
export interface BoardTitle {
	id: string;
	label: string;
	subject: string;
	name: string;
	kind: 'human' | 'bot';
	headline: string;
	facts: string[];
	handId?: string;
}
export interface RivalBoard {
	mostPlayed: BoardTitle | null;
	closest: BoardTitle | null;
	longest: BoardTitle | null;
	biggestSwing: BoardTitle | null;
	recentChallenger: BoardTitle | null;
	botNemesis: BoardTitle | null;
	botHandledBest: BoardTitle | null;
	note: string | null;
}
export interface RivalPage {
	name: string;
	kind: 'human' | 'bot';
	headline: string;
	hands: number;
	nights: number;
	firstMet: number | null;
	lastMet: number;
	units: number;
	moments: { handId: string; at: number; gameType: string; hand: string | null }[];
	largestPots: { handId: string; at: number; potUnits: number; units: number }[];
	recentForm: { handId: string; at: number; units: number | null; gameType: string }[];
	variants: { key: string; hands: number }[];
	memory: { familiarity: string; moment: string | null; hands: number } | null;
}
export interface FairnessView {
	you: {
		verdict: string;
		sample: { cards: number; hands: number };
		ranks: { rank: number; count: number; expected: number; low: number; high: number; within: boolean }[];
		suits: { suit: string; count: number; expected: number; low: number; high: number; within: boolean }[];
		outsideBand: number | null;
		expectedOutside: number;
		convergence: { cards: number; deviation: number; typical: number }[];
		mostDealt: { rank: number; suit: string; count: number; expected: number }[];
	};
	club: { cards: number; note: string; ranks: { rank: number; count: number; expected: number }[]; suits: { suit: string; count: number; expected: number }[] } | null;
	integrity: { hands: number; sealedBeforeDealing: number; cutByAPlayer: number; replayVerified: number } | null;
	explain: { what: string[]; cannot: string[]; howToRead: string };
}
export interface ClubRecordsView {
	empty: boolean;
	records: RecordItem[];
}
export interface TimelineView {
	empty: boolean;
	events: { id: string; type: string; at: number; text: string; nightId?: string; handId?: string }[];
}
