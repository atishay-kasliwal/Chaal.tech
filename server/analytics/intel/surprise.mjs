/**
 * Surprise detection (docs/archive/ANALYTICS_PHASE5.md, "Surprises"). A night is compared with the same
 * person's own earlier history, never with other people, and a departure is reported only when the
 * baseline is large enough to know what "usual" is and the gap is bigger than chance explains.
 * Every detector returns a ranked-insight candidate (confidence, magnitude, evidence ids); wording is
 * done by templates, and weak departures are simply not returned.
 */
import { proportionTest, round, twoSidedP } from '../compute/stats.mjs';
import { boots, plural, signedBoots, variant } from './language.mjs';

export const MIN_BASELINE_OPPS = 60;
export const MIN_NIGHT_OPPS = 12;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const conf = (p) => clamp01(1 - p * 8); // p = 0.01 → 0.92, p = 0.05 → 0.6, p = 0.125 → 0

function mean(xs) {
	return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/**
 * @param facts all of the viewer's facts (the night and everything before it)
 * @param set decisions of the viewer across the same hands
 * @param rows playRows()
 * @param skillNights skillLuck().nights
 * @param rivalsBefore / rivalsAfter rivalries() without and with the night
 */
export function nightSurprises({ nightId, facts, set, rows = [], skillNights = [], rivalsBefore = [], rivalsAfter = [], names = {} }) {
	const night = facts.filter((f) => f.nightId === nightId && f.complete);
	if (!night.length) return [];
	const startedAt = Math.min(...night.map((f) => f.startedAt));
	const before = facts.filter((f) => f.completedAt < startedAt && f.complete);
	const nightIds = new Set(night.map((f) => f.handId));
	const baseIds = new Set(before.map((f) => f.handId));
	const tonight = set.decisions.filter((d) => nightIds.has(d.handId) && d.betting);
	const usual = set.decisions.filter((d) => baseIds.has(d.handId) && d.betting);
	const out = [];
	const nameOf = (s) => names[s]?.name ?? (s.startsWith('bot:') ? 'a bot' : 'a friend');
	const at = (extra) => ({ nightId, scope: 'personal', ...extra });

	/* Aggression: raising more or less than usual. */
	for (const [action, key] of [['raise', 'raise']]) {
		const a = tonight.filter((d) => d.options[key]);
		const b = usual.filter((d) => d.options[key]);
		if (a.length >= MIN_NIGHT_OPPS && b.length >= MIN_BASELINE_OPPS) {
			const k1 = a.filter((d) => d.action === action).length;
			const k2 = b.filter((d) => d.action === action).length;
			const t = proportionTest(k1, a.length, k2, b.length);
			if (t.p < 0.02 && Math.abs(t.diff) >= 0.12) {
				const up = t.diff > 0;
				out.push(at({
					id: `surprise:aggression:${up ? 'up' : 'down'}:${nightId}`,
					topic: 'aggression',
					type: up ? 'aggressive-night' : 'conservative-night',
					confidence: conf(t.p),
					magnitude: clamp01(Math.abs(t.diff) / 0.3),
					facts: { rate: round(k1 / a.length, 2), usual: round(k2 / b.length, 2), n: a.length },
					text: up
						? `You raised more than usual tonight: ${k1} of ${a.length} chances (${Math.round((k1 / a.length) * 100)}%) against your usual ${Math.round((k2 / b.length) * 100)}%.`
						: `A quieter night than usual: you raised ${k1} of ${a.length} chances (${Math.round((k1 / a.length) * 100)}%) against your usual ${Math.round((k2 / b.length) * 100)}%.`,
					evidence: { nightId, hands: [...new Set(a.filter((d) => d.action === action).map((d) => d.handId))].slice(0, 8) }
				}));
			}
		}
	}

	/* Facing pressure: packing more than usual after a raise. */
	{
		const a = tonight.filter((d) => d.facing === 'raise' && d.options.fold);
		const b = usual.filter((d) => d.facing === 'raise' && d.options.fold);
		if (a.length >= 6 && b.length >= 30) {
			const k1 = a.filter((d) => d.action === 'fold').length;
			const k2 = b.filter((d) => d.action === 'fold').length;
			const t = proportionTest(k1, a.length, k2, b.length);
			if (t.p < 0.03 && Math.abs(t.diff) >= 0.2)
				out.push(at({
					id: `surprise:pressure:${t.diff > 0 ? 'up' : 'down'}:${nightId}`,
					topic: 'pressure',
					type: 'pressure-response',
					confidence: conf(t.p),
					magnitude: clamp01(Math.abs(t.diff) / 0.5),
					facts: { k: k1, n: a.length },
					text: t.diff > 0 ? `You packed ${k1} of ${a.length} times after a raise, more than usual.` : `You held on against a raise ${a.length - k1} of ${a.length} times, more than usual.`,
					evidence: { nightId, hands: [...new Set(a.map((d) => d.handId))].slice(0, 8) }
				}));
		}
	}

	/* Blind: staying blind longer than usual. */
	{
		const a = set.hands.filter((h) => nightIds.has(h.handId) && h.game === 'teen-patti').map((h) => h.blindDecisions);
		const b = set.hands.filter((h) => baseIds.has(h.handId) && h.game === 'teen-patti').map((h) => h.blindDecisions);
		if (a.length >= 8 && b.length >= 40) {
			const ma = mean(a);
			const mb = mean(b);
			const va = a.reduce((s, x) => s + (x - ma) ** 2, 0) / (a.length - 1);
			const vb = b.reduce((s, x) => s + (x - mb) ** 2, 0) / (b.length - 1);
			const z = (ma - mb) / Math.sqrt(va / a.length + vb / b.length || 1);
			const p = twoSidedP(z);
			if (p < 0.03 && Math.abs(ma - mb) >= 0.4)
				out.push(at({
					id: `surprise:blind:${ma > mb ? 'longer' : 'shorter'}:${nightId}`,
					topic: 'blind',
					type: 'blind-shift',
					confidence: conf(p),
					magnitude: clamp01(Math.abs(ma - mb) / 1.5),
					facts: { tonight: round(ma, 1), usual: round(mb, 1) },
					text: ma > mb ? `You stayed blind longer than usual tonight: ${round(ma, 1)} turns a hand against ${round(mb, 1)}.` : `You looked at your cards sooner than usual tonight.`,
					evidence: { nightId, hands: set.hands.filter((h) => nightIds.has(h.handId) && h.blindDecisions >= 3).map((h) => h.handId).slice(0, 8) }
				}));
		}
	}

	/* An unusually large pot, against the pots this person has played before. */
	{
		const pots = before.filter((f) => f.stake && f.potUnits !== null).map((f) => f.potUnits).sort((a, b) => a - b);
		const top = night.filter((f) => f.stake && f.potUnits !== null).sort((a, b) => b.potUnits - a.potUnits)[0];
		if (top && pots.length >= 40) {
			const rank = pots.filter((p) => p < top.potUnits).length / pots.length;
			if (rank >= 0.97 && top.potUnits >= 15)
				out.push(at({
					id: `surprise:pot:${nightId}`,
					topic: 'pot',
					type: 'large-pot',
					confidence: clamp01(0.55 + (pots.length >= 100 ? 0.25 : 0.1) + (rank >= 0.995 ? 0.1 : 0)),
					magnitude: clamp01((rank - 0.9) / 0.1),
					facts: { potUnits: round(top.potUnits, 1) },
					text: `Your biggest pot in a while: ${boots(top.potUnits)}, larger than ${Math.floor(rank * 100)}% of the pots you have played.`,
					evidence: { nightId, hands: [top.handId] }
				}));
		}
	}

	/* Comeback: down at least 8 boots at some point, finished level or ahead. */
	{
		const run = night.filter((f) => f.stake).sort((a, b) => a.completedAt - b.completedAt);
		let sum = 0;
		let low = 0;
		let lowAt = null;
		for (const f of run) {
			sum += f.units;
			if (sum < low) {
				low = sum;
				lowAt = f.handId;
			}
		}
		if (low <= -8 && sum >= 0)
			out.push(at({
				id: `surprise:comeback:${nightId}`,
				topic: 'comeback',
				type: 'comeback',
				confidence: 0.9,
				magnitude: clamp01((sum - low) / 30),
				facts: { low: round(low, 1), final: round(sum, 1) },
				text: `A comeback: you were ${boots(low)} down at your lowest and finished ${signedBoots(sum)}.`,
				evidence: { nightId, hands: [lowAt] }
			}));
	}

	/* Rare hands, from the player's own cards. */
	{
		const rare = rows.filter((r) => nightIds.has(r.fact.handId) && r.game === 'teen-patti' && r.equity / r.fair > 4.5 && r.fact.players >= 3).sort((a, b) => b.equity - a.equity)[0];
		if (rare)
			out.push(at({
				id: `surprise:rare:${nightId}`,
				topic: 'rare-hand',
				type: 'rare-hand',
				confidence: 0.95,
				magnitude: 0.6,
				facts: {},
				text: variant(nightId, ['You were dealt one of the strongest hands the deck can give tonight.', 'A very rare hand came your way tonight.']),
				evidence: { nightId, hands: [rare.fact.handId] }
			}));
	}

	/* The cards themselves: hot or cold, only when the sample supports it. */
	{
		const luck = skillNights.find((n) => n.nightId === nightId);
		const c = luck?.cards;
		if (c && c.verdict !== 'insufficient' && c.tier !== 'weak' && c.verdict !== 'as-expected') {
			const hot = c.verdict === 'above';
			const result = night.filter((f) => f.stake).reduce((s, f) => s + f.units, 0);
			out.push(at({
				id: `surprise:cards:${hot ? 'hot' : 'cold'}:${nightId}`,
				topic: 'cards',
				type: hot ? 'cards-hot' : 'cards-cold',
				confidence: conf(c.p ?? 0.05),
				magnitude: clamp01(Math.abs(c.z ?? 0) / 3),
				facts: { z: c.z, result: round(result, 1) },
				text: hot
					? `Your cards ran warmer than usual tonight, and you finished ${signedBoots(result)}.`
					: result >= 0
						? `You ran colder than usual on cards but still finished ${signedBoots(result)}.`
						: `Your cards ran colder than usual tonight, which explains much of the ${signedBoots(result)}.`,
				evidence: { nightId, hands: [] }
			}));
		}
	}

	/* A rivalry that turned over: the lead changed side, and both sides were meaningful. */
	{
		const prior = new Map(rivalsBefore.map((r) => [r.subject, r]));
		for (const after of rivalsAfter) {
			const was = prior.get(after.subject);
			if (!was || was.hands < 30 || Math.abs(was.units) < 5 || Math.abs(after.units) < 2) continue;
			if (Math.sign(was.units) === Math.sign(after.units)) continue;
			out.push(at({
				id: `surprise:reversal:${after.subject}:${nightId}`,
				topic: `rival:${after.subject}`,
				scope: 'social',
				type: 'rivalry-reversal',
				confidence: 0.75,
				magnitude: clamp01(Math.abs(was.units - after.units) / 20),
				facts: { was: was.units, now: after.units },
				text: after.units > 0 ? `You moved ahead of ${nameOf(after.subject)} tonight: ${signedBoots(after.units)} over ${plural(after.hands, 'hand')}.` : `${nameOf(after.subject)} pulled ahead of you tonight, ${signedBoots(after.units)} over ${plural(after.hands, 'hand')}.`,
				evidence: { nightId, subject: after.subject, hands: [] }
			}));
		}
	}
	return out;
}
