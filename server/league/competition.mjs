import { CAST } from '../../src/lib/bots/cast.js';
import { CANONICAL_STYLES } from '../bots/dna-styles.mjs';
import { ci } from '../sim/p4stats.mjs';

export const LEAGUE_VERSION = 'chaal-league@1';
export const ROSTER = CAST.map((c) => ({
	...c,
	style: CANONICAL_STYLES[c.id]._id,
	hash: CANONICAL_STYLES[c.id].configHash
}));

// All five cyclic rotations share a deck stream. Each character receives every seat's cards.
export function competitionSpecs({ hands, seed, blockHands = 100 }) {
	if (!Number.isSafeInteger(hands) || hands < 500 || hands > 5_000_000 || hands % (blockHands * 5))
		throw new Error('Hands must be a multiple of 500, between 500 and 5,000,000');
	if (!Number.isSafeInteger(seed) || seed < 0 || seed > 2147483647) throw new Error('Invalid seed');
	const specs = [];
	for (let block = 0; block < hands / (blockHands * 5); block++) {
		for (let rotation = 0; rotation < 5; rotation++) {
			const members = ROSTER.map((_, seat) => ROSTER[(seat + rotation) % 5]);
			specs.push({
				seed,
				table: block,
				hands: blockHands,
				matched: true,
				seats: members.map((c) => c.style),
				ids: members.map((c) => c.id),
				block,
				rotation
			});
		}
	}
	return specs;
}

export function summarizeCompetition(
	results,
	{ hands, seed, startedAt, completedAt, kind = 'daily' }
) {
	if (!['daily', 'exhibition', 'benchmark'].includes(kind))
		throw new Error('Invalid competition kind');
	const expected = competitionSpecs({ hands, seed });
	const keys = new Set(results.map((r) => `${r.block}:${r.rotation}`));
	if (
		results.length !== expected.length ||
		keys.size !== expected.length ||
		expected.some((s) => !keys.has(`${s.block}:${s.rotation}`))
	)
		throw new Error('Incomplete competition; refusing to publish');
	const blocks = new Map();
	for (const r of results) {
		if (
			r.hands !== 100 ||
			r.rows.length !== 5 ||
			Math.abs(r.rows.reduce((n, s) => n + s.net, 0)) > 0.00001
		)
			throw new Error('Invalid table result');
		const group =
			blocks.get(r.block) ?? Object.fromEntries(ROSTER.map((c) => [c.id, { net: 0, hands: 0 }]));
		for (const row of r.rows) {
			group[row.id].net += row.net;
			group[row.id].hands += r.hands;
		}
		blocks.set(r.block, group);
	}
	const standings = ROSTER.map((c) => {
		const rows = results.flatMap((r) => r.rows.filter((row) => row.id === c.id));
		const net = rows.reduce((n, r) => n + r.net, 0);
		const units = [...blocks.values()].map((b) => (b[c.id].net / b[c.id].hands) * 100);
		return {
			id: c.id,
			name: c.name,
			style: c.style,
			hash: c.hash,
			hands,
			wins: rows.reduce((n, r) => n + r.wins, 0),
			net,
			profit100: (net / hands) * 100,
			interval95: ci(units).ci,
			decisions: rows.reduce((n, r) => n + r.decisions, 0),
			raises: rows.reduce((n, r) => n + r.raises, 0),
			folds: rows.reduce((n, r) => n + r.folds, 0)
		};
	}).sort((a, b) => b.net - a.net || a.id.localeCompare(b.id));
	const gaps = {};
	for (const a of ROSTER) {
		gaps[a.id] = {};
		for (const b of ROSTER) {
			const stats = ci(
				[...blocks.values()].map((g) => ((g[a.id].net - g[b.id].net) / g[a.id].hands) * 100)
			);
			gaps[a.id][b.id] = { mean: stats.mean, interval95: stats.ci };
		}
	}
	const lead = gaps[standings[0].id][standings[1].id];
	// A title needs a positive paired 95% gap over every rival, not just a raw chip lead.
	const decisive = standings.slice(1).every((s) => {
		const gap = gaps[standings[0].id][s.id];
		return gap.mean - gap.interval95 > 0;
	});
	return {
		id: `${kind}-${seed}`,
		schema: LEAGUE_VERSION,
		game: 'teen-patti',
		variant: 'classic-1',
		kind,
		seed,
		startedAt,
		completedAt,
		hands,
		participations: hands * 5,
		durationSeconds: (Date.parse(completedAt) - Date.parse(startedAt)) / 1000,
		blockHands: 100,
		rotations: 5,
		blocks: blocks.size,
		standings,
		gaps,
		leader: standings[0].id,
		winner: decisive && kind === 'daily' ? standings[0].id : null,
		decisive,
		leadGap95: lead.interval95,
		method:
			'Five seat rotations per shuffled-deck block. Equal starting stacks of 100 bets; automatic rebuys are excluded from profit. Fresh session memory per table; no production player memories. Intervals use independent five-rotation blocks.'
	};
}
