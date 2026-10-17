export interface BotRecord {
	hands: number;
	nights: number;
	units: number;
	evidence: string;
	verdict: string;
	games: Record<string, number>;
	variants: Record<string, number>;
	fair: { you: number | null; them: number | null; youWins: number; themWins: number };
	contests: { won: number; lost: number; split: number };
	recentNights: { nightId: string; at: number; hands: number; units: number }[];
	biggestWin: { units: number; at: number } | null;
	biggestLoss: { units: number; at: number } | null;
}
export interface ClubBot {
	botId: string;
	slug: string;
	name: string;
	description: string;
	avatar: { mascotId: string } | null;
	personality: { title?: string; traits?: string[] };
	status: 'draft' | 'active' | 'disabled' | 'retired';
	available: boolean;
	style: {
		styleId: string;
		version: number;
		supportedGames: string[];
		difficulty: { declared: string; measured: null };
		publishedAt: string;
		validation: { simulationHands: number; predictability: string };
	} | null;
	record: BotRecord | null;
}
