/** Simulation worker process: plays table specs sent one at a time, returns compact per-seat stats. */
import { performance } from 'node:perf_hooks';
import { runTable } from '../../server/sim/table.mjs';
import { seatHandStats } from '../../server/sim/fingerprint.mjs';
import { judgeDecision } from '../../server/sim/judge.mjs';
import { seatSummarizer } from '../../server/sim/summary.mjs';

process.on('message', (spec) => {
	if (spec === null) return process.disconnect();
	if (spec.summary) return summarize(spec);
	const seats = Object.fromEntries(spec.seats.map((member, seat) => [seat, { member, hands: [] }]));
	const timing = {};
	let decisions = 0;
	const started = performance.now();
	runTable(
		spec,
		(hand) => {
			for (const [seat, stats] of seatHandStats(hand)) seats[seat].hands.push(stats);
			for (const d of hand.decisions) {
				decisions++;
				// Every 4th decision's timing is kept for percentiles.
				if (d.i % 4 === 0) (timing[spec.seats[d.seat]] ??= []).push(d.ms);
			}
		},
		{ decision: judgeDecision }
	);
	process.send({
		run: spec.run,
		table: spec.table,
		seats: Object.values(seats),
		timing,
		decisions,
		ms: performance.now() - started,
		rssMb: process.memoryUsage().rss / 2 ** 20
	});
});

/**
 * Summary mode (Phase 3): per watched seat, a compact summary (server/sim/summary.mjs) instead of
 * every hand, so the parent's memory does not grow with the number of hands.
 * spec.summary = { seats: [seat indexes] (default all), windows: [k...] }
 */
function summarize(spec) {
	const watch = spec.summary.seats ?? spec.seats.map((_, i) => i);
	const sums = Object.fromEntries(
		watch.map((seat) => [seat, seatSummarizer(seat, { windows: spec.summary.windows ?? [] })])
	);
	let decisions = 0;
	const started = performance.now();
	runTable(
		spec,
		(hand) => {
			decisions += hand.decisions.length;
			const stats = seatHandStats(hand);
			for (const seat of watch) sums[seat].add(hand, stats.get(seat));
		},
		{ decision: judgeDecision }
	);
	process.send({
		run: spec.run,
		table: spec.table,
		key: spec.key ?? null,
		seats: watch.map((seat) => ({ seat, ...sums[seat].result() })),
		decisions,
		ms: performance.now() - started,
		rssMb: process.memoryUsage().rss / 2 ** 20
	});
}
