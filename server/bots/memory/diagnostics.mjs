/** Internal evaluation only. Never imported by the MemoryProvider or live policy. */
import { handFacts } from '../../analytics/compute/facts.mjs';
import { DIAGNOSTICS_COLLECTION, MEMORY_COLLECTION, MEMORY_STATUS, memoryReady } from './store.mjs';
import { MEMORY_VERSION } from './observations.mjs';
import { DAY, relationship } from './model.mjs';

export async function recordAdaptationReport(db, records) {
	if (!(await memoryReady(db))) return;
	const facts = handFacts(records.public);
	for (const seat of records.public.seats.filter((s) => s.kind === 'bot')) {
		const traces = records.sealed.botTrace.filter((t) => t.p === seat.p && t.adaptive);
		if (!traces.length) continue;
		const fact = facts.get(seat.p);
		await db.collection(DIAGNOSTICS_COLLECTION).updateOne(
			{ _id: `${records.public._id}:${seat.bot.botId}` },
			{
				$setOnInsert: {
					botId: seat.bot.botId,
					handId: records.public._id,
					nightId: records.public.nightId,
					at: records.public.completedAt,
					game: fact.gameType,
					variant: fact.rulesVersion,
					styleId: seat.bot.styleId,
					units: fact.units,
					won: fact.won,
					fairShare: fact.fairShare,
					complete: fact.complete,
					// No cards, tendencies, model estimates, raw memory snapshots or trace parameters.
					decisions: traces.map((t) => ({
						i: t.i,
						action: t.adaptive.chosenAction,
						baseAction: t.adaptive.baseAction,
						context: t.adaptive.context,
						reasonCodes: t.adaptive.reasonCodes,
						adapted: t.adaptive.adaptations.length > 0,
						redirected: t.adaptive.redirected,
						memoryStatus: t.adaptive.memoryStatus,
						priorHands: Math.max(0, ...t.adaptive.modelRefs.map((m) => m.hands)),
						effect: Math.max(0, ...t.adaptive.adaptations.map((a) => a.effect)),
						changed: t.adaptive.adaptations.some((a) => a.evidence.changed),
						timings: records.sealed.steps[t.i]?.bot?.timings ?? null
					}))
				}
			},
			{ upsert: true }
		);
	}
}
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const percentile = (a, p) =>
	a.length
		? [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.ceil(a.length * p) - 1)]
		: null;
const top = (counts) =>
	Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];

/** Walk-forward public-context predictor: predict before seeing this action. No own/private
 * card strength, hindsight model or in-sample classification accuracy. Descriptive diagnostics. */
export function adaptationAnalysis(reports) {
	const sorted = [...reports].sort((a, b) => a.at - b.at || a.handId.localeCompare(b.handId));
	const cells = new Map();
	const overall = {};
	const reasons = {};
	const groups = { learning: [], familiar: [], adapted: [], base: [] };
	const prediction = {
		n: 0,
		correct: 0,
		baselineCorrect: 0,
		learning: { n: 0, correct: 0 },
		familiar: { n: 0, correct: 0 },
		adapted: { n: 0, correct: 0 },
		base: { n: 0, correct: 0 }
	};
	let decisions = 0,
		adapted = 0,
		redirected = 0,
		unavailable = 0,
		changes = 0;
	const latencies = { lookupMs: [], episodeMs: [], decisionMs: [] };
	for (const report of sorted) {
		const stage = report.decisions.some((d) => d.priorHands >= 40) ? 'familiar' : 'learning';
		groups[stage].push(report);
		groups[report.decisions.some((d) => d.adapted) ? 'adapted' : 'base'].push(report);
		for (const d of report.decisions) {
			decisions++;
			adapted += Number(d.adapted);
			redirected += Number(d.redirected);
			unavailable += Number(d.memoryStatus === 'unavailable');
			changes += Number(d.changed);
			for (const reason of d.reasonCodes) reasons[reason] = (reasons[reason] ?? 0) + 1;
			for (const key of Object.keys(latencies))
				if (Number.isFinite(d.timings?.[key])) latencies[key].push(d.timings[key]);
			const key = JSON.stringify([
				report.styleId,
				report.game,
				report.variant,
				d.context.blind,
				d.context.live,
				d.context.pot,
				d.context.price,
				d.context.canRaise
			]);
			const cell = cells.get(key) ?? { n: 0, counts: {}, units: [] };
			if (cell.n >= 10) {
				const correct = Number(top(cell.counts) === d.action);
				prediction.n++;
				prediction.correct += correct;
				prediction.baselineCorrect += Number(top(overall) === d.action);
				for (const g of [
					d.priorHands >= 40 ? 'familiar' : 'learning',
					d.adapted ? 'adapted' : 'base'
				]) {
					prediction[g].n++;
					prediction[g].correct += correct;
				}
			}
			cell.n++;
			cell.counts[d.action] = (cell.counts[d.action] ?? 0) + 1;
			// Count a hand once per public context, not once per bot decision.
			if (!cell.units.some((r) => r.id === report.handId))
				cell.units.push({ id: report.handId, net: report.units });
			cells.set(key, cell);
			overall[d.action] = (overall[d.action] ?? 0) + 1;
		}
	}
	const accuracy = (p) => ({
		samples: p.n,
		correct: p.correct,
		accuracy: p.n >= 50 ? p.correct / p.n : null,
		status: p.n >= 50 ? 'descriptive' : 'insufficient'
	});
	return {
		hands: reports.length,
		nights: new Set(reports.map((r) => r.nightId)).size,
		decisions,
		adapted,
		redirected,
		unavailable,
		behaviorChanges: changes,
		performance: Object.fromEntries(
			Object.entries(groups).map(([key, rows]) => [
				key,
				{
					hands: rows.length,
					nights: new Set(rows.map((r) => r.nightId)).size,
					boots: rows.reduce((n, r) => n + r.units, 0),
					bootsPerHand: mean(rows.map((r) => r.units)),
					wins: rows.reduce((n, r) => n + r.won, 0),
					fairShare: rows.reduce((n, r) => n + (r.fairShare ?? 0), 0),
					status:
						rows.length >= 100 && new Set(rows.map((r) => r.nightId)).size >= 5
							? 'descriptive'
							: 'insufficient'
				}
			])
		),
		predictability: {
			...accuracy(prediction),
			baselineAccuracy: prediction.n >= 50 ? prediction.baselineCorrect / prediction.n : null,
			byStage: Object.fromEntries(
				['learning', 'familiar', 'adapted', 'base'].map((k) => [k, accuracy(prediction[k])])
			),
			method: 'walk-forward public-context majority; 10 warmup observations per style/context'
		},
		reasons,
		exploitability: [...cells.entries()]
			.filter(
				([, c]) =>
					c.n >= 50 && ((c.counts.pack ?? 0) / c.n > 0.7 || (c.counts.raise ?? 0) / c.n > 0.8)
			)
			.map(([context, c]) => ({
				context,
				decisions: c.n,
				action: top(c.counts),
				frequency: c.counts[top(c.counts)] / c.n,
				bootsPerHand: mean(c.units.map((r) => r.net)),
				status: 'review-signal'
			}))
			.slice(0, 12),
		latency: Object.fromEntries(
			Object.entries(latencies).map(([k, v]) => [
				k,
				{ samples: v.length, mean: mean(v), p95: percentile(v, 0.95) }
			])
		),
		causality:
			'Not established. Different cards, opponents and nights confound before/after comparisons; a redirect is not proof of benefit.'
	};
}

export async function memoryHealth(db, now = Date.now()) {
	if (!(await memoryReady(db))) return { status: 'not-migrated', schema: MEMORY_VERSION, bots: [] };
	const memories = await db.collection(MEMORY_COLLECTION).find().toArray();
	const statuses = await db
		.collection(MEMORY_STATUS)
		.find({ _id: { $ne: 'schema' } })
		.toArray();
	const ids = [...new Set([...memories.map((m) => m.botId), ...statuses.map((s) => s._id)])];
	const bots = [];
	for (const botId of ids) {
		const own = memories.filter((m) => m.botId === botId);
		const reports = await db
			.collection(DIAGNOSTICS_COLLECTION)
			.find({ botId })
			.sort({ at: -1 })
			.limit(2000)
			.toArray();
		bots.push({
			botId,
			contexts: own.length,
			playerModels: own.reduce((n, m) => n + m.models.length, 0),
			observations: own.reduce((n, m) => n + m.models.reduce((s, p) => s + p.opportunities, 0), 0),
			episodes: own.reduce((n, m) => n + m.episodes.length, 0),
			staleModels: own.reduce(
				(n, m) => n + m.models.filter((p) => now - p.lastPlayed > 60 * DAY).length,
				0
			),
			styles: [...new Set(own.flatMap((m) => m.styles))],
			status: statuses.find((s) => s._id === botId) ?? null,
			analysis: adaptationAnalysis(reports),
			reportLimit: 2000
		});
	}
	return { status: 'ready', schema: MEMORY_VERSION, bots };
}

/** A member only sees their own factual relationships. No full-model spread. */
export async function publicMemory(db, botId, playerId, now = Date.now()) {
	if (!playerId) return { status: 'empty', contexts: [], moment: null };
	const docs = await db
		.collection(MEMORY_COLLECTION)
		.find(
			{ botId, schema: MEMORY_VERSION, 'models.playerId': playerId },
			{ projection: { game: 1, variant: 1, models: { $elemMatch: { playerId } } } }
		)
		.toArray();
	const contexts = docs.map((doc) => relationship(doc.models[0], doc.game, doc.variant, now));
	const hands = contexts.reduce((n, c) => n + c.hands, 0);
	const nights = new Set(docs.flatMap((d) => d.models[0].nights)).size;
	const firstPlayed = contexts.length ? Math.min(...contexts.map((c) => c.firstPlayed)) : null;
	const lastPlayed = contexts.length ? Math.max(...contexts.map((c) => c.lastPlayed)) : null;
	const best = [...contexts].sort((a, b) => b.hands - a.hands)[0];
	return {
		status: contexts.length ? 'remembered' : 'empty',
		hands,
		nights,
		firstPlayed,
		lastPlayed,
		contexts,
		familiarity: best?.familiarity ?? 'Just met',
		moment: hands
			? `Remembers ${hands} hands with you across ${nights} ${nights === 1 ? 'night' : 'nights'}.`
			: null
	};
}
