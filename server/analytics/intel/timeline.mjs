/**
 * Club timeline (docs/archive/ANALYTICS_PHASE5.md, "Timeline"): a light, friendly history built from
 * structured events, never from free text. Every item links to a night or hand where one exists.
 */
import { handFacts } from '../compute/facts.mjs';
import { plural, variantName, gameName } from './language.mjs';
import { round } from '../compute/stats.mjs';

const DAY = 86_400_000;

/**
 * @param records the club's public hand summaries (any order)
 * @param bots [{ botId, name, at }] introductions
 */
export function clubTimeline({ records, bots = [], names = {}, now = Date.now(), limit = 40 }) {
	const sorted = [...records].sort((a, b) => a.completedAt - b.completedAt);
	if (!sorted.length) return { empty: true, events: [] };
	const nameOf = (s) => names[s]?.name ?? 'a friend';
	const events = [];
	const first = sorted[0];
	events.push({ id: 'first-night', type: 'first-night', at: first.startedAt, nightId: first.nightId, text: 'The first night at the club.' });
	for (const n of [100, 1000, 5000, 10000])
		if (sorted.length >= n) events.push({ id: `hand-${n}`, type: 'milestone', at: sorted[n - 1].completedAt, handId: sorted[n - 1]._id, nightId: sorted[n - 1].nightId, text: `Hand number ${n.toLocaleString('en-IN')} at the club.` });
	const seenVariants = new Map();
	let record = 0;
	const pairs = new Map();
	sorted.forEach((r, index) => {
		const key = r.gameType === 'teen-patti' ? `teen-patti|${r.rulesVersion}` : r.gameType;
		if (!seenVariants.has(key)) {
			seenVariants.set(key, r.completedAt);
			if (index > 20) events.push({ id: `variant:${key}`, type: 'new-variant', at: r.completedAt, handId: r._id, nightId: r.nightId, text: `First time at the table: ${r.gameType === 'teen-patti' ? variantName(r.rulesVersion) : gameName(r.gameType)}.` });
		}
		if (r.gameType !== 'blackjack' && r.gameType !== 'rummy' && r.outcome?.pot) {
			const f = [...handFacts(r).values()][0];
			const units = r.outcome.pot / f.unit;
			if (units > record && index > 50 && units >= record * 1.15 && units >= 20) {
				const winner = r.seats.find((s) => s.p === r.outcome.winners?.[0]?.p);
				events.push({ id: `pot:${r._id}`, type: 'record-pot', at: r.completedAt, handId: r._id, nightId: r.nightId, text: `A new biggest pot: ${round(units, 0)} boots${winner && winner.kind === 'human' ? `, won by ${nameOf(winner.p)}` : ''}.` });
			}
			record = Math.max(record, units);
		}
		const humans = r.seats.filter((s) => s.kind === 'human').map((s) => s.p).sort();
		for (let i = 0; i < humans.length; i++)
			for (let j = i + 1; j < humans.length; j++) {
				const k = `${humans[i]}|${humans[j]}`;
				const n = (pairs.get(k) ?? 0) + 1;
				pairs.set(k, n);
				if (n === 100 || n === 500) events.push({ id: `pair:${k}:${n}`, type: 'rivalry-milestone', at: r.completedAt, handId: r._id, nightId: r.nightId, text: `${nameOf(humans[i])} and ${nameOf(humans[j])} reached ${plural(n, 'hand')} together.` });
			}
	});
	for (const bot of bots) events.push({ id: `bot:${bot.botId}`, type: 'new-bot', at: bot.at, text: `${bot.name} joined the table.` });
	// An anniversary shows for a few days either side of the date.
	const years = Math.floor((now - first.startedAt) / (365.25 * DAY));
	if (years >= 1) {
		const date = first.startedAt + years * 365.25 * DAY;
		if (Math.abs(now - date) < 3 * DAY) events.push({ id: `anniversary:${years}`, type: 'anniversary', at: date, text: years === 1 ? 'One year since the first night.' : `${years} years since the first night.` });
	}
	return { empty: false, events: events.filter((e) => e.at <= now).sort((a, b) => b.at - a.at).slice(0, limit) };
}
