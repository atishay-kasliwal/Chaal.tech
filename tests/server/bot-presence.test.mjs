import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PresenceDirector, seededCosmetics } from '../../src/lib/mascots/presence/director.ts';
import { DHONI_PRESENCE, DHONI_ART } from '../../src/lib/mascots/presence/personality.ts';
import { publicEvent, fromPublicFeed } from '../../src/lib/mascots/presence/public-events.ts';
const make = (seed = 42) => new PresenceDirector(DHONI_PRESENCE, seededCosmetics(seed));
const event = (id = 'raise', type = 'PLAYER_RAISED') => ({ id, type, actor: 'guddu' });
const position = { x: 0.85, y: -0.16 };
const difference = (a, b) =>
	Math.max(
		Math.abs(a.eyes.x - b.eyes.x),
		Math.abs(a.head.x - b.head.x),
		Math.abs(a.roll - b.roll),
		Math.abs(a.lean - b.lean),
		Math.abs(a.brow - b.brow)
	);

test('gaze starts before head; channels interpolate continuously and settle at neutral', () => {
	const d = make(),
		c = d.dispatch(event(), position, 100);
	assert.ok(c.headAt - c.eyesAt >= 190);
	const middle = d.frame((c.eyesAt + c.headAt) / 2);
	assert.ok(middle.eyes.x > 0);
	assert.equal(middle.head.x, 0);
	assert.equal(middle.phase, 'eyes');
	assert.ok(d.frame(c.headAt + c.headMs / 2).head.x > 0);
	let previous = d.frame(100);
	for (let t = 110; t < c.holdUntil + c.returnMs; t += 10) {
		const next = d.frame(t);
		assert.ok(difference(previous, next) < 0.08);
		previous = next;
	}
	const final = d.frame(c.holdUntil + c.returnMs + 1);
	assert.equal(final.phase, 'still');
	assert.equal(final.head.x, 0);
	assert.equal(final.eyes.x, 0);
	assert.equal(final.brow, 0);
});

test('new public events interrupt from the CURRENT interpolated pose with no jump or stale queued return', () => {
	const d = make(),
		first = d.dispatch(event(), position, 100);
	const at = first.headAt + first.headMs / 2;
	const before = d.frame(at);
	const second = d.dispatch(event('new', 'PLAYER_CALLED'), { x: -0.7, y: 0.1 }, at);
	const after = d.frame(at);
	assert.equal(difference(before, after), 0);
	assert.equal(after.interrupted, 1);
	assert.ok(d.frame(second.headAt + second.headMs).head.x < 0);
	assert.equal(d.frame(second.holdUntil + second.returnMs + 1).head.x, 0);
	assert.equal(
		d.dispatch(event('new', 'PLAYER_CALLED'), position, 10000),
		null,
		'replayed event ID is ignored'
	);
});

test('all requested public reactions produce finite bounded commands; explicit neutral can interrupt a win', () => {
	const types = [
		'PLAYER_RAISED',
		'PLAYER_CALLED',
		'PLAYER_FOLDED',
		'BOT_TURN',
		'BOT_WON',
		'BOT_LOST',
		'IDLE',
		'NEUTRAL'
	];
	for (const type of types) {
		const d = make(),
			c = d.dispatch(event(type, type), position, 0);
		assert.ok(c);
		const f = d.frame(c.headAt + c.headMs);
		assert.ok(Math.abs(f.roll) < 0.4 && Math.abs(f.lean) < 0.35 && Math.abs(f.brow) < 0.2);
	}
	const d = make(),
		win = d.dispatch(event('win', 'BOT_WON'), position, 0);
	d.frame(win.headAt + 100);
	const c = d.dispatch(event('neutral', 'NEUTRAL'), { x: 0, y: 0 }, win.headAt + 100);
	assert.equal(d.frame(c.holdUntil + c.returnMs + 1).phase, 'still');
});

test('cosmetic behavior ignores cards, hand strength, policy, analytics, future actions and private memory', () => {
	const hidden = {
		cards: [{ rank: 14, suit: 'spades' }],
		handStrength: 1,
		botMemory: { fold: 0.99 },
		policy: { bluff: 1 },
		futureActions: ['raise'],
		deck: ['secret']
	};
	const a = make(),
		b = make();
	assert.deepEqual(
		a.dispatch(event(), position, 100),
		b.dispatch({ ...event(), ...hidden }, position, 100)
	);
	for (let now = 0; now < 20000; now += 31) assert.deepEqual(a.frame(now), b.frame(now));
	assert.deepEqual(publicEvent({ ...event(), ...hidden }), event());
	assert.equal(fromPublicFeed({ usersList: [], ...hidden }, 'dhoni').length, 0);
	const plain = [{ id: 1, kind: 'raise', playerId: 'guddu', text: 'raised' }];
	assert.deepEqual(
		fromPublicFeed(plain, 'dhoni'),
		fromPublicFeed(
			plain.map((e) => ({ ...e, ...hidden, text: 'secret cards' })),
			'dhoni'
		)
	);
	assert.doesNotMatch(
		JSON.stringify(publicEvent({ ...event(), ...hidden })),
		/cards|Strength|policy|Memory|deck/
	);
});

test('public feed adapter handles call/fold/win/loss, ignores bot own bets and treats split winners as one result', () => {
	assert.deepEqual(fromPublicFeed([{ id: 1, kind: 'raise', playerId: 'dhoni' }], 'dhoni'), []);
	assert.equal(
		fromPublicFeed([{ id: 2, kind: 'chaal', playerId: 'a' }], 'dhoni')[0].type,
		'PLAYER_CALLED'
	);
	assert.equal(
		fromPublicFeed([{ id: 3, kind: 'pack', playerId: 'a' }], 'dhoni')[0].type,
		'PLAYER_FOLDED'
	);
	assert.equal(
		fromPublicFeed([{ id: 4, kind: 'win', playerId: 'a' }], 'dhoni')[0].type,
		'BOT_LOST'
	);
	const split = fromPublicFeed(
		[
			{ id: 5, kind: 'win', playerId: 'a' },
			{ id: 6, kind: 'win', playerId: 'dhoni' }
		],
		'dhoni'
	);
	assert.equal(split.length, 1);
	assert.equal(split[0].type, 'BOT_WON');
	for (const raw of [
		null,
		[],
		{ id: 'x', type: 'PRIVATE_CARDS' },
		{ id: { secret: 'x' }, type: 'BOT_WON' }
	])
		assert.equal(publicEvent(raw), null);
});

test('idle includes long still periods, four nonrepeating variations and no mechanical reaction loop', () => {
	const d = make(),
		variations = new Set();
	let still = 0,
		last = null,
		idles = 0;
	for (let t = 0; t < 240000; t += 100) {
		const f = d.frame(t);
		if (f.phase === 'still') still++;
		if (d.command?.event.type === 'IDLE' && d.command.event.id !== last) {
			last = d.command.event.id;
			variations.add(d.command.variation);
			idles++;
		}
	}
	assert.equal(variations.size, 4);
	assert.ok(idles < 24);
	assert.ok(still > 1300, 'more than half the sample is still');
	const r = make(),
		c = r.dispatch(event(), position, 0);
	assert.equal(r.dispatch(event('ambient', 'IDLE'), position, c.headAt), null);
});

test('blink timing, breath phases and idle timing differ between instances; subtle bounds persist', () => {
	const a = make(3),
		b = make(4),
		as = [],
		bs = [];
	let blinkA = 0,
		blinkB = 0;
	assert.notEqual(a.frame(0).breath, b.frame(0).breath);
	for (let t = 0; t < 45000; t += 15) {
		const af = a.frame(t),
			bf = b.frame(t);
		assert.ok(Math.abs(af.breath) <= 0.006);
		assert.ok(af.blink >= 0 && af.blink <= 1);
		if (af.blinks > blinkA) {
			as.push(t);
			blinkA = af.blinks;
		}
		if (bf.blinks > blinkB) {
			bs.push(t);
			blinkB = bf.blinks;
		}
	}
	assert.ok(as.length >= 5 && bs.length >= 5);
	assert.notDeepEqual(as, bs);
	assert.ok(new Set(as.slice(1).map((x, i) => x - as[i])).size >= 3);
});

test('pause/resume discards stale plans and schedules fresh idle/blink without catch-up storms', () => {
	const d = make();
	d.dispatch(event(), position, 0);
	d.frame(1000);
	d.reset(60000);
	const f = d.frame(60001);
	assert.equal(f.phase, 'still');
	assert.equal(f.head.x, 0);
	assert.equal(f.blink, 0);
});

test('only the isolated prototype imports the new renderer; production route is gated and art remains honestly flattened', async () => {
	const route = await readFile(
		new URL('../../src/routes/prototypes/bot-presence/+page.server.ts', import.meta.url),
		'utf8'
	);
	assert.match(route, /if \(!dev\) error\(404/);
	const seat = await readFile(
		new URL('../../src/lib/teen-patti/BotAvatar.svelte', import.meta.url),
		'utf8'
	);
	assert.doesNotMatch(seat, /presence/);
	const atlas = await readFile(
		new URL('../../static/mascots/manifest.json', import.meta.url),
		'utf8'
	);
	assert.deepEqual(JSON.parse(atlas)[DHONI_ART.id].signature, ['directions']);
	assert.equal(DHONI_ART.capabilities.eyes, false);
	assert.equal(DHONI_ART.capabilities.eyelids, false);
});

test('portrait attention is legible at seat sizes and public wins produce a single visible nod', () => {
	const d = make(),
		c = d.dispatch(event(), position, 0);
	const pose = d.frame(c.headAt + c.headMs);
	const movementAt360px = pose.head.x * DHONI_PRESENCE.portraitTravel * 360;
	assert.ok(
		movementAt360px >= 6 && movementAt360px < 12,
		'attention should move several visible pixels'
	);
	assert.ok(pose.head.x * DHONI_PRESENCE.headDegrees >= 1.5, 'portrait should visibly tilt');
	const win = make(),
		w = win.dispatch(event('win', 'BOT_WON'), position, 0);
	const before = win.frame(w.headAt),
		nod = win.frame(w.headAt + w.headMs * 0.9),
		after = win.frame(w.headAt + w.headMs * 1.8);
	assert.ok(Math.abs(nod.head.y - after.head.y) * DHONI_PRESENCE.portraitTravel * 360 > 2);
	assert.equal(before.head.y, 0);
});
