import test from 'node:test';
import assert from 'node:assert/strict';
import {
	inviteEmails,
	planInvites,
	inviteMessage,
	sendWithResend,
	MAX_ROOM_INVITES,
	RESEND_COOLDOWN_MS
} from '../../server/cloudflare/invites.mjs';

test('Invite addresses are trimmed, lower-cased, de-duplicated and validated', () => {
	assert.deepEqual(inviteEmails([' Rahul@Example.com', 'rahul@example.com', 'priya@mail.co.in']), [
		'rahul@example.com',
		'priya@mail.co.in'
	]);
	for (const bad of [
		[],
		'a@b.com',
		['not-an-email'],
		['a@b'],
		['a b@c.com'],
		[42],
		['x@y.com<script>']
	])
		assert.throws(
			() => inviteEmails(bad),
			(error) => error.code === 'INVALID_INVITE'
		);
	assert.throws(
		() => inviteEmails(Array.from({ length: MAX_ROOM_INVITES + 1 }, (_, i) => `p${i}@x.com`)),
		/up to 10/
	);
});

test('A room emails at most ten people and does not re-send within the cooldown', () => {
	const first = planInvites(undefined, ['a@x.com', 'b@x.com'], 'host', 1000);
	assert.deepEqual(first.send, ['a@x.com', 'b@x.com']);
	const again = planInvites(first.record, ['a@x.com', 'c@x.com'], 'guest', 2000);
	assert.deepEqual(again.send, ['c@x.com']);
	assert.deepEqual(again.skipped, ['a@x.com']);
	const later = planInvites(again.record, ['a@x.com'], 'guest', 1000 + RESEND_COOLDOWN_MS);
	assert.deepEqual(later.send, ['a@x.com']);
	assert.equal(later.record.length, 3);
	const full = planInvites(
		undefined,
		Array.from({ length: MAX_ROOM_INVITES }, (_, i) => `p${i}@x.com`),
		'host',
		0
	);
	assert.throws(
		() => planInvites(full.record, ['new@x.com'], 'host', 1),
		(e) => e.code === 'INVITE_LIMIT'
	);
	// Planning never mutates the stored record.
	assert.equal(first.record.length, 2);
});

test('Invite email escapes the inviter name and carries the room link', () => {
	const message = inviteMessage({
		inviter: '<b>rahul</b>',
		link: 'https://chaal.tech/abc123',
		boot: 10,
		buyIn: 1000,
		seats: 6
	});
	assert.equal(message.subject, '<b>rahul</b> saved you a seat ♠');
	assert.doesNotMatch(message.html, /<b>rahul<\/b>/);
	assert.match(message.html, /https:\/\/chaal\.tech\/abc123/);
	assert.match(message.text, /₹1,000 · boot ₹10 · 6 seats/);
	assert.match(message.html, /₹1,000[\s\S]*Buy in[\s\S]*₹10[\s\S]*Boot[\s\S]*>6<[\s\S]*Seats/);
	assert.match(message.html, /Your private Teen Patti table is ready\./);
	// The raw link is only used as an href, never printed as visible text.
	assert.doesNotMatch(message.html, />https:\/\/chaal\.tech\/abc123</);
});

test('Resend receives one message per recipient in a single batch call', async () => {
	const calls = [];
	const fetcher = async (url, init) => {
		calls.push({ url, init });
		return new Response('{}', { status: 200 });
	};
	await sendWithResend({
		apiKey: 're_test',
		from: 'Chaal <invites@chaal.tech>',
		emails: ['a@x.com', 'b@x.com'],
		message: { subject: 's', html: 'h', text: 't' },
		fetcher
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url, 'https://api.resend.com/emails/batch');
	assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
	assert.deepEqual(
		JSON.parse(calls[0].init.body).map((email) => email.to),
		[['a@x.com'], ['b@x.com']]
	);
	await assert.rejects(
		sendWithResend({
			apiKey: 'k',
			from: 'f',
			emails: ['a@x.com'],
			message: { subject: 's', html: 'h', text: 't' },
			fetcher: async () => new Response('{}', { status: 422 })
		}),
		/422/
	);
});
