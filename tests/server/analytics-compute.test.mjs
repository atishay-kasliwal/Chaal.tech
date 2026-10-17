import test from 'node:test';
import assert from 'node:assert/strict';
import { factsFor, handFacts } from '../../server/analytics/compute/facts.mjs';
import { overview, games, filterFacts, fairShare, results, windows, MIN } from '../../server/analytics/compute/performance.mjs';
import { collectDecisions, coreRates, situational } from '../../server/analytics/compute/patterns.mjs';
import { rivalries, rivalry } from '../../server/analytics/compute/rivals.mjs';
import { handDetail, nights } from '../../server/analytics/compute/history.mjs';
import { ownCards, deckFairness, teenPattiCategory, teenPattiTier, holdemStart, blackjackStart } from '../../server/analytics/compute/cards.mjs';
import { insights } from '../../server/analytics/compute/insights.mjs';
import { wilson, benjaminiHochberg, chiSquare, clusteredMean, evidence, shrinkMean } from '../../server/analytics/compute/stats.mjs';
import { hand, decide, timeoutEvent, T0 } from './helpers/records.mjs';

const DAY = 86_400_000;

/* ----------------------------------------- normalisation ----------------------------------------- */

test('chips are compared in boots: a ₹100 win at boot 10 and a ₹100 loss at boot 50 is +8 boots, not 0', () => {
	const records = [
		hand({ boot: 10, seats: [{ p: 'me', net: 100 }, { p: 'b', net: -100 }] }),
		hand({ boot: 50, seats: [{ p: 'me', net: -100 }, { p: 'b', net: 100 }] })
	];
	const facts = factsFor(records, 'me');
	assert.deepEqual(facts.map((f) => f.units), [10, -2]);
	assert.equal(results(facts).units, 8);
	assert.equal(facts.reduce((s, f) => s + f.net, 0), 0, 'raw chips would say even');
});

test("each game has its own stake unit: Hold'em big blinds, Blackjack own bet, Rummy points (kept apart)", () => {
	const holdem = hand({ game: 'texas-holdem', bigBlind: 4, seats: [{ p: 'me', net: 40 }, { p: 'b', net: -40 }] });
	const blackjack = hand({ game: 'blackjack', dealChips: { me: -20 }, seats: [{ p: 'me', net: 30 }] });
	const rummy = hand({ game: 'rummy', seats: [{ p: 'me', net: -25 }, { p: 'b', net: 25 }] });
	const [h, b, r] = factsFor([holdem, blackjack, rummy], 'me');
	assert.equal(h.units, 10);
	assert.equal(b.unit, 20);
	assert.equal(b.units, 1.5);
	assert.equal(b.fairShare, null, 'Blackjack is against the dealer: no fair share');
	assert.equal(r.stake, false);
	const ov = overview([h, b, r]);
	assert.equal(ov.results.units, 11.5, 'stake games only');
	assert.equal(ov.rummy.units, -25);
});

test('winning is judged against a fair share that depends on table size', () => {
	const records = [
		hand({ seats: [{ p: 'me', net: 20 }, { p: 'b', net: -20 }] }),
		hand({ seats: ['me', 'b', 'c', 'd', 'e', 'f'].map((p) => ({ p, net: p === 'me' ? 50 : -10 })) }),
		hand({ seats: ['me', 'b', 'c', 'd', 'e', 'f'].map((p) => ({ p, net: p === 'b' ? 50 : -10 })) })
	];
	const fair = fairShare(factsFor(records, 'me'));
	assert.equal(fair.wins, 2);
	assert.equal(fair.expected, Math.round((1 / 2 + 1 / 6 + 1 / 6) * 100) / 100);
	assert.equal(fair.verdict, 'insufficient', 'three hands prove nothing');
});

test('a split pot gives each winner half a win; a stopped hand counts for nothing', () => {
	const split = hand({ seats: [{ p: 'me', net: 10 }, { p: 'b', net: 10 }, { p: 'c', net: -20 }], winners: ['me', 'b'] });
	const stopped = hand({ stopped: true, seats: [{ p: 'me', net: 0 }, { p: 'b', net: 0 }] });
	const [s, x] = factsFor([split, stopped], 'me');
	assert.equal(s.won, 0.5);
	assert.equal(x.complete, false);
	assert.equal(x.units, 0);
	assert.equal(fairShare([s, x]).hands, 1);
});

test('loans are not results: the net is the hand outcome, whatever chips moved between friends', () => {
	const record = hand({ seats: [{ p: 'me', net: -10 }, { p: 'b', net: 10 }] });
	record.events.push({ i: 1, p: 'b', kind: 'player', raw: 'answerChipRequest', a: 'other', payload: {}, chips: { b: -100, me: 100 } });
	assert.equal(factsFor([record], 'me')[0].units, -1);
});

/* -------------------------------------- evidence and wording -------------------------------------- */

test('small samples say so: no verdict, no best game, "too few" rivalries', () => {
	const records = Array.from({ length: 6 }, (_, i) => hand({ seats: [{ p: 'me', net: i % 2 ? 30 : -10 }, { p: 'b', net: i % 2 ? -30 : 10 }] }));
	const facts = factsFor(records, 'me');
	assert.equal(results(facts).verdict, 'insufficient');
	const g = games(facts);
	assert.equal(g.labels.best.key, null);
	assert.equal(g.labels.best.reason, 'not-enough-hands');
	assert.equal(rivalries(records, 'me')[0].verdict, 'too-few');
	assert.equal(evidence(5, MIN.hands), 'insufficient');
});

test('consistent winning over many nights earns a "winning" verdict; a coin flip stays "about even"', () => {
	const steady = [];
	const noisy = [];
	for (let n = 0; n < 10; n++)
		for (let h = 0; h < 6; h++) {
			const night = `room:n${n}`;
			const at = T0 + n * DAY + h * 60_000;
			steady.push(hand({ night, at, seats: [{ p: 'me', net: h % 3 === 0 ? -10 : 20 }, { p: 'b', net: h % 3 === 0 ? 10 : -20 }] }));
			noisy.push(hand({ night, at, seats: [{ p: 'me', net: (n + h) % 2 ? 20 : -20 }, { p: 'b', net: (n + h) % 2 ? -20 : 20 }] }));
		}
	assert.equal(results(factsFor(steady, 'me')).verdict, 'winning');
	assert.equal(results(factsFor(noisy, 'me')).verdict, 'about-even');
	assert.equal(rivalries(noisy, 'me')[0].verdict, 'about-even');
});

test('best game is named only when clearly separated; most played and most profitable are separate', () => {
	const records = [];
	for (let n = 0; n < 12; n++)
		for (let h = 0; h < 10; h++) {
			const at = T0 + n * DAY + h * 60_000;
			records.push(hand({ night: `room:n${n}`, at, seats: [{ p: 'me', net: h % 4 === 0 ? -10 : 30 }, { p: 'b', net: h % 4 === 0 ? 10 : -30 }] }));
			if (h < 6) records.push(hand({ game: 'texas-holdem', night: `room:n${n}`, at: at + 1, seats: [{ p: 'me', net: h % 2 ? -8 : 6 }, { p: 'b', net: h % 2 ? 8 : -6 }] }));
		}
	const g = games(factsFor(records, 'me'));
	assert.equal(g.labels.mostPlayed, 'teen-patti');
	assert.equal(g.labels.best.key, 'teen-patti');
	assert.equal(g.labels.worst.key, 'texas-holdem');
	assert.equal(g.labels.mostProfitable, 'teen-patti');
});

test('shrinkage pulls a tiny variant toward the player average', () => {
	assert.equal(shrinkMean(5, 4, 0, 40), 5 * 4 / 44);
	const records = [
		...Array.from({ length: 60 }, (_, i) => hand({ seats: [{ p: 'me', net: i % 2 ? 10 : -10 }, { p: 'b', net: i % 2 ? -10 : 10 }] })),
		...Array.from({ length: 3 }, () => hand({ rulesVersion: 'muflis-1', seats: [{ p: 'me', net: 100 }, { p: 'b', net: -100 }] }))
	];
	const muflis = games(factsFor(records, 'me')).variants.find((v) => v.key === 'muflis-1');
	assert.equal(muflis.results.perHand, 10);
	assert.ok(muflis.shrunkPerHand < 1.5, 'three lucky hands are not a ten-boot edge');
});

/* --------------------------------------------- filters --------------------------------------------- */

test('game, variant, company, opponent, night and time filters select the right hands', () => {
	const now = T0 + 100 * DAY;
	const records = [
		hand({ at: now - 50 * DAY, night: 'room:old', seats: [{ p: 'me', net: 10 }, { p: 'b', net: -10 }] }),
		hand({ at: now - 2 * DAY, night: 'room:new', rulesVersion: 'muflis-1', seats: [{ p: 'me', net: 10 }, { p: 'c', net: -10 }] }),
		hand({ at: now - DAY, night: 'room:new', seats: [{ p: 'me', net: -10 }, { p: 'bot-1', bot: 'legacy-hard', net: 10 }] }),
		hand({ at: now - DAY + 1, night: 'room:new', game: 'texas-holdem', seats: [{ p: 'me', net: 4 }, { p: 'b', net: -4 }] })
	];
	const facts = factsFor(records, 'me');
	const count = (f) => filterFacts(facts, f, now).length;
	assert.equal(count({ game: 'texas-holdem' }), 1);
	assert.equal(count({ variant: 'muflis-1' }), 1);
	assert.equal(count({ company: 'bots' }), 1);
	assert.equal(count({ company: 'friends' }), 3);
	assert.equal(count({ opponent: 'b' }), 2);
	assert.equal(count({ opponent: 'bot:legacy-hard' }), 1);
	assert.equal(count({ night: 'room:old' }), 1);
	assert.equal(count({ window: '30d' }), 3);
	assert.equal(count({ window: 'recent-nights' }), 4);
	assert.equal(windows(facts, {}, now).length, 4);
});

/* --------------------------------------------- patterns --------------------------------------------- */

test('rates count only opportunities: a fold rate ignores turns where packing was not legal', () => {
	const noPack = { pack: false, bet: true, minBet: 10, maxBet: 20 };
	const record = hand({
		seats: [{ p: 'me', net: -30 }, { p: 'b', net: 30 }],
		events: [
			{ i: 0, p: 'me', kind: 'player', a: 'deal', raw: 'start', payload: {}, chips: {} },
			decide(1, 'me', 'call'),
			decide(2, 'b', 'raise'),
			decide(3, 'me', 'call', { legal: noPack, facing: 'raise' }),
			decide(4, 'b', 'raise'),
			decide(5, 'me', 'fold', { facing: 'raise' })
		]
	});
	const set = collectDecisions([record], () => ['me']);
	const core = coreRates(set);
	assert.equal(core.decisions, 3);
	assert.deepEqual(core.fold, { k: 1, n: 2 }, 'the turn without a legal pack is not a chance to fold');
	assert.deepEqual(core.raise, { k: 0, n: 3 });
});

test('timeouts and automatic actions are not voluntary decisions; disconnected timeouts are counted apart', () => {
	const record = hand({
		seats: [{ p: 'me', net: -10 }, { p: 'b', net: 10 }],
		events: [{ i: 0, p: 'me', kind: 'player', a: 'deal', raw: 'start', payload: {}, chips: {} }, decide(1, 'me', 'call'), decide(2, 'b', 'raise'), timeoutEvent(3, 'me', ['b'])]
	});
	const core = coreRates(collectDecisions([record], () => ['me']));
	assert.deepEqual(core.fold, { k: 0, n: 1 }, 'a timeout is not a fold');
	assert.deepEqual(core.timeout, { k: 1, n: 2 });
	assert.equal(core.disconnectedTimeouts, 1);
});

test('reaction to raises is a contrast with its own denominator and a test', () => {
	const records = [];
	for (let k = 0; k < 40; k++)
		records.push(
			hand({
				seats: [{ p: 'me', net: -10 }, { p: 'b', net: 10 }],
				events: [
					{ i: 0, p: 'me', kind: 'player', a: 'deal', raw: 'start', payload: {}, chips: {} },
					decide(1, 'me', k % 4 === 0 ? 'fold' : 'call'),
					decide(2, 'b', 'raise'),
					decide(3, 'me', k % 4 === 0 ? 'call' : 'fold', { facing: 'raise' })
				]
			})
		);
	const set = collectDecisions(records, () => ['me']);
	const facing = situational(set).find((s) => s.segment === 'facing-raise' && s.action === 'fold');
	assert.equal(facing.n, 40);
	assert.equal(facing.rate, 0.75);
	assert.equal(facing.baseline.rate, 0.25);
	assert.ok(facing.p < 0.001);
	assert.ok(facing.hands.length > 0, 'supporting hands are attached');
});

test('Teen Patti blind play: blind betting decisions before seeing are counted per hand', () => {
	const record = hand({
		seats: [{ p: 'me', net: -30 }, { p: 'b', net: 30 }],
		events: [
			{ i: 0, p: 'me', kind: 'player', a: 'deal', raw: 'start', payload: {}, chips: {} },
			decide(1, 'me', 'call', { blind: true }),
			decide(2, 'b', 'call'),
			decide(3, 'me', 'raise', { blind: true }),
			decide(4, 'b', 'call'),
			{ ...decide(5, 'me', 'see', { blind: true }), a: 'see', raw: 'see' },
			decide(6, 'me', 'fold')
		]
	});
	const core = coreRates(collectDecisions([record], () => ['me']));
	assert.equal(core.teenPatti.blindDecisionsPerHand, 2);
	assert.deepEqual(core.teenPatti.blindRaise, { k: 1, n: 2 });
	assert.deepEqual(core.teenPatti.seenRaise, { k: 0, n: 1 });
});

test('a hidden balance gives no stack-size data, so stack patterns skip it', () => {
	const record = hand({
		seats: [{ p: 'me', net: -10, hidden: true }, { p: 'b', net: 10 }],
		events: [{ i: 0, p: 'me', kind: 'player', a: 'deal', raw: 'start', payload: {}, chips: {} }, decide(1, 'me', 'call', { stackBefore: null })]
	});
	const [d] = collectDecisions([record], () => ['me']).decisions;
	assert.equal(d.stackUnits, null);
});

/* --------------------------------------------- rivals --------------------------------------------- */

test('head to head uses only the flows between the two, and groups a bot across tables by identity', () => {
	const records = [
		hand({ seats: [{ p: 'me', net: 30 }, { p: 'b', net: -10 }, { p: 'c', net: -20 }] }),
		hand({ seats: [{ p: 'me', net: -20 }, { p: 'b', net: 20 }] }),
		hand({ seats: [{ p: 'me', net: 10 }, { p: 'bot-x', bot: 'legacy-hard', net: -10 }] }),
		hand({ seats: [{ p: 'me', net: 10 }, { p: 'bot-y', bot: 'legacy-hard', net: -10 }] })
	];
	const list = rivalries(records, 'me');
	const b = list.find((r) => r.subject === 'b');
	assert.equal(b.hands, 2);
	assert.equal(b.units, -1, '+1 boot from b in hand one, -2 boots to b in hand two');
	assert.deepEqual(b.contests, { won: 1, lost: 1, split: 0 });
	const bot = list.find((r) => r.subject === 'bot:legacy-hard');
	assert.equal(bot.hands, 2, 'two table seats, one bot');
	assert.equal(bot.kind, 'bot');
	const detail = rivalry(records, 'me', 'b');
	assert.equal(detail.byGame[0].game, 'teen-patti');
	assert.equal(detail.recentHands.length, 2);
});

test("Hold'em side pots: flows reconcile with each net, so head to head adds up", () => {
	const record = hand({ game: 'texas-holdem', seats: [{ p: 'me', net: 150 }, { p: 'b', net: -100 }, { p: 'c', net: 30 }, { p: 'd', net: -80 }] });
	const list = rivalries([record], 'me');
	const total = list.reduce((s, r) => s + r.units * 2, 0);
	assert.ok(Math.abs(total - 150) < 0.1, `flows explain the net (${total})`);
});

/* -------------------------------------------- hand detail -------------------------------------------- */

test('a hand shows only what the viewer was entitled to see', () => {
	const record = hand({
		seats: [{ p: 'me', net: -10 }, { p: 'b', net: 30 }, { p: 'c', net: -20, hidden: true }],
		observers: [
			{ p: 'me', from: 0, until: 2 },
			{ p: 'b', from: 0, until: null },
			{ p: 'c', from: 0, until: null }
		],
		events: [
			{ i: 0, p: 'me', kind: 'player', a: 'deal', raw: 'start', payload: {}, chips: {} },
			decide(1, 'me', 'call'),
			decide(2, 'b', 'raise'),
			decide(3, 'c', 'fold')
		],
		shown: [
			{ p: 'b', cards: [{ rank: 14, suit: 'hearts' }], label: 'High card Ace', at: 3, observedBy: ['c'], absent: ['me'] },
			{ p: 'c', cards: [{ rank: 2, suit: 'clubs' }], label: 'High card 2', at: 1, observedBy: ['me', 'b'], absent: [] }
		]
	});
	const own = { dealt: [{ rank: 9, suit: 'spades' }], final: [{ rank: 9, suit: 'spades' }], label: 'High card 9' };
	const view = handDetail(record, 'me', own, { b: { name: 'Bina' } });
	assert.deepEqual(view.events.map((e) => e.i), [0, 1], 'nothing after the viewer left');
	assert.ok(view.events.find((e) => e.i === 1).yours, 'own decision context');
	assert.equal(view.shown.length, 1);
	assert.equal(view.shown[0].subject, 'c', "b's cards were shown after the viewer left");
	assert.equal(view.seats.find((s) => s.subject === 'c').stack, null, 'a hidden balance stays hidden');
	assert.deepEqual(view.yourCards.final, own.final);
	const json = JSON.stringify(view);
	for (const key of ['preDeal', 'steps', 'deck', 'salts', 'botTrace', 'connected', '"ms"']) assert.ok(!json.includes(key), key);
	assert.equal(handDetail(record, 'stranger', null), null, 'not at the table: nothing');
	const asB = handDetail(record, 'b', null);
	assert.ok(asB.events.every((e) => !e.yours || e.by.subject === 'b'), 'only your own decision context');
	assert.equal(asB.events.find((e) => e.i === 1).yours, undefined);
});

test('nights list totals boots per night and marks nights with bots', () => {
	const records = [
		hand({ night: 'room:a', seats: [{ p: 'me', net: 20 }, { p: 'b', net: -20 }] }),
		hand({ night: 'room:a', seats: [{ p: 'me', net: -10 }, { p: 'bot-1', bot: 'legacy-easy', net: 10 }] })
	];
	const [night] = nights(factsFor(records, 'me'));
	assert.equal(night.hands, 2);
	assert.equal(night.units, 1);
	assert.equal(night.withBots, true);
});

/* --------------------------------------------- cards --------------------------------------------- */

const c = (rank, suit) => ({ rank, suit });
test('Teen Patti categories and tiers come from the variant (Muflis reversed)', () => {
	const trail = { rulesVersion: 'classic-1', final: [c(9, 'hearts'), c(9, 'spades'), c(9, 'clubs')] };
	assert.equal(teenPattiCategory(trail), 'trail');
	assert.equal(teenPattiTier('trail', 'classic-1'), 'strong');
	assert.equal(teenPattiTier('high-card', 'muflis-1'), 'strong');
	assert.equal(teenPattiCategory({ rulesVersion: 'muflis-1', final: [c(2, 'hearts'), c(9, 'spades'), c(12, 'clubs')] }), 'high-card');
	assert.equal(teenPattiCategory({ rulesVersion: 'joker-1', final: [c(2, 'hearts')], label: 'Pair of 9s' }), 'pair', 'label fallback');
	assert.deepEqual(holdemStart([c(14, 'hearts'), c(13, 'spades')]), { name: 'ace-king', tier: 'premium' });
	assert.equal(blackjackStart([c(14, 'hearts'), c(13, 'spades')]), 'blackjack');
});

test('own card analytics group results by strength and never need anyone else’s cards', () => {
	const records = [
		hand({ id: 'x1', seats: [{ p: 'me', net: 40 }, { p: 'b', net: -40 }] }),
		hand({ id: 'x2', seats: [{ p: 'me', net: -10, exit: 'fold' }, { p: 'b', net: 10 }] })
	];
	const facts = factsFor(records, 'me');
	const owns = [
		{ handId: 'room:x1', p: 'me', gameType: 'teen-patti', rulesVersion: 'classic-1', dealt: [c(9, 'hearts'), c(9, 'spades'), c(9, 'clubs')], final: [c(9, 'hearts'), c(9, 'spades'), c(9, 'clubs')] },
		{ handId: 'room:x2', p: 'me', gameType: 'teen-patti', rulesVersion: 'classic-1', dealt: [c(2, 'hearts'), c(7, 'spades'), c(11, 'clubs')], final: [c(2, 'hearts'), c(7, 'spades'), c(11, 'clubs')] }
	];
	const cards = ownCards(owns, new Map(facts.map((f) => [f.handId, f])));
	const strong = cards.teenPatti.tiers.find((t) => t.key === 'strong');
	const weak = cards.teenPatti.tiers.find((t) => t.key === 'weak');
	assert.equal(strong.units, 4);
	assert.equal(weak.packed, 1);
});

test('deck fairness: fair dealing reads fair, a rigged deck reads unusual, a few hands read insufficient', () => {
	const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
	const fair = [];
	for (let k = 0; k < 120; k++) fair.push({ gameType: 'teen-patti', rulesVersion: 'classic-1', dealt: [0, 1, 2].map((j) => c(2 + ((k * 3 + j) % 13), suits[(k + j) % 4])) });
	assert.equal(deckFairness(fair).verdict, 'fair');
	const rigged = fair.map((o) => ({ ...o, dealt: [c(14, 'spades'), c(14, 'hearts'), c(13, 'spades')] }));
	assert.equal(deckFairness(rigged).verdict, 'unusual');
	assert.equal(deckFairness(fair.slice(0, 10)).verdict, 'insufficient');
	assert.match(deckFairness(fair).note, /chance/);
});

/* --------------------------------------------- insights --------------------------------------------- */

test('insights: noise yields nothing; a strong, large effect survives correction with hedged words', () => {
	const noise = Array.from({ length: 12 }, (_, i) => ({ segment: `s${i}`, label: `S${i}`, action: 'raise', rate: 0.3, baseline: { rate: 0.28 }, diff: 0.02, n: 40, p: 0.4 + i / 100, evidence: 'early', hands: [] }));
	assert.equal(insights({ subject: 'me', situational: noise }).filter((i) => i.eligible).length, 0);
	const strong = [...noise, { segment: 'after-loss', label: 'After losing a hand', action: 'raise', rate: 0.6, baseline: { rate: 0.2 }, diff: 0.4, n: 80, p: 0.00001, evidence: 'moderate', hands: ['room:h1'] }];
	const shown = insights({ subject: 'me', situational: strong }).filter((i) => i.eligible);
	assert.equal(shown.length, 1);
	const [one] = shown;
	assert.equal(one.type, 'pattern');
	assert.equal(one.segment, 'after-loss');
	assert.equal(one.n, 80);
	assert.deepEqual(one.supportingHands, ['room:h1']);
	assert.ok(one.confidence.q < 0.01);
	assert.match(one.text, /consistently raise more.*60%.*20%.*80 chances/);
	for (const key of ['type', 'subject', 'metric', 'value', 'baseline', 'difference', 'n', 'confidence', 'window', 'game', 'variant', 'opponent', 'supportingHands', 'eligible'])
		assert.ok(key in one, key);
});

test('a significant but tiny effect is not shown', () => {
	const tiny = [{ segment: 'late-night', label: 'Late', action: 'fold', rate: 0.31, baseline: { rate: 0.29 }, diff: 0.02, n: 5000, p: 0.0001, evidence: 'strong', hands: [] }];
	const [one] = insights({ subject: 'me', situational: tiny });
	assert.equal(one.eligible, false);
	assert.equal(one.reason, 'effect-too-small');
});

/* ----------------------------------------------- stats ----------------------------------------------- */

test('statistics helpers behave', () => {
	const w = wilson(0, 10);
	assert.equal(w.low, 0);
	assert.ok(w.high > 0.25 && w.high < 0.35);
	const bh = benjaminiHochberg([{ p: 0.001 }, { p: 0.04 }, { p: 0.5 }], 0.1);
	assert.deepEqual(bh.map((x) => x.significant), [true, true, false]);
	assert.ok(Math.abs(chiSquare([10, 10, 10, 10], [10, 10, 10, 10]).p - 1) < 1e-9);
	assert.ok(chiSquare([40, 0, 0, 0], [10, 10, 10, 10]).p < 1e-6);
	assert.equal(clusteredMean([{ sum: 10, n: 5 }]).se, null, 'one night has no spread');
	assert.equal(handFacts(hand({ seats: [{ p: 'a', net: 0 }] })).size, 1);
});

/* ------------------------------ one layer for people and bots ------------------------------ */

test('the same layer analyses a bot: results, patterns and its rivals, by permanent identity', () => {
	const records = [];
	for (let k = 0; k < 6; k++)
		records.push(
			hand({
				seats: [{ p: 'me', net: k % 2 ? -10 : 20 }, { p: `bot-seat-${k}`, bot: 'legacy-hard', net: k % 2 ? 10 : -20 }],
				events: [
					{ i: 0, p: 'me', kind: 'player', a: 'deal', raw: 'start', payload: {}, chips: {} },
					decide(1, `bot-seat-${k}`, k % 3 ? 'call' : 'raise', { kind: 'bot' }),
					decide(2, 'me', 'call')
				]
			})
		);
	const botFacts = factsFor(records, 'bot:legacy-hard');
	assert.equal(botFacts.length, 6, 'six table seats, one bot');
	assert.equal(results(botFacts).units, -3);
	const set = collectDecisions(records, (r) => r.seats.filter((s) => s.bot?.botId === 'legacy-hard').map((s) => s.p));
	assert.deepEqual(coreRates(set).raise, { k: 2, n: 6 }, 'bot decisions count like anyone’s');
	const botRivals = rivalries(records.map((r) => ({ ...r, seats: r.seats.map((s) => (s.kind === 'bot' ? { ...s, p: 'the-bot' } : s)), flows: r.flows.map((f) => ({ from: f.from.startsWith('bot') ? 'the-bot' : f.from, to: f.to.startsWith('bot') ? 'the-bot' : f.to, amt: f.amt })), outcome: { ...r.outcome, players: r.outcome.players.map((p) => ({ ...p, p: p.p.startsWith('bot') ? 'the-bot' : p.p })), winners: r.outcome.winners.map((w) => ({ ...w, p: w.p.startsWith('bot') ? 'the-bot' : w.p })) } })), 'the-bot');
	assert.equal(botRivals[0].subject, 'me', 'a bot can have rivals too');
});
