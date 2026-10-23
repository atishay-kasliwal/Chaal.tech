export interface LeagueStanding {
	id: string;
	name: string;
	style: string;
	hash: string;
	hands: number;
	wins: number;
	net: number;
	profit100: number;
	interval95: number;
	decisions: number;
	raises: number;
	folds: number;
}
export interface LeagueReport {
	id: string;
	schema: string;
	kind: 'daily' | 'exhibition' | 'benchmark';
	game: string;
	variant: string;
	seed: number;
	startedAt: string;
	completedAt: string;
	hands: number;
	participations: number;
	durationSeconds: number;
	blocks: number;
	rotations: number;
	blockHands: number;
	standings: LeagueStanding[];
	gaps: Record<string, Record<string, { mean: number; interval95: number }>>;
	leader: string;
	winner: string | null;
	decisive: boolean;
	method: string;
	commit?: string;
}
