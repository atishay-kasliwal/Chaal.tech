import { MongoClient, ObjectId } from 'mongodb';
import { isProfilePhoto } from './profile-photo.mjs';
import { CHARACTER_IDS, defaultCharacterFor } from './characters.mjs';

/**
 * The club's guest list lives in MongoDB, collection `members`. The owner adds people
 * there directly (see docs/PRIVATE_CLUB.md); nobody can sign up on their own.
 *
 * { email, nickname?, characterId?, role: 'owner'|'member', status: 'invited'|'active'|'suspended',
 *   googleSub?, playerId?, sessionVersion?, reducedMotion?, onboardedAt?, createdAt, claimedAt?, updatedAt }
 */
export const MEMBERS = 'members';

export class ClubError extends Error {
	constructor(message, code, status = 403) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

export const clubUnavailable = () =>
	new ClubError(
		'The club is unreachable right now. Try again in a moment.',
		'CLUB_UNAVAILABLE',
		503
	);

export function normalizeEmail(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Hand-typed documents may not be lowercase; match the address case-insensitively. */
const emailQuery = (email) => ({
	email: { $regex: `^${escapeRegex(normalizeEmail(email))}$`, $options: 'i' }
});

function idQuery(memberId) {
	return ObjectId.isValid(memberId) && String(new ObjectId(memberId)) === memberId
		? { _id: new ObjectId(memberId) }
		: { _id: memberId };
}

/** One short-lived connection per call: Workers cannot share sockets between requests. */
export async function withClubDatabase(env, work) {
	if (!env.MONGODB_URI) throw new ClubError('Sign-in is not set up yet.', 'CLUB_UNCONFIGURED', 503);
	const client = new MongoClient(env.MONGODB_URI, {
		maxPoolSize: 1,
		serverSelectionTimeoutMS: 5000,
		connectTimeoutMS: 5000
	});
	try {
		await client.connect();
		return await work(client.db(env.MONGODB_DB || 'chaal'));
	} catch (error) {
		if (error instanceof ClubError) throw error;
		console.error('Club database error:', error?.name ?? 'Error');
		throw clubUnavailable();
	} finally {
		await client.close().catch(() => {});
	}
}

export async function ensureIndexes(db) {
	const members = db.collection(MEMBERS);
	await members.createIndex({ email: 1 }, { unique: true });
	await members.createIndex(
		{ googleSub: 1 },
		{ unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } }
	);
	await members.createIndex(
		{ playerId: 1 },
		{ unique: true, partialFilterExpression: { playerId: { $type: 'string' } } }
	);
}

const cleanNickname = (value) =>
	typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 24) : '';

/** What the member and the table may see. Never the email, Google ID or session version. */
export function publicProfile(member) {
	const memberId = String(member._id);
	return {
		memberId,
		playerId: member.playerId,
		nickname: cleanNickname(member.nickname) || 'Friend',
		characterId: CHARACTER_IDS.includes(member.characterId)
			? member.characterId
			: defaultCharacterFor(memberId),
		photoDataUrl: isProfilePhoto(member.photoDataUrl) ? member.photoDataUrl : null,
		role: member.role === 'owner' ? 'owner' : 'member',
		reducedMotion: member.reducedMotion === true,
		onboarded: Boolean(member.onboardedAt)
	};
}

/** Lobby roster entry: only what friends see of each other. */
export function rosterEntry(member) {
	const { memberId, playerId, nickname, characterId, photoDataUrl } = publicProfile(member);
	// Invited people show in the club too, marked as not joined until they first sign in.
	return {
		memberId,
		playerId,
		nickname,
		characterId,
		photoDataUrl,
		joined: member.status === 'active'
	};
}

export function assertActive(member) {
	if (!member) throw new ClubError('Sign in again to continue.', 'SIGN_IN', 401);
	if (member.status === 'suspended')
		throw new ClubError('Your club access is paused. Ask the club owner.', 'SUSPENDED', 403);
	if (member.status !== 'active' || !member.googleSub || !member.playerId)
		throw new ClubError('Sign in again to continue.', 'SIGN_IN', 401);
	return member;
}

/**
 * The Google account that signs in for an invited email claims it once. After that only that
 * Google account (by its stable `sub`) is the member; changing email or nickname moves nothing.
 */
export async function claimMembership(db, { sub, email, givenName }) {
	const members = db.collection(MEMBERS);
	const known = await members.findOne({ googleSub: sub });
	if (known) return assertActive(known);
	const now = new Date();
	const claimed = await members.findOneAndUpdate(
		{ ...emailQuery(email), status: { $in: ['invited', 'active'] }, googleSub: null },
		[
			{
				$set: {
					googleSub: sub,
					status: 'active',
					playerId: { $ifNull: ['$playerId', { $literal: crypto.randomUUID() }] },
					sessionVersion: { $ifNull: ['$sessionVersion', 1] },
					// $literal: a Google name such as "$x" must not read as a field path.
					nickname: { $ifNull: ['$nickname', { $literal: cleanNickname(givenName) || 'Friend' }] },
					role: { $ifNull: ['$role', 'member'] },
					claimedAt: now,
					updatedAt: now
				}
			}
		],
		{ returnDocument: 'after' }
	);
	if (claimed) return claimed;
	const invited = await members.findOne(emailQuery(email));
	if (invited?.status === 'suspended')
		throw new ClubError('Your club access is paused. Ask the club owner.', 'SUSPENDED');
	if (invited?.googleSub)
		throw new ClubError(
			'This email is already linked to a different Google account.',
			'WRONG_ACCOUNT'
		);
	throw new ClubError('This Google account is not on the club’s guest list.', 'NOT_INVITED');
}

export async function memberById(db, memberId) {
	return db.collection(MEMBERS).findOne(idQuery(memberId));
}

/** Members may change only how they look; everything else is the owner's, in the database. */
export function profilePatch(input) {
	if (!input || typeof input !== 'object')
		throw new ClubError('Nothing to save', 'INVALID_PROFILE', 400);
	const patch = {};
	if ('nickname' in input) {
		const nickname = cleanNickname(input.nickname);
		if (!nickname)
			throw new ClubError('Pick a nickname of 1–24 characters', 'INVALID_PROFILE', 400);
		patch.nickname = nickname;
	}
	if ('characterId' in input) {
		if (!CHARACTER_IDS.includes(input.characterId))
			throw new ClubError('Unknown character', 'INVALID_PROFILE', 400);
		patch.characterId = input.characterId;
	}
	if ('reducedMotion' in input) {
		if (typeof input.reducedMotion !== 'boolean')
			throw new ClubError('Invalid setting', 'INVALID_PROFILE', 400);
		patch.reducedMotion = input.reducedMotion;
	}
	if ('photoDataUrl' in input) {
		if (input.photoDataUrl !== null && !isProfilePhoto(input.photoDataUrl))
			throw new ClubError(
				'Choose a photo using the profile cropper (24 KB maximum).',
				'INVALID_PROFILE',
				400
			);
		patch.photoDataUrl = input.photoDataUrl;
	}
	return patch;
}

export async function updateProfile(db, memberId, input, { onboard = false } = {}) {
	const patch = profilePatch(input);
	const now = new Date();
	const updated = await db
		.collection(MEMBERS)
		.findOneAndUpdate(
			{ ...idQuery(memberId), status: 'active' },
			{ $set: { ...patch, updatedAt: now, ...(onboard ? { onboardedAt: now } : {}) } },
			{ returnDocument: 'after' }
		);
	return assertActive(updated);
}

export async function activeRoster(db) {
	const members = await db
		.collection(MEMBERS)
		.find(
			{ status: { $in: ['active', 'invited'] } },
			{ projection: { playerId: 1, nickname: 1, characterId: 1, photoDataUrl: 1, status: 1 } }
		)
		.limit(100)
		.toArray();
	return members.map(rosterEntry);
}

/** Emails of members picked from the friends list (invited or active), for table invites. */
export async function emailsForMembers(db, memberIds) {
	const ids = [...new Set(memberIds)].filter((id) => typeof id === 'string' && id.length <= 64);
	if (!ids.length) return [];
	const members = await db
		.collection(MEMBERS)
		.find(
			{ status: { $in: ['invited', 'active'] }, $or: ids.map(idQuery) },
			{ projection: { email: 1 } }
		)
		.toArray();
	return members.map((member) => normalizeEmail(member.email)).filter(Boolean);
}

/** Table invites may only reach people already on the guest list; they never add anyone. */
export async function invitableEmails(db, emails) {
	if (!emails.length) return [];
	const members = await db
		.collection(MEMBERS)
		.find(
			{ status: { $in: ['invited', 'active'] }, $or: emails.map(emailQuery) },
			{ projection: { email: 1 } }
		)
		.toArray();
	const known = new Set(members.map((member) => normalizeEmail(member.email)));
	return emails.filter((email) => known.has(normalizeEmail(email)));
}

/** A member's role ('owner' or 'member'), or null when they are not on the guest list. */
export async function memberRole(db, memberId) {
	if (typeof memberId !== 'string' || !memberId || memberId.length > 64) return null;
	const member = await db
		.collection(MEMBERS)
		.findOne(
			{ ...idQuery(memberId), status: { $in: ['invited', 'active'] } },
			{ projection: { role: 1 } }
		);
	return member ? (member.role ?? 'member') : null;
}

/** Email and name for the members behind these table player ids (people only; bots have none). */
export async function membersForPlayers(db, playerIds) {
	const ids = [...new Set(playerIds)].filter((id) => typeof id === 'string' && id.length <= 64);
	if (!ids.length) return [];
	const members = await db
		.collection(MEMBERS)
		.find(
			{ playerId: { $in: ids }, status: { $in: ['invited', 'active'] } },
			{ projection: { playerId: 1, email: 1, nickname: 1 } }
		)
		.toArray();
	return members.map((member) => ({
		playerId: member.playerId,
		email: normalizeEmail(member.email),
		nickname: member.nickname ?? ''
	}));
}
