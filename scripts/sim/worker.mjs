/** Simulation worker process: plays table specs sent one at a time, returns compact per-seat stats. */
import { performance } from 'node:perf_hooks';
import { runTable } from '../../server/sim/table.mjs';
import { seatHandStats, sum } from '../../server/sim/fingerprint.mjs';
import { judgeDecision } from '../../server/sim/judge.mjs';
import { eventStudy } from '../../server/sim/events-study.mjs';
import { sequenceStudy } from '../../server/sim/sequences.mjs';
import { STYLES } from '../../server/bots/dna-styles.mjs';
import { seatSummarizer, addCounters } from '../../server/sim/summary.mjs';
import { priorFromSession } from '../../server/bots/memory/prior.mjs';

process.on('message', (spec) => {
	if (spec === null) return process.disconnect();
	if (spec.summary) return summarize(spec);
	if (spec.bins) return bins(spec);
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
	// Phase 4 event study of the first watched seat (server/sim/events-study.mjs).
	const studied = spec.summary.events ? watch[0] : null;
	const study =
		studied == null
			? null
			: eventStudy(
					studied,
					typeof spec.seats[studied] === 'object'
						? spec.seats[studied].style
						: (STYLES[spec.seats[studied]] ?? null)
				);
	const seq = spec.summary.sequences ? sequenceStudy(watch[0]) : null;
	const played = runTable(
		spec,
		(hand) => {
			decisions += hand.decisions.length;
			const stats = seatHandStats(hand);
			for (const seat of watch) sums[seat].add(hand, stats.get(seat));
			study?.hand(hand);
			seq?.hand(hand);
		},
		{
			decision: (ctx) => {
				const q = judgeDecision(ctx);
				study?.decision(ctx);
				seq?.decision({ ...ctx, row: { ...ctx.row, q } });
				return q;
			}
		}
	);
	process.send({
		run: spec.run,
		table: spec.table,
		key: spec.key ?? null,
		// Phase 4: the caller's tags, returned as given.
		...(spec.meta ? { meta: spec.meta } : {}),
		...(study ? { events: study.result() } : {}),
		...(seq ? { sequences: seq.result() } : {}),
		seats: watch.map((seat) => ({ seat, ...sums[seat].result() })),
		// Phase 5: the next night's priors from a watched seat's last mind (spec.summary.priorsOf).
		...(spec.summary.priorsOf !== undefined
			? { priors: sessionPriors(played.minds, `bot-seat-${spec.summary.priorsOf}`) }
			: {}),
		decisions,
		ms: performance.now() - started,
		rssMb: process.memoryUsage().rss / 2 ** 20
	});
}

/**
 * Bins mode (Phase 4 adaptation studies): one seat's full counters per `size`-hand bin, plus what
 * its opponent reads rest on: for each belief its decisions consulted (trace memoryRefs), the
 * summed observation count and the number of consultations, per bin.
 * spec.bins = { seat, size }
 */
function bins(spec) {
	const { seat, size } = spec.bins;
	const out = [];
	let decisions = 0;
	const started = performance.now();
	const reads = [];
	runTable(
		spec,
		(hand) => {
			decisions += hand.decisions.length;
			const b = Math.floor(hand.h / size);
			const stats = seatHandStats(hand).get(seat);
			const counters = stats ? sum([stats]) : null;
			out[b] = out[b] ? addCounters(out[b], counters) : counters;
			const r = (out[b].reads ??= {});
			for (const [k, n] of reads.splice(0)) {
				r[`${k}N`] = (r[`${k}N`] ?? 0) + n;
				r[`${k}C`] = (r[`${k}C`] ?? 0) + 1;
			}
		},
		{
			decision: (ctx) => {
				const q = judgeDecision(ctx);
				if (ctx.row.seat === seat)
					for (const ref of ctx.move.trace?.memoryRefs ?? []) reads.push([ref[1], ref[3]]);
				return q;
			}
		}
	);
	process.send({
		run: spec.run,
		table: spec.table,
		...(spec.meta ? { meta: spec.meta } : {}),
		bins: out,
		decisions,
		ms: performance.now() - started,
		rssMb: process.memoryUsage().rss / 2 ** 20
	});
}

/** What one seated character would remember about every other seat, as next night's priors. */
function sessionPriors(minds, botId) {
	const mind = minds?.[botId];
	if (!mind) return {};
	const byPlayer = {};
	for (const [id, s] of Object.entries(mind.others ?? {})) {
		const prior = priorFromSession(s.model);
		if (prior) byPlayer[id] = prior;
	}
	return { [botId]: byPlayer };
}
