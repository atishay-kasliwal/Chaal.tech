import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runTable } from '../../server/sim/table.mjs';
import { CANONICAL_STYLES, STYLES } from '../../server/bots/dna-styles.mjs';
import { MIND_RULES, POLICIES } from '../../server/bots/policies.mjs';
import { MIND_VERSIONS, emptyMind } from '../../server/bots/mind.mjs';
import { CHARACTER_POLICY_V6, recallSuspects } from '../../server/bots/character-v6.mjs';
import { QUIRKS_V6 } from '../../server/bots/quirks.mjs';
import { HISTORICAL, historicalCandidate, leagueRoster } from '../../server/sim/league.mjs';
import {
	EXPLOITS,
	adversary,
	describe,
	randomGenome,
	mutateGenome
} from '../../server/sim/adversary.mjs';
import { SAMAY_CHALLENGERS } from '../../server/sim/challengers.mjs';
import { stream } from '../../server/sim/seeds.mjs';
import { newRoom, transition, projection } from '../../server/engine.mjs';
import { freshDeck } from '../../server/classic.mjs';
import { botDue } from '../../server/bots/runner.mjs';

/* Phase 4: frozen champions, the league, adversaries, and the tp-dna@6 challenger policy. */

const digest = (hands) =>
	createHash('sha256')
		.update(
			JSON.stringify(hands.map((h) => h.decisions.map((d) => [d.seat, d.name, d.reason, d.draws])))
		)
		.digest('hex');

test('champions are frozen: each canonical style still matches docs/bots/phase4/champions.json', () => {
	const record = JSON.parse(
		readFileSync(new URL('../../docs/bots/phase4/champions.json', import.meta.url), 'utf8')
	);
	assert.deepEqual(Object.keys(record.champions).sort(), Object.keys(CANONICAL_STYLES).sort());
	for (const [c, x] of Object.entries(record.champions)) {
		const s = CANONICAL_STYLES[c];
		assert.equal(s._id, x.style, c);
		assert.equal(s.policy, x.policy, c);
		assert.equal(s.configHash, x.configHash, c);
		assert.equal(MIND_VERSIONS[MIND_RULES[s.policy]], x.mind, c);
		assert.deepEqual(s.tendencies.dna, x.dna, c);
	}
});

test('league: historical candidates rebuild to the configuration they were measured under', () => {
	for (const h of HISTORICAL.filter((x) => x.key.includes('-c'))) {
		const m = historicalCandidate(h.key);
		assert.equal(m.style._id, h.key);
	}
	for (const h of HISTORICAL.filter((x) => !x.key.includes('-c'))) assert.ok(STYLES[h.key], h.key);
	assert.ok(leagueRoster().length >= 40);
});

test('tp-dna@6 is offline only, and without event quirks decides exactly as tp-dna@3', () => {
	assert.ok(POLICIES[CHARACTER_POLICY_V6]);
	assert.equal(MIND_RULES[CHARACTER_POLICY_V6], 4);
	for (const s of Object.values(STYLES)) assert.notEqual(s.policy, CHARACTER_POLICY_V6);
	for (const c of ['samay-raina', 'ms-dhoni']) {
		const s = CANONICAL_STYLES[c];
		const v6 = { id: `${c}-v6`, style: { ...s, _id: `${c}-v6`, policy: CHARACTER_POLICY_V6 } };
		const field = ['human-bluffer', 'gg@4', 'human-station', 'legacy-hard'];
		const play = (hero) =>
			digest(runTable({ seed: 44, table: 2, seats: [hero, ...field], hands: 60, matched: true }));
		assert.equal(play(v6), play(s._id), c);
	}
});

test('remembersYou acts only facing a raiser it recently caught bluffing, and fades', () => {
	const sit = { seen: true };
	const q = QUIRKS_V6.remembersYou;
	assert.equal(q.apply(sit, 1, null, { facing: null, suspect: { a: 1 } }), null);
	assert.equal(q.apply(sit, 1, null, { facing: { id: 'b' }, suspect: { a: 1 } }), null);
	assert.equal(q.apply({ seen: false }, 1, null, { facing: { id: 'a' }, suspect: { a: 1 } }), null);
	const d = q.apply(sit, 1, null, { facing: { id: 'a' }, suspect: { a: 1 } });
	assert.ok(d.chaal > 0 && d.pack < 0);
	// Recency: caught at hand 10; by hand 12 the weight has faded, by hand 19 it is gone.
	const mind = emptyMind(4);
	mind.others.a = { recent: { caughtAt: 10, caughtBluffing: 1 } };
	const at = (hands) => recallSuspects({}, { ...mind, hands }).suspect.a ?? 0;
	assert.equal(at(11), 1);
	assert.ok(at(13) < 1 && at(13) > 0);
	assert.equal(at(19), 0);
});

test('Samay challengers change only event quirks on the champion policy rules', () => {
	const champ = CANONICAL_STYLES['samay-raina'];
	for (const x of SAMAY_CHALLENGERS) {
		assert.equal(x.style.policy, CHARACTER_POLICY_V6);
		assert.deepEqual(x.style.tendencies.dna, champ.tendencies.dna);
		const extra = x.style.tendencies.quirks.filter(
			(q) => !champ.tendencies.quirks.some((c) => c.id === q.id)
		);
		assert.ok(extra.length >= 1);
		for (const q of extra)
			assert.ok(['remembersYou', 'remembersYouRead', 'stubbornStreak', 'onToYou'].includes(q.id));
	}
});

test('adversaries are deterministic, readable, and cannot see hidden cards', () => {
	const seats = [
		'ms-dhoni@3',
		...[1, 2, 3, 4].map((i) => ({
			id: `a${i}`,
			adversary: EXPLOITS['pressure-after-loss'].g,
			target: 0
		}))
	];
	const play = () => digest(runTable({ seed: 5, table: 1, seats, hands: 40, matched: true }));
	assert.equal(play(), play());
	const random = stream(1, 'g').random;
	for (let i = 0; i < 20; i++) {
		const g = mutateGenome(randomGenome(random), random);
		assert.match(describe(g, 'Dhoni'), /^[A-Z].*\.$/);
	}
	// Same seat view whatever another player's unseen cards are: the same decision.
	const ctx = { now: 1000, turnMs: 60000, connected: new Set() };
	let room = newRoom('sim-fair', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
	for (let i = 0; i < 3; i++)
		room = transition(
			room,
			'host',
			'addBot',
			{ botId: `bot-seat-${i}`, name: `b${i}`, level: 'normal' },
			ctx
		);
	room = transition(room, 'host', 'leave', {}, ctx);
	const deck = freshDeck();
	const dealt = transition(
		{ ...room, hostId: 'bot-seat-0' },
		'bot-seat-0',
		'start',
		{ cutAt: 0, cardsToDeal: 3, rulesVersion: 'classic-1' },
		{ ...ctx, deck, handId: 'h1', requireReady: true }
	);
	const other = structuredClone(dealt);
	const p = other.players.find((x) => x.id === 'bot-seat-2');
	p.cards = deck.slice(40, 43);
	const me = botDue(dealt, ctx.connected);
	const decide = (state) =>
		adversary(EXPLOITS['bluff-a-lot'].g, 'bot-seat-2')(
			projection(state, me, ctx.connected),
			me,
			stream(3, 'x').random
		);
	if (me !== 'bot-seat-2') assert.deepEqual(decide(other), decide(dealt));
});
