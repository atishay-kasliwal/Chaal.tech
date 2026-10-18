/** Shapes of the owner intelligence responses (server/analytics/intel/admin.mjs, server/bots/intel.mjs). */
import type { Evidence } from '../types.js';

export interface Interval {
	perHand: number | null;
	low: number | null;
	high: number | null;
	evidence: Evidence;
}
export interface VariantRow {
	key: string;
	label: string;
	hands: number;
	selections: number;
	nights: number;
	uniquePlayers: number;
	repeatRate: number | null;
	avgRunHands: number | null;
	avgRunMinutes: number | null;
	quickSwitchRate: number | null;
	completionRate: number | null;
	withBotsRate: number | null;
	medianHandSeconds: number | null;
	returnWithin30Days: number | null;
	evidence: Evidence;
	flags: string[];
}
export interface ClubIntel {
	overview: {
		empty: boolean;
		hands?: number;
		nights?: number;
		players?: number;
		active?: { days7: number; days30: number };
		avgNightMinutes?: number;
		avgPlayersPerNight?: number;
		games?: { game: string; hands: number; share: number }[];
		sessionByGame?: { game: string; nights: number; avgMinutes: number | null; evidence: Evidence }[];
		variants?: { key: string; label: string; hands: number; share: number; trend: string | null }[];
		bots?: { botId: string; name: string; hands: number; nights: number; nightShare: number }[];
		retention?: { cohorts: { month: string; players: number; returned: number; rate: number | null }[]; note: string | null };
		groups?: { names: string[]; nights: number }[];
	};
	variants: { variants: VariantRow[]; note: string };
}
export interface Finding {
	id: string;
	title: string;
	why: string;
	severity: string;
	evidence: Record<string, number | string | null>;
	suggestion: Record<string, unknown>;
}
export interface Version {
	styleId: string;
	version: number;
	status: string;
	current: boolean;
	publishedAt: string | null;
	hands: number;
	difficulty: { declared?: string; measured?: unknown } | null;
	predictability: { accuracy: number | null; status: string };
	performance: { bot: Interval & { hands: number }; humansAgainst: Interval & { humanHands: number } };
	changes: { key: string; from: unknown; to: unknown }[];
	reason: { finding: string | null; note: string | null } | null;
}
export interface BotIntel {
	botId: string;
	name: string;
	status: string;
	usage: { hands: number; share: number | null; nights: number; firstSeen: number | null; lastSeen: number | null };
	performance: { bot: Interval & { hands: number }; humansAgainst: Interval & { humanHands: number } };
	predictability: { accuracy: number | null; baseline: number | null; judged: number; status: string; method: string };
	adaptation: { decisions: number; adapted: number; redirected: number; behaviorChanges: number; effectiveness: string } | null;
	reasons: { code: string; count: number }[];
	familiarity: { models: number; counts: Record<string, number>; changedPlayers: number };
	byGame: { game: string; hands: number }[];
	byVariant: { variant: string; hands: number; perHand: number | null }[];
	decisions: { count: number; fold: { k: number; n: number }; raise: { k: number; n: number }; call: { k: number; n: number } };
	exploitability: Finding[];
	versions: Version[];
}
export interface Evolution {
	id: string;
	botId: string;
	status: string;
	finding: { id: string; title: string; why: string } | null;
	changes: { key: string; from: unknown; to: unknown }[] | null;
	draftStyleId: string | null;
	comparison: { verdict: string; regressions: string[]; rows: { strategy: string; base: number; candidate: number; change: number; distinguishable: boolean }[]; limitations: string } | null;
	review: { note: string; decision: string } | null;
}
export interface BotsResponse {
	bots: BotIntel[];
	evolutions: Evolution[];
	sample: { hands: number; decisionHands: number };
}
export interface QualityCheck {
	id: string;
	label: string;
	count: number;
	status: 'ok' | 'attention';
	detail: string | null;
	examples: string[];
}
export interface Quality {
	generatedAt: number;
	scanned: number;
	status: 'ok' | 'attention';
	checks: QualityCheck[];
}
