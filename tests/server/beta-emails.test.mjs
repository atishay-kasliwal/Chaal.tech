import test from 'node:test';
import assert from 'node:assert/strict';
import {
	BETA_STEPS,
	betaMessage,
	sendBetaEmails,
	plannedSteps,
	cancelBetaEmails,
	candidateNights,
	gameTime
} from '../../server/club/beta-emails.mjs';

const formUrl = 'https://forms.gle/abc123';
const DAY_MS = 24 * 60 * 60 * 1000;
const game = gameTime('2026-10-24 21:00');

test('the availability email offers Friday and Saturday of next weekend', () => {
	assert.equal(
		candidateNights(new Date('2026-10-15T10:00:00+05:30')),
		'Fri, 23 Oct or Sat, 24 Oct'
	);
	assert.equal(
		candidateNights(new Date('2026-10-12T10:00:00+05:30')),
		'Fri, 23 Oct or Sat, 24 Oct'
	);
	assert.equal(candidateNights(new Date('2026-10-26T10:00:00+05:30')), 'Fri, 6 Nov or Sat, 7 Nov');
});

test('day 1 is a personal note from the host with one button to the form', () => {
	const message = betaMessage(1, {
		nickname: 'raju',
		formUrl,
		nights: 'Fri, 23 Oct or Sat, 24 Oct',
		host: 'Atishay',
		appUrl: 'https://chaal.tech'
	});
	assert.equal(message.subject, 'Teen Patti night next weekend?');
	assert.ok(message.html.includes('Hey Raju,') && message.html.includes('Pick a night'));
	assert.ok(message.html.includes('Fri, 23 Oct or Sat, 24 Oct') && message.html.includes(formUrl));
	assert.ok(message.html.includes('https://chaal.tech/email/beta-cards.png'));
	assert.ok(message.text.includes('See you there,\nAtishay'));
});

test('the chosen time is read as India time and gets a calendar link', () => {
	assert.equal(game.start.toISOString(), '2026-10-24T15:30:00.000Z');
	assert.equal(game.label, 'Saturday 24 October · 9:00 PM IST');
	assert.equal(game.date, 'Sat 24 Oct');
	const calendar = new URL(game.calendarUrl);
	assert.equal(calendar.searchParams.get('dates'), '20261024T153000Z/20261024T183000Z');
	assert.throws(() => gameTime('next saturday'), /YYYY-MM-DD HH:MM/);
});

test('each email has its own job and never asks anyone to sign in', () => {
	const details = {
		nickname: '<b>pinky</b>',
		formUrl,
		nights: 'Fri, 23 Oct or Sat, 24 Oct',
		game,
		host: 'Atishay'
	};
	const [ask, set, welcome] = BETA_STEPS.map((step) => betaMessage(step, details));
	assert.ok(ask.html.includes(formUrl) && ask.html.includes('Fri, 23 Oct'));
	assert.ok(set.subject.includes('Sat 24 Oct'));
	assert.ok(
		set.html.includes(game.calendarUrl.replace(/&/g, '&#38;')),
		'the calendar button links the event'
	);
	assert.ok(
		welcome.subject.includes('private membership') &&
			welcome.html.includes('https://chaal.tech/club')
	);
	assert.ok(
		welcome.html.includes('PRIVATE MEMBER') && welcome.html.includes('Saturday 24 October')
	);
	for (const message of [ask, set, welcome]) {
		assert.doesNotMatch(message.html + message.text, /sign in|sign-in|google account/i);
		assert.equal(message.html.includes('<b>pinky'), false);
		assert.ok(message.text.includes('Atishay'));
	}
	assert.ok(welcome.text.includes('<b>pinky</b>'), 'plain text keeps the name as typed');
	assert.throws(() => betaMessage(2, { nickname: 'R', formUrl }), /game time/);
	assert.throws(() => betaMessage(1, { nickname: 'R' }), /Google Form/);
});

test('day 1 needs no decision; once decided, day 2 goes now and day 3 a day later', () => {
	const now = new Date('2026-10-16T10:00:00Z');
	assert.deepEqual(plannedSteps({}, null, now), [{ step: 1 }]);
	const asked = { betaInvite: { emails: [{ step: 1 }] } };
	assert.deepEqual(plannedSteps(asked, null, now), []);
	assert.deepEqual(plannedSteps(asked, { start: game.start }, now), [
		{ step: 2 },
		{ step: 3, at: new Date(now.getTime() + DAY_MS) }
	]);
	// Added after the decision: no availability question.
	assert.deepEqual(
		plannedSteps({}, { start: game.start }, now).map(({ step }) => step),
		[2, 3]
	);
	const done = { betaInvite: { emails: [{ step: 1 }, { step: 2 }, { step: 3 }] } };
	assert.deepEqual(plannedSteps(done, { start: game.start }, now), []);
});

test('scheduled steps carry scheduled_at and an idempotency key per decision', async () => {
	const now = new Date('2026-10-16T10:00:00Z');
	const calls = [];
	const fetcher = async (url, init) => {
		calls.push({ init, body: JSON.parse(init.body) });
		return Response.json({ id: `email-${calls.length}` });
	};
	const sent = await sendBetaEmails({
		apiKey: 're_test',
		from: 'Chaal <invites@chaal.tech>',
		member: { _id: 'm1', email: 'raju@example.com', nickname: 'Raju' },
		steps: plannedSteps({}, { start: game.start }, now),
		details: { game, host: 'Atishay' },
		now,
		fetcher
	});
	assert.equal('scheduled_at' in calls[0].body, false);
	assert.equal(calls[1].body.scheduled_at, new Date(now.getTime() + DAY_MS).toISOString());
	assert.deepEqual(
		calls.map((call) => call.init.headers['Idempotency-Key']),
		[`chaal-beta-m1-2-${game.start.getTime()}`, `chaal-beta-m1-3-${game.start.getTime()}`]
	);
	assert.deepEqual(
		sent.map(({ step, id }) => [step, id]),
		[
			[2, 'email-1'],
			[3, 'email-2']
		]
	);
});

test('a Resend failure reports which emails already went out', async () => {
	let count = 0;
	const fetcher = async () =>
		++count === 2
			? Response.json({ message: 'nope' }, { status: 422 })
			: Response.json({ id: 'ok' });
	await assert.rejects(
		sendBetaEmails({
			apiKey: 'k',
			from: 'f',
			member: { _id: 'm', email: 'a@b.co', nickname: 'A' },
			steps: [{ step: 2 }, { step: 3, at: new Date(Date.now() + DAY_MS) }],
			details: { game },
			fetcher
		}),
		(error) => error.sent.length === 1 && /422/.test(error.message)
	);
});

test('only emails still in the future are cancelled', async () => {
	const now = new Date('2026-10-16T10:00:00Z');
	const cancelled = [];
	const steps = await cancelBetaEmails({
		apiKey: 'k',
		now,
		fetcher: async (url) => {
			cancelled.push(url);
			return Response.json({ ok: true });
		},
		emails: [
			{ step: 2, id: 'b', at: '2026-10-16T09:00:00Z' },
			{ step: 3, id: 'c', at: '2026-10-17T10:00:00Z' }
		]
	});
	assert.deepEqual(steps, [3]);
	assert.deepEqual(cancelled, ['https://api.resend.com/emails/c/cancel']);
});
