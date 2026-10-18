/**
 * The rivalry experience (docs/ANALYTICS_PHASE5.md, "Rivalries"). Everything numeric comes from
 * compute/rivals.mjs, the one definition of head to head; this layer only chooses which rivalries
 * are worth a title and words them. No composite score is ever shown: each title lists the plain
 * facts that earned it. Built only from hands the viewer sat in.
 *
 * Titles lean on the friendly side for people (closest, longest, most played) and may be blunter for
 * bots, which are software. Nothing labels a person a worst player or an easy opponent.
 */
import { plural, signedBoots, boots, variant } from './language.mjs';
import { subjectOf } from '../compute/facts.mjs';

export const MIN_TITLE_HANDS = 30;
export const MIN_TITLE_NIGHTS = 3;
const DAY = 86_400_000;
const nameOf = (names, subject) => names[subject]?.name ?? (subject.startsWith('bot:') ? 'a bot' : 'a friend');
const days = (ms) => Math.max(1, Math.round(ms / DAY));

const eligible = (r) => r.hands >= MIN_TITLE_HANDS && r.nights >= MIN_TITLE_NIGHTS;

/** One sentence that states the rivalry no more strongly than its evidence. */
export function rivalryLine(r, name) {
	if (r.verdict === 'too-few') return `You and ${name} need more hands before we can call this a rivalry.`;
	if (r.verdict === 'ahead') return `You are ahead of ${name}: ${signedBoots(r.units)} over ${plural(r.hands, 'hand')}.`;
	if (r.verdict === 'behind') return `${name} is ahead of you: ${signedBoots(r.units)} over ${plural(r.hands, 'hand')}.`;
	const gap = Math.abs(r.units);
	return gap < 3
		? `You and ${name} are almost even after ${plural(r.hands, 'hand')}.`
		: `You and ${name} are close after ${plural(r.hands, 'hand')}: ${boots(gap)} apart, which could easily be luck.`;
}

/** The board of titles. Each is null when nobody qualifies; the UI shows a plain empty state. */
export function rivalryBoard(rivals, names = {}) {
	const humans = rivals.filter((r) => r.kind === 'human');
	const bots = rivals.filter((r) => r.kind === 'bot');
	const stakeOnly = (list) => list.filter((r) => r.evidence !== 'insufficient');

	const mostPlayed = [...rivals].sort((a, b) => b.hands - a.hands || b.nights - a.nights)[0] ?? null;
	const mostPlayedPick = [...humans].sort((a, b) => b.hands - a.hands)[0] ?? mostPlayed;

	// Closeness is the gap per hand relative to how much they have played, never a hidden score.
	const closest = stakeOnly(humans)
		.filter(eligible)
		.filter((r) => r.verdict === 'about-even')
		.sort((a, b) => Math.abs(a.perHand) - Math.abs(b.perHand) || b.hands - a.hands)[0] ?? null;

	const longest = humans
		.filter((r) => r.hands >= 20 && r.nights >= MIN_TITLE_NIGHTS && r.firstMet !== null)
		.sort((a, b) => b.lastMet - b.firstMet - (a.lastMet - a.firstMet))[0] ?? null;

	const swing = rivals
		.flatMap((r) => [r.biggestWin && { r, hand: r.biggestWin, size: Math.abs(r.biggestWin.units) }, r.biggestLoss && { r, hand: r.biggestLoss, size: Math.abs(r.biggestLoss.units) }].filter(Boolean))
		.sort((a, b) => b.size - a.size)[0] ?? null;

	// "Doing better against you lately than usual": the last 30 days against the whole history.
	const challenger = humans
		.filter((r) => r.recent30.hands >= 10 && r.hands - r.recent30.hands >= 10)
		.map((r) => ({ r, recent: r.recent30.units / r.recent30.hands, before: (r.units - r.recent30.units) / (r.hands - r.recent30.hands) }))
		.filter((c) => c.recent < c.before - 0.5)
		.sort((a, b) => a.recent - a.before - (b.recent - b.before))[0] ?? null;

	const nemesis = bots.filter(eligible).filter((r) => r.verdict === 'behind').sort((a, b) => a.perHand - b.perHand)[0] ?? null;
	const handledBest = bots.filter(eligible).filter((r) => r.verdict === 'ahead').sort((a, b) => b.perHand - a.perHand)[0] ?? null;

	const title = (id, label, r, headline, facts) => (r ? { id, label, subject: r.subject, name: nameOf(names, r.subject), kind: r.kind, headline, facts } : null);
	const handsFacts = (r) => [`${plural(r.hands, 'hand')} together`, `${plural(r.nights, 'night')}`];
	return {
		mostPlayed: mostPlayedPick && title('most-played', 'Most played opponent', mostPlayedPick, `${nameOf(names, mostPlayedPick.subject)}: ${plural(mostPlayedPick.hands, 'hand')} across ${plural(mostPlayedPick.nights, 'night')}.`, handsFacts(mostPlayedPick)),
		closest: title('closest', 'Closest rivalry', closest, closest && `${nameOf(names, closest.subject)}: ${boots(Math.abs(closest.units))} apart after ${plural(closest.hands, 'hand')}.`, closest && [...handsFacts(closest), rivalryLine(closest, nameOf(names, closest.subject))]),
		longest: title('longest', 'Longest rivalry', longest, longest && `${nameOf(names, longest.subject)}: ${plural(days(longest.lastMet - longest.firstMet), 'day')} of playing together.`, longest && [...handsFacts(longest), `First hand ${new Date(longest.firstMet).toISOString().slice(0, 10)}`]),
		biggestSwing: swing && {
			id: 'swing',
			label: 'Biggest swing',
			subject: swing.r.subject,
			name: nameOf(names, swing.r.subject),
			kind: swing.r.kind,
			handId: swing.hand.handId,
			headline: `A ${boots(swing.size)} swing in one hand against ${nameOf(names, swing.r.subject)}.`,
			facts: [new Date(swing.hand.at).toISOString().slice(0, 10)]
		},
		recentChallenger: challenger && title('challenger', 'Recent challenger', challenger.r, `${nameOf(names, challenger.r.subject)} has done better against you lately than usual.`, [`Last 30 days: ${plural(challenger.r.recent30.hands, 'hand')}`, `${signedBoots(-challenger.r.recent30.units)} for them`]),
		botNemesis: nemesis && title('bot-nemesis', 'Bot nemesis', nemesis, `${nameOf(names, nemesis.subject)} has the edge: ${signedBoots(nemesis.units)} for you over ${plural(nemesis.hands, 'hand')}.`, handsFacts(nemesis)),
		botHandledBest: handledBest && title('bot-handled-best', 'Bot you handle best', handledBest, `You handle ${nameOf(names, handledBest.subject)} well: ${signedBoots(handledBest.units)} over ${plural(handledBest.hands, 'hand')}.`, handsFacts(handledBest)),
		note: !rivals.some(eligible) ? `Rivalries appear after ${MIN_TITLE_HANDS} hands and ${MIN_TITLE_NIGHTS} nights with someone.` : null
	};
}

/** The detail page: the canonical rivalry plus the public story around it. */
export function rivalryPage({ rival, records, viewer, names = {}, memory = null }) {
	const subject = rival.subject;
	const name = nameOf(names, subject);
	const shared = records.filter((r) => r.seats.some((s) => subjectOf(s) === subject) && r.seats.some((s) => s.p === viewer));
	const seatOf = (record) => record.seats.find((s) => subjectOf(s) === subject);
	// Public moments: hands where they showed cards while the viewer was watching. Labels only.
	const moments = [];
	for (const record of shared) {
		const them = seatOf(record);
		for (const shown of [...(record.shown ?? []), ...(record.lateShown ?? [])]) {
			if (shown.p !== them.p || !((shown.observedBy ?? []).includes(viewer) || shown.p === viewer)) continue;
			moments.push({ handId: record._id, nightId: record.nightId, at: record.completedAt, gameType: record.gameType, hand: shown.label ?? null, potUnits: null });
		}
	}
	const byVariant = Object.entries(rival.variants).map(([key, hands]) => ({ key, hands })).sort((a, b) => b.hands - a.hands);
	const nights = rival.recentNights.map((n) => ({ ...n }));
	const best = nights.length ? nights.reduce((a, b) => (b.units > a.units ? b : a)) : null;
	return {
		subject,
		name,
		kind: rival.kind,
		headline: rivalryLine(rival, name),
		hands: rival.hands,
		nights: rival.nights,
		firstMet: rival.firstMet,
		lastMet: rival.lastMet,
		units: rival.units,
		perHand: rival.perHand,
		perHandLow: rival.perHandLow,
		perHandHigh: rival.perHandHigh,
		verdict: rival.verdict,
		evidence: rival.evidence,
		fair: rival.fair,
		contests: rival.contests,
		recentForm: rival.recentHands.slice(0, 10).map((h) => ({ handId: h.handId, at: h.at, units: h.units, gameType: h.gameType })),
		recentNights: nights,
		bestRecentNight: best && best.units > 0 ? best : null,
		games: rival.byGame ?? Object.entries(rival.games).map(([game, hands]) => ({ game, hands })),
		variants: byVariant,
		timeline: rival.cumulative,
		largestPots: rival.biggestPots,
		biggestSwing: [rival.biggestWin, rival.biggestLoss].filter(Boolean).sort((a, b) => Math.abs(b.units) - Math.abs(a.units))[0] ?? null,
		moments: moments.slice(-6).reverse(),
		recent30: rival.recent30,
		memory: rival.kind === 'bot' ? memory : null,
		line: variant(`${viewer}|${subject}|${rival.hands}`, [
			`${name} and you have shared ${plural(rival.nights, 'night')}.`,
			`${plural(rival.hands, 'hand')} with ${name} so far.`
		])
	};
}
