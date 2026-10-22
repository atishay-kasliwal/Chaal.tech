/** Shapes of the owner decision inspector (server/analytics/intel/inspector.mjs). */

export interface GraphNode {
	id: string;
	label: string;
}
export interface Delta {
	factor: string;
	label: string;
	d: Record<string, number>;
}
export interface NodeView extends GraphNode {
	visited: boolean;
	order: number | null;
	notes: string[];
	deltas: Delta[];
	total: Record<string, number> | null;
}
export interface Prob {
	move: string;
	p: number;
	chosen: boolean;
	utility?: number | null;
	base?: number | null;
	personality?: number | null;
}
export interface Decision {
	i: number;
	botId: string | null;
	name: string;
	styleId: string | null;
	policy: string | null;
	verified: string;
	action: string;
	actionLabel: string;
	amount: number | null;
	probs: Prob[];
	reason: string | null;
	reasonText: string;
	secondary: string[];
	why: string;
	situation: string;
	key: string | null;
	deltas: Delta[];
	margins: { factor: string; label: string; m: number }[];
	groups: Record<string, Record<string, number>>;
	override: { baseBest: string; best: string; override: boolean } | null;
	strength: { single: number; multi: number } | null;
	mind: {
		mood: Record<string, number> | null;
		pressure: number;
		facing: string | null;
		beliefs: { about: string; stat: string; p: number; n: number }[];
	} | null;
	bound: { clarity: number; lambda: number; capped: string[] } | null;
	resisted: string[];
	adaptive: {
		baseAction: string | null;
		redirected: boolean;
		confidence: number | null;
		adaptations: { reason: string; about: string | null; target: string | null; effect: number | null }[];
		reasons: string[];
	} | null;
	path: string[];
	graph: NodeView[] | null;
	text: string | null;
}
export interface SeatSummary {
	name: string;
	kind: 'bot' | 'human';
	styleId: string | null;
	policy?: string | null;
}
export interface HandSummary {
	id: string;
	gameType: string;
	rulesVersion: string | null;
	completedAt: number | null;
	nightId: string | null;
	handNo: number | null;
	practice?: boolean;
	seats: SeatSummary[];
}
export interface HandsResponse {
	hands: HandSummary[];
	graphs: { policy: string; nodes: GraphNode[] }[];
}
export interface InspectResponse {
	hand: HandSummary;
	decisions: Decision[];
	graphs: Record<string, GraphNode[]>;
}

const signedNumber = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`;
export const signedDelta = signedNumber;
export const percent = (p: number) => `${Math.round(p * 100)}%`;

/** One chip per move a factor moved, largest first: "rivalry +0.40 to raise". */
export function deltaChips(deltas: Delta[], min = 0.005) {
	return deltas
		.flatMap((x) =>
			Object.entries(x.d)
				.filter(([, v]) => Math.abs(v) >= min)
				.map(([move, v]) => ({ key: `${x.factor}:${move}`, label: x.label, move, v }))
		)
		.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
}
