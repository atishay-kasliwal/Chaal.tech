import test from 'node:test';
import assert from 'node:assert/strict';
import { rivalries } from '../../server/analytics/compute/rivals.mjs';
import { rivalryBoard, rivalryLine, rivalryPage } from '../../server/analytics/intel/rivalry.mjs';
import { personalRecords, recordsBroken, clubRecords } from '../../server/analytics/intel/records.mjs';
import { achievements } from '../../server/analytics/intel/achievements.mjs';
import { nightSurprises } from '../../server/analytics/intel/surprise.mjs';
import { rankInsights, scoreInsight, COOLDOWN_DAYS } from '../../server/analytics/intel/ranking.mjs';
import { buildRecap, sharedNight } from '../../server/analytics/intel/recap.mjs';
import { tierOf, worded, variant, plain } from '../../server/analytics/intel/language.mjs';
import { hand, factsFor, DAY, T0, seeded } from './helpers/intel.mjs';

const NOW = T0 + 120 * DAY;
const names = { friend: { name: 'Arjun' }, pal: { name: 'Priya' }, 'bot:raju': { name: 'Raju' }, 'bot:nem': { name: 'Nemesis' } };
const HOSTILE = /worst|loser|weakest|easiest|exploitable|bad at/i;

/** `me` against one opponent over several nights; `net(i)` is my result in boots on hand i. */
function against(opp, { hands = 40, perNight = 8, bot = false, net = () => 0, start = T0, step = DAY }) {
	return Array.from({ length: hands }, (_, i) => {
		const n = net(i);
		return hand({
			id: `${opp}-${i}`,
			at: start + Math.floor(i / perNight) * step + (i % perNight) * 60_000,
			night: `room:${opp}-${Math.floor(i / perNight)}`,
			boot: 10,
			seats: [{ p: 'me', net: n * 10 }, { p: opp, net: -n * 10, ...(bot ? { bot: opp.replace('bot-', '') } : {}) }]
		});
	});
}

test('rivalry titles come from real shared history, with plain facts and no composite score', () => {
	const records = [
		...against('friend', { hands: 48, net: (i) => (i % 2 ? 1 : -1) }), // dead level
		...against('pal', { hands: 20, net: (i) => (i % 4 === 0 ? 3 : -1), start: T0 + 60 * DAY }),
		...against('bot-nem', { bot: true, hands: 60, net: (i) => (i % 3 === 0 ? 1 : -3), start: T0 + 5 * DAY }),
		...against('bot-raju', { bot: true, hands: 60, net: (i) => (i % 3 === 0 ? -1 : 3), start: T0 + 5 * DAY })
	];
	// Bots are grouped by their permanent identity.
	records.forEach((r) => r.seats.forEach((s) => { if (s.bot) s.bot.botId = s.p.replace('bot-', ''); }));
	const rivals = rivalries(records, 'me', NOW);
	const board = rivalryBoard(rivals, names);
	assert.equal(board.closest.subject, 'friend');
	assert.match(board.closest.headline, /apart after 48 hands/);
	assert.equal(board.mostPlayed.subject, 'friend', 'most played among people comes first');
	assert.equal(board.botNemesis.subject, 'bot:nem');
	assert.equal(board.botHandledBest.subject, 'bot:raju');
	assert.ok(board.longest.facts.some((f) => /First hand 2026/.test(f)));
	assert.ok(board.biggestSwing.handId);
	for (const t of Object.values(board).filter((t) => t && t.id)) {
		assert.ok(!('score' in t), 'no hidden composite score is exposed');
		assert.ok(t.facts.length >= 1, 'each title lists the plain facts that earned it');
	}
	const human = JSON.stringify([board.closest, board.longest, board.mostPlayed, board.recentChallenger]);
	assert.doesNotMatch(human, HOSTILE);
});

test('a recent challenger is someone doing better against you than they usually do', () => {
	const records = [
		...against('friend', { hands: 40, net: () => 1, start: T0 }), // I used to win
		...against('friend', { hands: 24, net: () => -2, start: T0 + 100 * DAY }) // lately they win
	];
	const board = rivalryBoard(rivalries(records, 'me', NOW), names);
	assert.equal(board.recentChallenger.subject, 'friend');
	assert.match(board.recentChallenger.headline, /better against you lately/);
});

test('new rivalries stay quiet: too few hands says so instead of naming a rival', () => {
	const records = against('friend', { hands: 6 });
	const rivals = rivalries(records, 'me', NOW);
	const board = rivalryBoard(rivals, names);
	assert.equal(board.closest, null);
	assert.match(board.note, /after 30 hands and 3 nights/);
	assert.match(rivalryLine(rivals[0], 'Arjun'), /need more hands before we can call this a rivalry/);
});

test('a rivalry page shows history but never an opponent’s hidden cards or private numbers', () => {
	const records = against('friend', { hands: 40, net: (i) => (i % 3 ? 1 : -2) });
	records[3].shown = [{ p: 'friend', at: 2, label: 'Sequence', cards: [{ rank: 2, suit: 'hearts' }], observedBy: ['me'] }];
	const rival = rivalries(records, 'me', NOW)[0];
	const page = rivalryPage({ rival: { ...rival, byGame: [] }, records, viewer: 'me', names });
	assert.equal(page.name, 'Arjun');
	assert.ok(page.moments.length === 1 && page.moments[0].hand === 'Sequence');
	const text = JSON.stringify(page);
	assert.doesNotMatch(text, /"cards"|dealt|final|hole/);
	assert.ok(page.timeline.length > 0 && page.recentNights.length > 0 && page.largestPots.length > 0);
});

/* ---------------------------------------- records and achievements ---------------------------------------- */

test('personal records derive from history, carry evidence ids, and compare before/after a night', () => {
	const night = (n, nets) => nets.map((net, i) => hand({ id: `r${n}-${i}`, at: T0 + n * DAY + i * 60_000, night: `room:n${n}`, boot: 10, seats: [{ p: 'me', net: net * 10 }, { p: 'b', net: -net * 10 }] }));
	const before = [...night(0, [1, 1, -1, 2, 1, 1, -1, 1, 1, 1, 1]), ...night(1, [-3, -4, 5, 5, 5, 3, 1])];
	const all = [...before, ...night(2, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4])];
	const mine = (list) => factsFor(list, 'me');
	const a = personalRecords({ facts: mine(before) });
	const b = personalRecords({ facts: mine(all) });
	const best = b.find((r) => r.id === 'best-night');
	assert.equal(best.value, 48);
	assert.ok(best.nightId.endsWith('n2'));
	assert.ok(b.find((r) => r.id === 'biggest-comeback') || a.find((r) => r.id === 'biggest-comeback'), 'the night that started -7 and finished +11 is a comeback');
	const broken = recordsBroken(a, b, 'room:n2');
	assert.ok(broken.some((r) => r.id === 'best-night' && r.previous === 12));
	assert.deepEqual(recordsBroken([], b, 'room:n2'), [], 'the first night cannot "break" records nobody held');
	for (const r of b) assert.ok(r.nightId || r.handId || r.subject, `${r.id} has evidence`);
});

test('club records are celebratory only: no worst, loser or easiest labels, and holders are first names', () => {
	const records = [
		...against('friend', { hands: 24, net: (i) => (i % 2 ? 4 : -3) }),
		...against('pal', { hands: 24, net: (i) => (i % 2 ? 1 : -1), start: T0 + 30 * DAY }),
		...against('bot-raju', { bot: true, hands: 24, start: T0 + 60 * DAY })
	];
	records.forEach((r) => r.seats.forEach((s) => { if (s.bot) s.bot.botId = 'raju'; }));
	const club = clubRecords(records, names);
	const text = JSON.stringify(club);
	assert.doesNotMatch(text, HOSTILE);
	assert.ok(club.records.find((r) => r.id === 'biggest-pot'));
	assert.equal(club.records.find((r) => r.id === 'top-bot').value, 'Raju');
	assert.deepEqual(clubRecords([], names), { empty: true, records: [] });
});

test('achievements are few, earned from real moments, and never reward betting more', () => {
	const records = against('friend', { hands: 120, perNight: 6, net: (i) => (i % 3 ? 1 : -1) });
	const facts = factsFor(records, 'me');
	const set = { hands: [{ handId: records[10]._id, showWon: true, blindDecisions: 5 }] };
	const rows = [{ fact: facts[7], band: 'weak', game: 'teen-patti' }];
	const out = achievements({ facts, set, rows, botIds: ['raju'], names });
	const ids = out.earned.map((a) => a.id);
	for (const id of ['hands-100', 'first-show-win', 'weak-hand-win', 'blind-run', `nights-10:friend`]) assert.ok(ids.includes(id), `earned ${id}`);
	assert.ok(!ids.includes('hands-1000'));
	assert.equal(out.earned.find((a) => a.id === 'hands-100').earnedAt, facts[99].completedAt);
	assert.ok(out.next.length <= 3);
	assert.doesNotMatch(JSON.stringify(out), /biggest|largest|pot size|loss|bet more/i);
});

/* ---------------------------------------- surprise, ranking, recap ---------------------------------------- */

const decision = (handId, action, extra = {}) => ({ handId, betting: true, game: 'teen-patti', options: { raise: true, fold: true }, action, facing: 'none', ...extra });
function history({ nightRaise, usualRaise, seed = 1 }) {
	const rng = seeded(seed);
	const decisions = [];
	const facts = [];
	for (let h = 0; h < 40; h++) {
		const id = `old${h}`;
		facts.push({ handId: id, nightId: `room:old${Math.floor(h / 10)}`, completedAt: T0 + h * 60_000, startedAt: T0 + h * 60_000 - 1000, complete: true, stake: true, units: 0, potUnits: 10 });
		for (let k = 0; k < 4; k++) decisions.push(decision(id, rng() < usualRaise ? 'raise' : 'call'));
	}
	for (let h = 0; h < 8; h++) {
		const id = `new${h}`;
		facts.push({ handId: id, nightId: 'room:tonight', completedAt: T0 + DAY + h * 60_000, startedAt: T0 + DAY + h * 60_000 - 1000, complete: true, stake: true, units: 0, potUnits: 10 });
		for (let k = 0; k < 3; k++) decisions.push(decision(id, rng() < nightRaise ? 'raise' : 'call'));
	}
	return { facts, set: { decisions, hands: [] } };
}

test('a clearly different night is noticed, against the person’s own baseline', () => {
	const { facts, set } = history({ nightRaise: 0.8, usualRaise: 0.25 });
	const out = nightSurprises({ nightId: 'room:tonight', facts, set });
	const s = out.find((x) => x.type === 'aggressive-night');
	assert.ok(s, 'aggression surprise');
	assert.match(s.text, /raised more than usual tonight/);
	assert.ok(s.confidence >= 0.45 && s.evidence.hands.length > 0);
});

test('surprise detection false positives stay rare when nothing changed', () => {
	let flagged = 0;
	const trials = 300;
	for (let t = 0; t < trials; t++) {
		const { facts, set } = history({ nightRaise: 0.3, usualRaise: 0.3, seed: 5000 + t });
		if (nightSurprises({ nightId: 'room:tonight', facts, set }).some((s) => s.type.endsWith('night'))) flagged++;
	}
	assert.ok(flagged / trials < 0.05, `false positive rate ${flagged / trials}`);
});

test('too little baseline means no surprise: "usual" is unknown yet', () => {
	const { facts, set } = history({ nightRaise: 0.9, usualRaise: 0.1 });
	const thin = { facts: facts.filter((f) => f.nightId === 'room:tonight' || f.handId < 'old3'), set: { ...set, decisions: set.decisions.filter((d) => d.handId.startsWith('new') || d.handId === 'old0') } };
	assert.deepEqual(nightSurprises({ nightId: 'room:tonight', ...thin }).filter((s) => s.type.endsWith('night')), []);
});

test('insight ranking: confident, large, new things first; repeats suppressed; one topic cannot fill the page', () => {
	const mk = (id, topic, confidence, magnitude, at = NOW) => ({ id, topic, scope: 'personal', confidence, magnitude, text: id, at });
	const shown = new Map([['old-news', { lastShown: NOW - 2 * DAY, count: 3, topic: 'x' }]]);
	const ranked = rankInsights([mk('a', 't1', 0.95, 0.9), mk('b', 't1', 0.9, 0.9), mk('c', 't1', 0.9, 0.8), mk('d', 't2', 0.5, 0.2), mk('old-news', 'x', 0.99, 1), mk('weak', 't3', 0.2, 1)], { shown, now: NOW, limit: 5, min: 2 });
	assert.deepEqual(ranked.map((r) => r.id).slice(0, 2), ['a', 'b']);
	assert.ok(!ranked.some((r) => r.id === 'weak'), 'low confidence never ranks');
	assert.ok(ranked.filter((r) => r.topic === 't1').length <= 2);
	assert.ok(!ranked.some((r) => r.id === 'old-news'), `shown ${COOLDOWN_DAYS - 12} days ago and again: skipped`);
	const again = scoreInsight(mk('a', 't1', 0.95, 0.9), new Map([['a', { lastShown: NOW - 3 * DAY, count: 1 }]]), NOW);
	assert.equal(again.components.novelty, 0, 'inside the cooldown a repeat has no novelty');
	assert.ok(scoreInsight(mk('a', 't1', 0.95, 0.9), new Map(), NOW).score > again.score);
});

test('the shared recap is public-only, concise, and prefers a few good facts over many', () => {
	const records = [];
	for (let i = 0; i < 30; i++)
		records.push(hand({ id: `n${i}`, at: T0 + i * 60_000, night: 'room:big', boot: 10, seats: [{ p: 'me', net: i % 3 ? 30 : -40 }, { p: 'friend', net: i % 3 ? -30 : 40 }, { p: 'bot-raju', bot: 'raju', net: 0, exit: 'fold' }], pot: i === 4 ? 400 : 60 }));
	records.forEach((r) => r.seats.forEach((s) => { if (s.bot) s.bot.botId = 'raju'; }));
	const shared = sharedNight(records, names);
	assert.equal(shared.hands, 30);
	assert.ok(shared.winner && shared.bigPot.units === 40 && shared.closest);
	const recap = buildRecap({ nightId: 'room:big', viewer: 'me', shared, viewerFacts: factsFor(records, 'me'), names, now: NOW });
	assert.ok(recap.highlights.length >= 3 && recap.highlights.length <= 6);
	assert.ok(recap.highlights.every((h) => h.evidence && h.why));
	assert.doesNotMatch(JSON.stringify(recap), /dealt|final|cards"/);
	const empty = buildRecap({ nightId: 'room:small', viewer: 'me', shared: sharedNight([hand({ seats: [{ p: 'me', net: 10 }, { p: 'b', net: -10 }] })], names), viewerFacts: [], names, now: NOW });
	assert.ok(empty.empty || empty.highlights.length <= 2);
});

/* ---------------------------------------- language ---------------------------------------- */

test('statistical language: strong states it, moderate hedges, weak shows raw numbers only', () => {
	assert.equal(tierOf({ n: 200, min: 20, p: 0.001 }), 'strong');
	assert.equal(tierOf({ n: 40, min: 20, p: 0.03 }), 'moderate');
	assert.equal(tierOf({ n: 40, min: 20, p: 0.2 }), 'weak');
	assert.equal(tierOf({ n: 5, min: 20, p: 0.0001 }), 'weak', 'a tiny sample is never strong');
	const words = { strong: 'You pack.', moderate: 'You tend to pack.', raw: '7 of 9' };
	assert.equal(worded('strong', words), 'You pack.');
	assert.equal(worded('moderate', words), 'You tend to pack.');
	assert.equal(worded('weak', words), '7 of 9');
	assert.equal(variant('night-1', ['a', 'b', 'c']), variant('night-1', ['a', 'b', 'c']), 'wording is stable across refreshes');
	assert.equal(plain('Good — very good'), 'Good, very good', 'no em dashes reach a player');
});
