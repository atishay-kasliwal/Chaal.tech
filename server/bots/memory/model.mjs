/** Reproducible sufficient statistics. No database, analytics feed, labels or hidden cards. */
import { wilson } from '../../analytics/compute/stats.mjs';
import { MEMORY_VERSION, contextId } from './observations.mjs';

export const DAY = 86400000;
export const HALF_LIFE = 14 * DAY;
export const PRIOR_WEIGHT = 30;
export const RECENT_OPPORTUNITY_HALF_LIFE = 40;
export const BASELINES = Object.freeze({
	fold: 0.45,
	raise: 0.3,
	call: 0.5,
	check: 0.5,
	show: 0.2,
	see: 0.5,
	staysBlind: 0.5
});
const decay = (from, to) => Math.exp((-Math.LN2 * Math.max(0, to - from)) / HALF_LIFE);
const clone = (v) => structuredClone(v);
const round = (n) => Math.round(n * 1000000) / 1000000;

export function emptyMemory(botId, game, variant) {
	return {
		_id: contextId(botId, game, variant),
		schema: MEMORY_VERSION,
		botId,
		game,
		variant,
		revision: 0,
		through: 0,
		head: null,
		hands: 0,
		models: [],
		episodes: [],
		recent: [],
		styles: []
	};
}
function count(model, key, action, success, at, handId) {
	const c = (model.metrics[key] ??= {
		action,
		n: 0,
		k: 0,
		hands: 0,
		lastHand: null,
		rn: 0,
		rk: 0,
		lastObserved: at
	});
	const d = decay(c.lastObserved, at) * Math.exp(-Math.LN2 / RECENT_OPPORTUNITY_HALF_LIFE);
	c.rn = c.rn * d + 1;
	c.rk = c.rk * d + Number(success);
	c.n++;
	c.k += Number(success);
	if (c.lastHand !== handId) {
		c.hands++;
		c.lastHand = handId;
	}
	c.lastObserved = at;
}
function moments(model, key, value, at) {
	if (value === null || !Number.isFinite(value)) return;
	const m = (model.values[key] ??= { n: 0, sum: 0, square: 0, rn: 0, rsum: 0, lastObserved: at });
	const weight = decay(m.lastObserved, at) * Math.exp(-Math.LN2 / RECENT_OPPORTUNITY_HALF_LIFE);
	m.rn = m.rn * weight + 1;
	m.rsum = m.rsum * weight + value;
	m.n++;
	m.sum += value;
	m.square += value * value;
	m.lastObserved = at;
}

/** Call in chronological hand order. Storage handles retries/reordered arrivals by rebuilding. */
export function accumulate(memory, observation) {
	if (
		!observation ||
		observation.botId !== memory.botId ||
		observation.game !== memory.game ||
		observation.variant !== memory.variant
	)
		throw new Error('Memory observer/context mismatch');
	if (
		memory.head &&
		(observation.at < memory.head.at ||
			(observation.at === memory.head.at && observation.handId <= memory.head.id))
	)
		throw new Error('Memory must be accumulated chronologically');
	const out = clone(memory);
	out.head = { at: observation.at, id: observation.handId };
	out.through = Math.max(out.through, observation.through);
	out.hands++;
	out.styles = [...new Set([...out.styles, observation.styleId])];
	for (const peer of observation.peers) {
		let model = out.models.find((m) => m.playerId === peer.playerId);
		if (!model) {
			model = {
				playerId: peer.playerId,
				kind: peer.kind,
				hands: 0,
				nights: [],
				firstPlayed: observation.startedAt,
				lastPlayed: 0,
				opportunities: 0,
				timeouts: 0,
				disconnectedTimeouts: 0,
				automatic: 0,
				metrics: {},
				values: {},
				netBetween: 0,
				last: null,
				recent: []
			};
			out.models.push(model);
		}
		model.hands++;
		model.nights = [...new Set([...model.nights, observation.nightId])];
		model.lastPlayed = observation.at;
		model.timeouts += peer.timeouts;
		model.disconnectedTimeouts += peer.disconnectedTimeouts;
		model.automatic += peer.automatic;
		const contiguous =
			model.last?.nightId === observation.nightId && model.last?.handNo + 1 === observation.handNo;
		const after = contiguous ? model.last.result : null;
		const streak = contiguous ? model.last.streak : 0;
		for (const d of peer.decisions) {
			// No choice = forced, even if it arrived through the player command route.
			if (Object.values(d.options).filter(Boolean).length < 2) {
				model.automatic++;
				continue;
			}
			model.opportunities++;
			const segments = ['all'];
			if (d.blind !== null) segments.push(d.blind ? 'blind' : 'seen');
			if (d.facing === 'raise') segments.push('pressure');
			if (d.largeRaise) segments.push('large-pressure');
			if (d.stackUnits !== null && d.stackUnits < 20) segments.push('short-stack');
			if (d.potUnits !== null && d.potUnits >= 20) segments.push('large-pot');
			if (d.relOrder !== null)
				segments.push(
					d.relOrder < 0.34
						? 'early-position'
						: d.relOrder > 0.66
							? 'late-position'
							: 'middle-position'
				);
			if (after) segments.push(`after-${after}`);
			if (streak >= 2) segments.push('loss-streak');
			// Causal night position: no use of the eventual length/end of this night.
			segments.push(observation.handNo <= 10 ? 'first-ten-hands' : 'later-night');
			for (const action of ['fold', 'call', 'raise', 'check', 'show', 'see'])
				if (d.options[action] && (d.betting || action === 'see'))
					for (const segment of segments)
						count(
							model,
							`${segment}:${action}`,
							action,
							d.action === action,
							d.at,
							observation.handId
						);
			if (d.action === 'raise' || d.action === 'call')
				moments(model, 'stakeMultiple', d.stakeMultiple, d.at);
		}
		if (peer.sawCompleteHand && peer.decisions.some((d) => d.betting)) {
			count(
				model,
				'all:staysBlind',
				'staysBlind',
				peer.stayedBlind,
				observation.at,
				observation.handId
			);
			moments(model, 'blindDecisions', peer.blindDecisions, observation.at);
		}
		if (peer.result) model.netBetween += peer.result.netBetween;
		model.last = {
			nightId: observation.nightId,
			handNo: observation.handNo,
			result: peer.result ? (peer.result.won > 0 ? 'win' : 'loss') : null,
			streak: peer.result && peer.result.won === 0 ? streak + 1 : 0
		};
		model.recent = [
			...model.recent,
			{
				handId: observation.handId,
				nightId: observation.nightId,
				at: observation.at,
				result: model.last.result
			}
		].slice(-12);
	}
	out.episodes = [...out.episodes, ...observation.episodes]
		.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
		.slice(-80);
	out.recent = [
		...out.recent,
		{ handId: observation.handId, nightId: observation.nightId, at: observation.at }
	].slice(-12);
	return out;
}

/** Confidence is evidence weight, not a probability that a behavioural story is true. */
export function estimate(counter, now) {
	if (!counter) return null;
	const baseline = BASELINES[counter.action] ?? 0.5;
	const rn = counter.rn * decay(counter.lastObserved, now);
	const rk = counter.rk * decay(counter.lastObserved, now);
	const long = (counter.k + PRIOR_WEIGHT * baseline) / (counter.n + PRIOR_WEIGHT);
	const recent = (rk + PRIOR_WEIGHT * baseline) / (rn + PRIOR_WEIGHT);
	const interval = wilson(counter.k, counter.n);
	const recentInterval = wilson(rk, rn);
	const confidence =
		Math.min(counter.hands / 60, 1) *
		(counter.n / (counter.n + 80)) *
		Math.exp((-Math.LN2 * Math.max(0, now - counter.lastObserved)) / (60 * DAY));
	const changed =
		rn >= 30 &&
		counter.n >= 80 &&
		Math.abs(recent - long) >= 0.15 &&
		(recentInterval.low > interval.high || recentInterval.high < interval.low);
	return {
		opportunities: counter.n,
		successes: counter.k,
		hands: counter.hands,
		recentSamples: round(rn),
		baseline,
		observed: round(counter.k / counter.n),
		longTerm: round(long),
		recent: round(recent),
		low: interval.low,
		high: interval.high,
		confidence: round(confidence),
		lastObserved: counter.lastObserved,
		changed
	};
}
export function playerModel(model, now) {
	return {
		playerId: model.playerId,
		hands: model.hands,
		nights: model.nights.length,
		opportunities: model.opportunities,
		lastPlayed: model.lastPlayed,
		metrics: Object.fromEntries(
			Object.entries(model.metrics).map(([key, c]) => [key, estimate(c, now)])
		),
		values: Object.fromEntries(
			Object.entries(model.values).map(([key, m]) => [
				key,
				{
					sampleSize: m.n,
					recentSamples: m.rn * decay(m.lastObserved, now),
					recentMean: m.rsum / m.rn,
					mean: m.sum / m.n,
					standardError:
						m.n > 1
							? Math.sqrt(Math.max(0, (m.square - (m.sum * m.sum) / m.n) / (m.n - 1)) / m.n)
							: null,
					lastObserved: m.lastObserved
				}
			])
		)
	};
}

export function familiarity(model, now) {
	const useful = Object.entries(model.metrics).filter(
		([k, c]) => k !== 'all:see' && c.hands >= 20 && estimate(c, now).confidence >= 0.25
	).length;
	const recent = now - model.lastPlayed < 60 * DAY;
	if (
		recent &&
		model.hands >= 300 &&
		model.nights.length >= 15 &&
		model.opportunities >= 600 &&
		useful >= 8
	)
		return 'Very familiar';
	if (
		recent &&
		model.hands >= 120 &&
		model.nights.length >= 8 &&
		model.opportunities >= 240 &&
		useful >= 5
	)
		return 'Knows your game';
	if (
		recent &&
		model.hands >= 40 &&
		model.nights.length >= 3 &&
		model.opportunities >= 80 &&
		useful >= 3
	)
		return 'Familiar';
	return model.hands >= 6 ? 'Learning' : 'Just met';
}

/** Explicit public DTO: never spread a model into a member response. */
export function relationship(model, game, variant, now) {
	return {
		game,
		variant,
		hands: model.hands,
		nights: model.nights.length,
		firstPlayed: model.firstPlayed,
		lastPlayed: model.lastPlayed,
		familiarity: familiarity(model, now),
		recentMeetings: model.recent.map((r) => ({ at: r.at, nightId: r.nightId }))
	};
}
