/**
 * Achievements: a short, restrained list that comes out of real card-game moments and history
 * (docs/archive/ANALYTICS_PHASE5.md, "Achievements"). They are derived on demand, never stored, so they can
 * never drift from the hand history. None rewards a bigger bet, a bigger pot, losing, or speed, so
 * nothing here nudges anyone to gamble more.
 */

const GAME_COUNT = 4;

function nth(list, n, at) {
	return list.length >= n ? at(list[n - 1]) : null;
}

/**
 * @param facts the player's facts, any order
 * @param set collectDecisions() output
 * @param rows playRows() (for the weak-hand win)
 * @param botIds the club's current bots, for "beat every bot"
 * @param names subject → { name }
 */
export function achievements({ facts, set = { hands: [] }, rows = [], botIds = [], names = {} }) {
	const sorted = [...facts].sort((a, b) => a.completedAt - b.completedAt);
	const complete = sorted.filter((f) => f.complete);
	const out = [];
	const add = (id, title, description, earnedAt, progress = null) => out.push({ id, title, description, earnedAt, progress });
	const handFact = new Map(sorted.map((f) => [f.handId, f]));

	const showWin = set.hands.map((h) => handFact.get(h.handId)).filter((f) => f && f.exit === 'won').find((f) => set.hands.find((h) => h.handId === f.handId)?.showWon);
	add('first-show-win', 'First Show win', 'Won a hand by calling a Show.', showWin?.completedAt ?? null);
	add('hands-100', '100 hands', 'Played 100 hands at the club.', nth(complete, 100, (f) => f.completedAt), { value: complete.length, target: 100 });
	add('hands-1000', '1,000 hands', 'Played 1,000 hands at the club.', nth(complete, 1000, (f) => f.completedAt), { value: complete.length, target: 1000 });

	const seenGames = new Map();
	for (const f of sorted) if (!seenGames.has(f.gameType)) seenGames.set(f.gameType, f.completedAt);
	add('every-game', 'Played every game', `Played ${GAME_COUNT === 4 ? 'Teen Patti, Hold’em, Blackjack and Rummy' : 'every game'}.`, seenGames.size >= GAME_COUNT ? Math.max(...seenGames.values()) : null, { value: seenGames.size, target: GAME_COUNT });

	const seenVariants = new Map();
	for (const f of sorted) if (f.gameType === 'teen-patti' && f.rulesVersion && !seenVariants.has(f.rulesVersion)) seenVariants.set(f.rulesVersion, f.completedAt);
	add('variety-5', 'Five flavours', 'Played five different Teen Patti variants.', seenVariants.size >= 5 ? [...seenVariants.values()][4] : null, { value: seenVariants.size, target: 5 });

	const weak = rows.filter((r) => r.band === 'weak' && r.fact.won > 0).sort((a, b) => a.fact.completedAt - b.fact.completedAt)[0];
	add('weak-hand-win', 'Won with a weak hand', 'Won a hand holding one of the weaker holdings the deck could deal.', weak?.fact.completedAt ?? null);

	const blind = set.hands.filter((h) => h.blindDecisions >= 4).map((h) => handFact.get(h.handId)).filter((f) => f && f.won > 0).sort((a, b) => a.completedAt - b.completedAt)[0];
	add('blind-run', 'Long blind run', 'Stayed blind for four turns and won the hand.', blind?.completedAt ?? null);

	// Milestones with one opponent, in order of meeting.
	const meetings = new Map();
	const nights = new Map();
	for (const f of complete)
		for (const o of f.opponents) {
			if (!meetings.has(o.subject)) meetings.set(o.subject, []);
			meetings.get(o.subject).push(f.completedAt);
			if (!nights.has(o.subject)) nights.set(o.subject, new Map());
			if (!nights.get(o.subject).has(f.nightId)) nights.get(o.subject).set(f.nightId, f.completedAt);
		}
	const nameOf = (s) => names[s]?.name ?? (s.startsWith('bot:') ? 'a bot' : 'a friend');
	for (const [subject, times] of [...meetings.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 6)) {
		if (times.length >= 50) add(`rivalry-100:${subject}`, `${times.length >= 100 ? '100' : '50'} hands with ${nameOf(subject)}`, `Shared ${times.length >= 100 ? 100 : 50} hands.`, times[times.length >= 100 ? 99 : 49], { value: times.length, target: times.length >= 100 ? 100 : 50 });
		const n = [...nights.get(subject).values()].sort((a, b) => a - b);
		if (n.length >= 10) add(`nights-10:${subject}`, `10 nights with ${nameOf(subject)}`, 'Played together across ten different nights.', n[9], { value: n.length, target: 10 });
	}

	if (botIds.length) {
		const beaten = new Map();
		for (const f of complete) if (f.won > 0) for (const o of f.opponents) if (o.kind === 'bot' && !beaten.has(o.subject)) beaten.set(o.subject, f.completedAt);
		const got = botIds.filter((b) => beaten.has(`bot:${b}`));
		add('beat-every-bot', 'Beat every club bot', 'Won a hand with every current bot at the table.', got.length === botIds.length ? Math.max(...got.map((b) => beaten.get(`bot:${b}`))) : null, { value: got.length, target: botIds.length });
	}
	return { earned: out.filter((a) => a.earnedAt).sort((a, b) => b.earnedAt - a.earnedAt), next: out.filter((a) => !a.earnedAt && a.progress && a.progress.value > 0).sort((a, b) => b.progress.value / b.progress.target - a.progress.value / a.progress.target).slice(0, 3) };
}
