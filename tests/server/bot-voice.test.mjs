import test from 'node:test';
import assert from 'node:assert/strict';
import { SITUATIONS, allLines, lineFor, voiced } from '../../shared/bot-voice.mjs';
import { BOT_CHARACTERS } from '../../shared/bot-characters.mjs';

test('every character has lines for every situation, and no line is empty, long or uses an em dash', () => {
	for (const character of BOT_CHARACTERS) {
		assert.ok(voiced(character.mascotId), character.id);
		for (const situation of SITUATIONS) assert.ok(lineFor(character.mascotId, situation, 'x'), `${character.id}/${situation}`);
	}
	for (const { text } of allLines()) {
		assert.ok(text.length >= 5 && text.length <= 60, text);
		assert.doesNotMatch(text, /—|–|\s-\s/);
	}
});

test('the same moment always gets the same line, different moments vary, and characters sound different', () => {
	assert.equal(lineFor('bot-gg', 'raise', 'h1:4'), lineFor('bot-gg', 'raise', 'h1:4'));
	const seen = new Set(Array.from({ length: 40 }, (_, i) => lineFor('bot-samay-raina', 'raise', `h${i}`)));
	assert.ok(seen.size >= 3, 'varied across moments');
	const pool = new Map();
	for (const { mascotId, text } of allLines()) pool.set(text, (pool.get(text) ?? new Set()).add(mascotId));
	assert.ok([...pool.values()].every((owners) => owners.size === 1), 'no line is shared between characters');
	assert.equal(lineFor('bot-nobody', 'raise', 'x'), null);
});

import { botDelay, thinkingContext, TEMPO } from '../../server/bots/runner.mjs';

test('thinking time: characters differ, big decisions take longer, and it stays inside the turn clock', () => {
	const fixed = () => 0.5;
	const calm = botDelay(fixed, false, { botId: 'rohit-sharma' });
	assert.ok(botDelay(fixed, false, { botId: 'ms-dhoni' }) > calm, 'Dhoni takes his time');
	assert.ok(botDelay(fixed, false, { botId: 'virat-kohli' }) < calm, 'Virat is decisive');
	assert.ok(botDelay(fixed, false, { botId: 'rohit-sharma', facingRaise: true, bigPot: true }) > calm * 1.4, 'a raise into a big pot');
	assert.ok(botDelay(fixed, true, { botId: 'rohit-sharma' }) < calm, 'looking is quicker than betting');
	// Never absurd, never past the clock: 1000 samples at the extremes.
	let lowest = Infinity;
	let highest = 0;
	for (let i = 0; i < 1000; i++) {
		const d = botDelay(() => Math.random(), false, { botId: 'ms-dhoni', facingRaise: true, bigPot: true });
		lowest = Math.min(lowest, d);
		highest = Math.max(highest, d);
	}
	assert.ok(lowest >= 1000 && highest <= 7000);
	assert.equal(Object.keys(TEMPO).length, 5);
	assert.deepEqual(thinkingContext({ boot: 10, maxStake: 40, pot: 250, players: [{ id: 'b', bot: { style: { botId: 'gg' } } }] }, 'b'), { botId: 'gg', facingRaise: true, bigPot: true });
});
