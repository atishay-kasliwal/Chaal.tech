/**
 * Game-night availability. The owner opens a poll over the next two days (India dates); each
 * person on the guest list gets a personal link by email (signed, so it can't be edited to answer
 * as someone else). The page needs no sign-in: it greets them by name and they tick the hours they
 * are free. The owner sees who answered, who is still waiting, and the best times.
 * Slots are stored as UTC instants; the pages show each in India and US Eastern time.
 */
import { ObjectId } from 'mongodb';
import { MEMBERS, ClubError } from './members.mjs';

export const AVAILABILITY = 'availability';
/** Same collection as the club settings (admin.mjs); the open poll lives under _id 'poll'. */
const SETTINGS = 'club_settings';
const IST = 'Asia/Kolkata';
const HOUR = 60 * 60 * 1000;
const invalid = (message) => new ClubError(message, 'INVALID_AVAILABILITY', 400);
const expired = () =>
	new ClubError('This link has expired. Ask for a new one.', 'POLL_NOT_FOUND', 404);

/** The India calendar date `offset` days after `now`, as YYYY-MM-DD. */
export function indiaDate(now, offset = 0) {
	return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(
		new Date(now.getTime() + offset * 24 * HOUR)
	);
}

/** Every hour of the poll's India days, as UTC ISO strings. */
export function pollSlots(poll) {
	const slots = [];
	for (const day of poll.days)
		for (let hour = 0; hour < 24; hour++)
			slots.push(new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+05:30`).toISOString());
	return slots;
}

/** "Sat, 17 Oct or Sun, 18 Oct", for the availability email. */
export function pollNights(poll) {
	return poll.days
		.map((day) =>
			new Intl.DateTimeFormat('en-GB', {
				timeZone: IST,
				weekday: 'short',
				day: 'numeric',
				month: 'short'
			})
				.format(new Date(`${day}T12:00:00+05:30`))
				.replace(' ', ', ')
		)
		.join(' or ');
}

async function sign(secret, text) {
	if (!secret) throw new ClubError('Game night links are not set up.', 'POLL_UNAVAILABLE', 503);
	const key = await crypto.subtle.importKey(
		'raw',
		new TextEncoder().encode(secret),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const mac = new Uint8Array(
		await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`poll:${text}`))
	);
	return [...mac.slice(0, 12)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** "memberId.signature": names the person, and only the server can make one. */
export async function personalToken(secret, poll, memberId) {
	return `${memberId}.${await sign(secret, `${poll.id}:${memberId}`)}`;
}

/** A person's own link to the open poll. */
export async function personalLink(secret, poll, memberId, appUrl = 'https://chaal.tech') {
	const token = await personalToken(secret, poll, memberId);
	return `${appUrl.replace(/\/+$/, '')}/availability/${poll.key}?for=${encodeURIComponent(token)}`;
}

export async function currentPoll(db) {
	const poll = await db.collection(SETTINGS).findOne({ _id: 'poll' });
	return poll ? { id: poll.pollId, key: poll.key, days: poll.days, openedAt: poll.openedAt } : null;
}

/** Open a fresh poll for tomorrow and the day after (India dates). Older links stop working. */
export async function openPoll(db, now = new Date()) {
	const key = [...crypto.getRandomValues(new Uint8Array(12))]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
	const poll = {
		pollId: String(now.getTime()),
		key,
		days: [indiaDate(now, 1), indiaDate(now, 2)],
		openedAt: now
	};
	await db.collection(SETTINGS).updateOne({ _id: 'poll' }, { $set: poll }, { upsert: true });
	return currentPoll(db);
}

const memberQuery = (memberId) =>
	ObjectId.isValid(memberId) && String(new ObjectId(memberId)) === memberId
		? { _id: new ObjectId(memberId) }
		: { _id: memberId };

/** Who a personal link belongs to, or an error if the link is old or has been altered. */
async function personFor(db, secret, key, token) {
	const poll = await currentPoll(db);
	if (!poll || typeof key !== 'string' || key !== poll.key) throw expired();
	const memberId = typeof token === 'string' ? token.split('.')[0] : '';
	if (!memberId || token.length > 120 || token !== (await personalToken(secret, poll, memberId)))
		throw invalid('Open the link from your email.');
	const member = await db.collection(MEMBERS).findOne(memberQuery(memberId));
	if (!member || member.status === 'suspended') throw invalid('This invite is no longer active.');
	return { poll, memberId, name: member.nickname || member.email.split('@')[0] };
}

/** What the page shows: who they are, the hours to pick from, and what they already picked. */
export async function publicPoll(db, secret, key, token) {
	const { poll, memberId, name } = await personFor(db, secret, key, token);
	const saved = await db.collection(AVAILABILITY).findOne({ pollId: poll.id, memberId });
	return {
		name,
		days: poll.days,
		slots: pollSlots(poll),
		picked: saved?.slots ?? [],
		savedAt: saved?.updatedAt ?? null
	};
}

/** Save (or replace) someone's free hours. */
export async function saveAvailability(db, secret, key, token, slots, now = new Date()) {
	const { poll, memberId } = await personFor(db, secret, key, token);
	if (!Array.isArray(slots) || !slots.length || slots.length > 48)
		throw invalid('Pick at least one hour you are free.');
	const allowed = new Set(pollSlots(poll));
	const picked = [...new Set(slots)].filter((slot) => allowed.has(slot)).sort();
	if (picked.length !== new Set(slots).size)
		throw invalid('Some of those times are not in this poll.');
	await db
		.collection(AVAILABILITY)
		.updateOne(
			{ pollId: poll.id, memberId },
			{ $set: { slots: picked, updatedAt: now }, $setOnInsert: { pollId: poll.id, memberId } },
			{ upsert: true }
		);
	return picked;
}

/** For the owner: everyone's link, who answered and who hasn't, and the hours ranked by how many are free. */
export async function pollSummary(db, secret, appUrl) {
	const poll = await currentPoll(db);
	if (!poll) return null;
	const [members, answers] = await Promise.all([
		db
			.collection(MEMBERS)
			.find({ status: { $in: ['invited', 'active'] } }, { projection: { nickname: 1, email: 1 } })
			.sort({ createdAt: 1 })
			.toArray(),
		db.collection(AVAILABILITY).find({ pollId: poll.id }).toArray()
	]);
	const answerOf = new Map(answers.map((answer) => [answer.memberId, answer]));
	const people = await Promise.all(
		members.map(async (member) => {
			const memberId = String(member._id);
			return {
				memberId,
				name: member.nickname || member.email,
				link: secret ? await personalLink(secret, poll, memberId, appUrl) : null,
				slots: answerOf.get(memberId)?.slots ?? null
			};
		})
	);
	const counts = new Map();
	for (const person of people)
		for (const slot of person.slots ?? [])
			counts.set(slot, [...(counts.get(slot) ?? []), person.name]);
	const slots = pollSlots(poll).map((slot) => ({ slot, free: counts.get(slot) ?? [] }));
	return {
		days: poll.days,
		openedAt: poll.openedAt,
		people,
		best: slots
			.filter((entry) => entry.free.length)
			.sort((a, b) => b.free.length - a.free.length || a.slot.localeCompare(b.slot))
			.slice(0, 6)
	};
}
