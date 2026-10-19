import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PresenceDirector, seededCosmetics } from '../../src/lib/mascots/presence/director.ts';
import { DHONI_PRESENCE, DHONI_ART } from '../../src/lib/mascots/presence/personality.ts';
import { publicEvent, fromPublicFeed } from '../../src/lib/mascots/presence/public-events.ts';
import { blinkStage } from '../../src/lib/mascots/presence/blink-art.ts';
import { DHONI_EYES, eyeAperture, facialPose } from '../../src/lib/mascots/presence/eye-rig.ts';
import { DHONI_HEAD, headPose } from '../../src/lib/mascots/presence/head-rig.ts';
import { DHONI_BODY, bodyPose } from '../../src/lib/mascots/presence/body-rig.ts';
import { mouthPose } from '../../src/lib/mascots/presence/mouth-rig.ts';
import {
	DHONI_DEPTH,
	createHeadMesh,
	headDepth,
	projectHeadPoint,
	depthPose
} from '../../src/lib/mascots/presence/depth-rig.ts';
import { TablePresenceBridge } from '../../src/lib/mascots/presence/table-bridge.ts';
const make = (seed = 42) => new PresenceDirector(DHONI_PRESENCE, seededCosmetics(seed));
const event = (id = 'raise', type = 'PLAYER_RAISED') => ({ id, type, actor: 'guddu' });
const position = { x: 0.85, y: -0.16 };
const difference = (a, b) =>
	Math.max(
		Math.abs(a.eyes.x - b.eyes.x),
		Math.abs(a.head.x - b.head.x),
		Math.abs(a.roll - b.roll),
		Math.abs(a.lean - b.lean),
		Math.abs(a.brow - b.brow),
		Math.abs(a.mouth - b.mouth)
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
	assert.equal(final.mouth, 0);
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

test('blink and breathing timing differ between instances while whole-portrait travel stays disabled', () => {
	const a = make(3),
		b = make(4),
		as = [],
		bs = [];
	let differentBreaths = 0;
	let blinkA = 0,
		blinkB = 0;
	for (let t = 0; t < 90000; t += 15) {
		const af = a.frame(t),
			bf = b.frame(t);
		assert.ok(af.breath >= 0 && af.breath <= DHONI_PRESENCE.breathScale);
		if (Math.abs(af.breath - bf.breath) > 0.001) differentBreaths++;
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
	assert.ok(
		as.slice(1).every((at, i) => at - as[i] >= 6000),
		'no rapid repeat blinks'
	);
	assert.notDeepEqual(as, bs);
	assert.ok(
		differentBreaths > 2000,
		'independent copies spend most of their time at different breath depths'
	);
	assert.equal(DHONI_PRESENCE.portraitTravel, 0);
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

test('Dhoni preview is release-gated, explicitly opted into, and isolated from other mascots', async () => {
	const route = await readFile(
		new URL('../../src/routes/prototypes/bot-presence/+page.server.ts', import.meta.url),
		'utf8'
	);
	assert.match(route, /if \(!presencePreviewAvailable\) error\(404/);
	const release = await readFile(
		new URL('../../src/lib/mascots/presence/preview.ts', import.meta.url),
		'utf8'
	);
	assert.match(release, /dev \|\| import\.meta\.env\.VITE_BOT_PRESENCE_PREVIEW === 'true'/);
	assert.match(
		release,
		/presencePreviewAvailable && new URLSearchParams\(search\)\.get\('botPresence'\) === 'dhoni'/
	);
	const seat = await readFile(
		new URL('../../src/lib/teen-patti/BotAvatar.svelte', import.meta.url),
		'utf8'
	);
	assert.match(
		seat,
		/presencePreviewAvailable\s*&&\s*presencePreview\s*&&\s*mascotId === 'bot-ms-dhoni'/
	);
	assert.match(seat, /void import\('#lib\/mascots\/presence\/TableBotPresence.svelte'\)/);
	const atlas = await readFile(
		new URL('../../static/mascots/manifest.json', import.meta.url),
		'utf8'
	);
	assert.deepEqual(JSON.parse(atlas)[DHONI_ART.id].signature, ['directions']);
	assert.equal(DHONI_ART.capabilities.eyes, true);
	assert.equal(DHONI_ART.capabilities.eyelids, true);
});

test('real blink stages close and reopen while public events do not interrupt eyelids', () => {
	const d = make();
	d.blink(100, 550);
	const stages = [];
	for (let now = 100; now <= 650; now += 5) {
		if (now === 160) d.dispatch(event(), position, now);
		const stage = blinkStage(d.frame(now).blink);
		if (stages.at(-1) !== stage) stages.push(stage);
	}
	assert.deepEqual(stages, ['open', 'half', 'closed', 'half', 'open']);
	assert.equal(d.frame(651).blinks, 1);
	assert.equal(DHONI_PRESENCE.portraitTravel, 0);
	assert.equal(DHONI_PRESENCE.nodStrength, 0);
});

test('breathing has a smooth inhale, slower exhale and quiet rest; cycles vary and table events cannot reset it', () => {
	const quiet = new PresenceDirector(
		{ ...DHONI_PRESENCE, idleGapMs: [1e9, 1e9], blinkGapMs: [1e9, 1e9] },
		seededCosmetics(71)
	);
	const reacting = new PresenceDirector(
		{ ...DHONI_PRESENCE, idleGapMs: [1e9, 1e9], blinkGapMs: [1e9, 1e9] },
		seededCosmetics(71)
	);
	const values = [];
	for (let now = 0; now <= 7000; now += 10) {
		if (now === 1800) reacting.dispatch(event(), position, now);
		const a = quiet.frame(now),
			b = reacting.frame(now);
		assert.equal(a.breath, b.breath, 'attention cannot restart the current breath');
		if (values.length) assert.ok(Math.abs(a.breath - values.at(-1).value) < 0.0001);
		values.push({ now, value: a.breath });
	}
	assert.equal(values[0].value, 0);
	const peak = values.reduce((a, b) => (a.value > b.value ? a : b));
	assert.ok(peak.value > DHONI_PRESENCE.breathScale * 0.75);
	const inhaleHalf = values.find((v) => v.value > peak.value / 2).now;
	const exhaleHalf = values.find((v) => v.now > peak.now && v.value < peak.value / 2).now;
	assert.ok(exhaleHalf - peak.now > peak.now - inhaleHalf, 'exhale takes longer than inhale');
	const resting = [];
	for (let now = 7010; now <= 60000; now += 10) {
		const breath = quiet.frame(now).breath;
		assert.equal(
			breath,
			reacting.frame(now).breath,
			'table events cannot change future breathing cycles either'
		);
		resting.push(breath);
	}
	assert.ok(resting.filter((v) => v === 0).length > 400, 'breaths include quiet rests');
	const peaks = [];
	for (let i = 1; i < resting.length - 1; i++)
		if (resting[i] > resting[i - 1] && resting[i] >= resting[i + 1]) peaks.push(resting[i]);
	assert.ok(new Set(peaks.map((v) => v.toFixed(5))).size > 4, 'depth varies between cycles');
	quiet.reset(100000);
	assert.equal(quiet.frame(100000).breath, 0, 'resume starts at rest without a phase jump');
	assert.equal(
		quiet.frame(1e9).breath,
		0,
		'a large time gap starts a fresh cycle without catch-up'
	);
});

test('body breathing stays bounded below half a source pixel at the shoulder and never changes the head pose', () => {
	const rest = bodyPose({ breath: 0 });
	assert.deepEqual(rest, { scaleX: 1, scaleY: 1 });
	for (const breath of [0, 0.001, DHONI_BODY.maxBreathScale, 99, -99, NaN, Infinity]) {
		const pose = bodyPose({ breath });
		assert.ok(pose.scaleY >= 1 && pose.scaleY <= 1.009);
		assert.ok(pose.scaleX >= 1 && pose.scaleX <= 1.0018);
		assert.ok((DHONI_BODY.pivot[1] - 195) * (pose.scaleY - 1) < 0.5);
		assert.deepEqual(
			headPose({ head: { x: 0, y: 0 }, eyes: { x: 0, y: 0 }, roll: 0, breath }, DHONI_PRESENCE),
			headPose({ head: { x: 0, y: 0 }, eyes: { x: 0, y: 0 }, roll: 0 }, DHONI_PRESENCE)
		);
	}
});

test('isolated head follows gaze after its delay, compensates pupils gently and returns without jumps', () => {
	const d = make(),
		c = d.dispatch(event(), position, 100);
	const early = d.frame((c.eyesAt + c.headAt) / 2),
		waiting = headPose(early, DHONI_PRESENCE);
	assert.ok(waiting.eyes.x > 0);
	assert.equal(waiting.x, 0);
	assert.equal(waiting.roll, 0);
	const at = c.headAt + c.headMs / 2,
		before = headPose(d.frame(at), DHONI_PRESENCE);
	assert.ok(before.x > 0 && before.roll > 0);
	assert.ok(before.eyes.x < d.frame(at).eyes.x, 'eyes partly recenter as the head catches up');
	const next = d.dispatch(event('left', 'PLAYER_CALLED'), { x: -0.85, y: 0 }, at);
	assert.deepEqual(
		headPose(d.frame(at), DHONI_PRESENCE),
		before,
		'an interruption starts at the current pose'
	);
	const final = headPose(d.frame(next.holdUntil + next.returnMs + 1), DHONI_PRESENCE);
	assert.equal(final.x, 0);
	assert.equal(final.roll, 0);
	assert.equal(final.eyes.x, 0);
	const extreme = headPose(
		{ head: { x: 99, y: -99 }, eyes: { x: NaN, y: Infinity }, roll: 99 },
		{ headDegrees: 999 }
	);
	assert.ok(Math.abs(extreme.roll) <= DHONI_HEAD.maxRoll);
	assert.ok(Math.abs(extreme.x) <= DHONI_HEAD.travel[0]);
	assert.ok(Math.abs(extreme.y) <= DHONI_HEAD.travel[1]);
	assert.equal(extreme.eyes.x, 0);
	assert.equal(extreme.eyes.y, 0);
});

test('facial geometry preserves gaze through a blink and bounds pupils inside painted eye sockets', () => {
	const open = facialPose({ eyes: { x: 0.8, y: 0.2 }, brow: 0.15, blink: 0 });
	const shut = facialPose({ eyes: { x: 0.8, y: 0.2 }, brow: 0.15, blink: 1 });
	assert.equal(open.x, shut.x, 'blinking does not snap pupils to neutral');
	assert.equal(open.y, shut.y);
	assert.ok(Math.abs(open.brows[1].y) > Math.abs(open.brows[0].y));
	const bound = facialPose({ eyes: { x: 50, y: -50 }, brow: NaN, blink: Infinity });
	assert.equal(bound.x, DHONI_EYES.gazeTravel[0]);
	assert.equal(bound.y, -DHONI_EYES.gazeTravel[1]);
	assert.equal(bound.closure, 0);
	assert.equal(Math.abs(bound.brows[0].y), 0);
	for (const eye of DHONI_EYES.eyes) {
		const coords = (c) =>
			eyeAperture(eye.aperture, c)
				.match(/-?\d+(?:\.\d+)?/g)
				.map(Number);
		const height = (c) => {
			const ys = coords(c).filter((_, i) => i % 2);
			return Math.max(...ys) - Math.min(...ys);
		};
		assert.ok(height(0) > height(0.5));
		assert.equal(height(1), 0, 'aperture closes completely over the moving iris');
		assert.doesNotMatch(eyeAperture(eye.aperture, NaN), /NaN|Infinity/);
	}
});

test('painted mouth expressions follow attention, interrupt smoothly and return to the original mouth', () => {
	const d = make(),
		c = d.dispatch(event('win', 'BOT_WON'), position, 0);
	assert.ok(c.mouthAt > c.headAt && c.mouthMs >= 650);
	assert.equal(d.frame(c.headAt).mouth, 0, 'eyes and head lead the mouth');
	const at = c.mouthAt + c.mouthMs * 0.8,
		before = d.frame(at);
	assert.ok(before.mouth > 0.3);
	const loss = d.dispatch(event('loss', 'BOT_LOST'), position, at);
	assert.equal(d.frame(at).mouth, before.mouth, 'interruption begins at the current mouth blend');
	assert.ok(d.frame(loss.mouthAt + loss.mouthMs).mouth < -0.5);
	const n = d.dispatch(event('neutral', 'NEUTRAL'), position, loss.mouthAt + loss.mouthMs);
	assert.equal(d.frame(n.holdUntil + n.returnMs + 1).mouth, 0);
	for (const mouth of [-Infinity, NaN, -99, -0.4, 0, 0.3, 99, Infinity]) {
		const pose = mouthPose({ mouth });
		assert.ok(pose.smile >= 0 && pose.smile <= 1 && pose.composed >= 0 && pose.composed <= 1);
		assert.ok(
			pose.smile === 0 || pose.composed === 0,
			'never superimpose opposing painted expressions'
		);
	}
});

test('each public reaction uses personality configuration, with calm results and quiet idle expressions', () => {
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
		const f = d.frame(Math.max(c.mouthAt + c.mouthMs, c.headAt + c.headMs));
		assert.ok(Math.abs(f.mouth) < 1 && Number.isFinite(f.mouth));
		if (type === 'BOT_WON') assert.ok(f.mouth > 0.5);
		if (type === 'BOT_LOST') assert.ok(f.mouth < -0.5);
		if (type === 'IDLE') assert.ok(Math.abs(f.mouth) < 0.1);
		assert.equal(d.frame(c.holdUntil + c.returnMs + 1).mouth, 0);
	}
	const p = {
		...DHONI_PRESENCE,
		reactions: {
			...DHONI_PRESENCE.reactions,
			PLAYER_CALLED: {
				variations: ['custom-call'],
				target: { x: -0.5, y: 0.2 },
				roll: 0.1,
				lean: 0.1,
				brow: 0.2,
				mouth: -0.7
			}
		}
	};
	const d = new PresenceDirector(p, seededCosmetics(9));
	const c = d.dispatch(event('call', 'PLAYER_CALLED'), position, 0);
	assert.equal(c.variation, 'custom-call');
	assert.equal(c.target.x, -0.5);
	assert.ok(
		c.mouth < -0.4,
		'a new personality changes expression without modifying UI or director code'
	);
});

test('packed runtime textures stay small while preserving the approved center portrait and pupil footprints', async () => {
	const manifest = JSON.parse(
		await readFile(
			new URL('../../static/prototypes/dhoni-parts/manifest.json', import.meta.url),
			'utf8'
		)
	);
	assert.equal(manifest.files.length, 10);
	assert.ok(manifest.bytes < 350000);
	assert.ok(manifest.decodedBytes < 3 * 1024 * 1024);
	const portrait = manifest.files.find((f) => f.file === 'portrait-v1.webp');
	assert.equal(portrait.source, 'mascots/bot-ms-dhoni/signature/directions.webp');
	assert.equal(
		portrait.filter,
		'crop=360:360:360:360',
		'original portrait is cropped without resampling or repainting'
	);
	for (const eye of DHONI_EYES.eyes) assert.deepEqual(eye.iris.slice(2), [14, 16.5]);
});

test('depth mesh preserves neutral registration and projects nose, cheeks and ears at distinct depths', () => {
	const mesh = createHeadMesh();
	assert.equal(mesh.indices.length, DHONI_DEPTH.columns * DHONI_DEPTH.rows * 6);
	assert.ok(mesh.indices.every((index) => index < mesh.source.length / 2));
	for (let i = 0; i < mesh.source.length; i += 2) {
		const p = projectHeadPoint(mesh.source[i], mesh.source[i + 1], 0, 0);
		assert.ok(Math.abs(p.x - mesh.source[i]) < 1e-9);
		assert.ok(Math.abs(p.y - mesh.source[i + 1]) < 1e-9);
	}
	assert.ok(headDepth(180, 155) > headDepth(153, 155) + 15);
	const nose = projectHeadPoint(180, 155, 8, 0),
		ear = projectHeadPoint(100, 140, 8, 0);
	assert.ok(
		nose.x - 180 - (ear.x - 100) > 4,
		'nose parallax must exceed the receding ear; this is not a rigid image plane'
	);
	for (const x of [-999, 0, 999, NaN, Infinity]) {
		const p = depthPose({ head: { x, y: x } });
		assert.ok(Math.abs(p.yaw) <= 8 && Math.abs(p.pitch) <= 4);
	}
	const right = projectHeadPoint(180, 155, 8, 0),
		left = projectHeadPoint(180, 155, -8, 0);
	assert.ok(Math.abs(right.x + left.x - 360) < 1e-9);
});

test('depth turn starts after the eyes, can reverse continuously and returns to exact neutral', () => {
	const d = make(),
		c = d.dispatch(event(), position, 0);
	assert.equal(depthPose(d.frame((c.eyesAt + c.headAt) / 2)).yaw, 0);
	const at = c.headAt + c.headMs * 0.7,
		before = depthPose(d.frame(at));
	assert.ok(before.yaw > 3);
	const next = d.dispatch(event('reverse'), { x: -0.85, y: 0 }, at);
	assert.deepEqual(depthPose(d.frame(at)), before);
	assert.ok(depthPose(d.frame(next.headAt + next.headMs)).yaw < 0);
	assert.deepEqual(depthPose(d.frame(next.holdUntil + next.returnMs + 1)), { yaw: 0, pitch: 0 });
});

const publicGeometry = {
	seats: [
		{ id: 'dhoni', x: 50, y: 20 },
		{ id: 'guddu', x: 90, y: 65 }
	],
	pot: { x: 50, y: 55 }
};
const publicView = (feed = [], turn = null, handKey = 'hand-1') => ({
	feed,
	turn,
	handKey,
	geometry: publicGeometry
});
const publicFeed = (id, kind, playerId = 'guddu') => ({
	id,
	kind,
	playerId,
	text: 'public narration',
	amount: 40
});

test('table bridge primes old history, follows fresh public actions and delays its public turn without mechanical replay', () => {
	const bridge = new TablePresenceBridge('dhoni', seededCosmetics(22));
	assert.deepEqual(bridge.observe(publicView([publicFeed(1, 'raise')]), 0), []);
	const view = publicView([publicFeed(1, 'raise'), publicFeed(2, 'raise')], {
		key: 'hand-1:turn-2',
		playerId: 'dhoni'
	});
	const plans = bridge.observe(view, 2000);
	assert.equal(plans.length, 2);
	assert.equal(plans[0].event.type, 'PLAYER_RAISED');
	assert.ok(plans[0].attention.x > 0);
	assert.equal(plans[1].event.type, 'BOT_TURN');
	assert.ok(plans[1].at >= 3000 && plans[1].at <= 3450);
	const again = bridge.observe(view, 2500);
	assert.equal(again.length, 1);
	assert.equal(again[0].at, plans[1].at, 'snapshot updates must not postpone the turn pause');
	bridge.delivered(plans[1].event);
	assert.deepEqual(bridge.observe(view, 4000), []);
	const next = bridge.observe(publicView(view.feed, null, 'hand-2'), 5000);
	assert.equal(next[0].event.type, 'NEUTRAL');
});

test('public results cancel stale turn notices; split winners never trigger a loss for a winning bot', () => {
	const bridge = new TablePresenceBridge('dhoni', seededCosmetics(4));
	bridge.observe(publicView(), 0);
	bridge.observe(publicView([], { key: 'turn-1', playerId: 'dhoni' }), 10);
	const plans = bridge.observe(
		publicView([publicFeed(2, 'win'), publicFeed(3, 'win', 'dhoni')], null),
		500
	);
	assert.equal(plans.length, 1);
	assert.equal(plans[0].event.type, 'BOT_WON');
	assert.deepEqual(
		bridge.observe(publicView([publicFeed(2, 'win'), publicFeed(3, 'win', 'dhoni')], null), 600),
		[]
	);
});

test('live animation bridge discards cards, private evaluation, policy and narration without changing any visible plan', () => {
	const a = new TablePresenceBridge('dhoni', seededCosmetics(9)),
		b = new TablePresenceBridge('dhoni', seededCosmetics(9));
	a.observe(publicView(), 0);
	b.observe(publicView(), 0);
	const feed = [publicFeed(1, 'raise')],
		turn = { key: 'turn-1', playerId: 'dhoni' };
	const hidden = {
		cards: [{ rank: 14, suit: 'spades' }],
		handStrength: 1,
		policy: { bluff: 1 },
		botMemory: { secret: true },
		futureActions: ['raise']
	};
	const plain = a.observe(publicView(feed, turn), 100);
	const dirty = b.observe(
		{
			...publicView(
				feed.map((event) => ({ ...event, ...hidden, text: 'private cards' })),
				{ ...turn, ...hidden }
			),
			...hidden
		},
		100
	);
	assert.deepEqual(plain, dirty);
	assert.doesNotMatch(
		JSON.stringify(dirty),
		/cards|Strength|policy|Memory|futureActions|narration/
	);
});

test('a new hand can reuse a public turn key without suppressing the next turn notice', () => {
	const bridge = new TablePresenceBridge('dhoni', seededCosmetics(7));
	const turn = { key: 'open:dhoni', playerId: 'dhoni' };
	const first = bridge
		.observe(publicView([], turn, 'hand-1'), 0)
		.find((p) => p.event.type === 'BOT_TURN');
	bridge.delivered(first.event);
	const second = bridge.observe(publicView([], turn, 'hand-2'), 3000);
	assert.ok(second.some((p) => p.event.type === 'BOT_TURN'));
});
