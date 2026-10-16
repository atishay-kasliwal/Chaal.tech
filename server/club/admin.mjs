/**
 * Owner-only club administration: the guest list, club-wide settings and the beta emails.
 * The same rules as `npm run club` (scripts/club-members.mjs), reachable from the Admin page.
 */
import { ObjectId } from 'mongodb';
import { MEMBERS, ClubError, normalizeEmail } from './members.mjs';
import { CHARACTER_IDS } from './characters.mjs';
import {
	plannedSteps,
	sendBetaEmails,
	cancelBetaEmails,
	candidateNights,
	gameTime
} from './beta-emails.mjs';

export const SETTINGS = 'club_settings';

/** Choices the Admin page offers; the start panel and table read the saved ones. */
export const BOOTS = [5, 10, 20, 50, 100];
export const POT_LIMITS = [0, 64, 128, 256, 512];
export const FELTS = ['emerald', 'sapphire', 'crimson', 'onyx'];
export const CARD_BACKS = ['navy', 'crimson', 'forest'];
export const DEFAULT_SETTINGS = Object.freeze({
	table: { chips: 1000, boot: 10, potLimit: 128 },
	look: { felt: 'emerald', cardBack: 'navy' }
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalid = (message) => new ClubError(message, 'INVALID_ADMIN_REQUEST', 400);

function idQuery(memberId) {
	if (typeof memberId !== 'string' || memberId.length > 64) throw invalid('Unknown member');
	return ObjectId.isValid(memberId) && String(new ObjectId(memberId)) === memberId
		? { _id: new ObjectId(memberId) }
		: { _id: memberId };
}

/** Validated club settings: anything missing or out of range falls back to the default. */
export function normalizeSettings(input = {}) {
	const table = input?.table ?? {};
	const look = input?.look ?? {};
	const chips = Number(table.chips);
	const boot = BOOTS.includes(table.boot) ? table.boot : DEFAULT_SETTINGS.table.boot;
	const settings = {
		table: {
			chips:
				Number.isSafeInteger(chips) && chips >= 1000 && chips <= 1_000_000
					? chips
					: DEFAULT_SETTINGS.table.chips,
			boot,
			potLimit: POT_LIMITS.includes(table.potLimit)
				? table.potLimit
				: DEFAULT_SETTINGS.table.potLimit
		},
		look: {
			felt: FELTS.includes(look.felt) ? look.felt : DEFAULT_SETTINGS.look.felt,
			cardBack: CARD_BACKS.includes(look.cardBack) ? look.cardBack : DEFAULT_SETTINGS.look.cardBack
		}
	};
	// Same rule as the start panel: the boot is at most 1/20 of the starting chips.
	if (settings.table.boot * 20 > settings.table.chips)
		settings.table.boot = BOOTS.filter((value) => value * 20 <= settings.table.chips).at(-1);
	return settings;
}

export async function clubSettings(db) {
	const saved = await db.collection(SETTINGS).findOne({ _id: 'club' });
	return normalizeSettings(saved ?? DEFAULT_SETTINGS);
}

/** Save club settings. Unknown or out-of-range values are rejected rather than silently changed. */
export async function saveClubSettings(db, input, byMemberId, now = new Date()) {
	const settings = normalizeSettings(input);
	if (JSON.stringify(settings.table) !== JSON.stringify(input?.table))
		throw invalid('Starting chips must be ₹1,000–₹10,00,000, boot at most 1/20 of them');
	if (JSON.stringify(settings.look) !== JSON.stringify(input?.look))
		throw invalid('Unknown table look');
	await db
		.collection(SETTINGS)
		.updateOne(
			{ _id: 'club' },
			{ $set: { ...settings, updatedAt: now, updatedBy: byMemberId } },
			{ upsert: true }
		);
	return settings;
}

/** Everything an owner sees about each member. Never the Google subject or session data. */
export async function adminMembers(db) {
	const rows = await db
		.collection(MEMBERS)
		.find(
			{},
			{
				projection: {
					email: 1,
					nickname: 1,
					role: 1,
					status: 1,
					characterId: 1,
					claimedAt: 1,
					createdAt: 1,
					betaOptOut: 1,
					'betaInvite.emails.step': 1,
					'betaInvite.emails.at': 1
				}
			}
		)
		.sort({ createdAt: 1 })
		.toArray();
	return rows.map((member) => ({
		memberId: String(member._id),
		email: member.email,
		nickname: member.nickname ?? '',
		role: member.role === 'owner' ? 'owner' : 'member',
		status: member.status,
		characterId: CHARACTER_IDS.includes(member.characterId) ? member.characterId : null,
		signedIn: Boolean(member.claimedAt),
		betaOptOut: member.betaOptOut === true,
		betaSteps: [...new Set((member.betaInvite?.emails ?? []).map((email) => email.step))].sort()
	}));
}

/** Add someone to the guest list (or update their nickname/role). Sends nothing by itself. */
export async function addMember(db, { email, nickname, role }, now = new Date()) {
	const address = normalizeEmail(email);
	if (!EMAIL.test(address) || address.length > 254) throw invalid('Enter a valid email address');
	const name = typeof nickname === 'string' ? nickname.trim().slice(0, 24) : '';
	const owner = role === 'owner';
	await db.collection(MEMBERS).updateOne(
		{ email: address },
		{
			$set: {
				...(name ? { nickname: name } : {}),
				...(owner ? { role: 'owner' } : {}),
				updatedAt: now
			},
			$setOnInsert: {
				email: address,
				status: 'invited',
				createdAt: now,
				...(owner ? {} : { role: 'member' })
			}
		},
		{ upsert: true }
	);
}

async function activeOwners(db) {
	return db.collection(MEMBERS).countDocuments({ role: 'owner', status: { $ne: 'suspended' } });
}

/** Pause or restore a member. Pausing ends every sign-in and cancels scheduled beta emails. */
export async function setMemberPaused(
	db,
	memberId,
	paused,
	{ actorId, apiKey, now = new Date() } = {}
) {
	const members = db.collection(MEMBERS);
	const member = await members.findOne(idQuery(memberId));
	if (!member) throw invalid('Unknown member');
	if (paused && memberId === actorId) throw invalid('You cannot pause yourself');
	if (paused && member.role === 'owner' && (await activeOwners(db)) <= 1)
		throw invalid('That is the last owner. Make someone else an owner first.');
	await members.updateOne(
		{ _id: member._id },
		{
			$set: {
				status: paused ? 'suspended' : member.googleSub ? 'active' : 'invited',
				updatedAt: now
			},
			// A new session version ends every existing sign-in for this member.
			$inc: { sessionVersion: paused ? 1 : 0 }
		}
	);
	if (paused && apiKey && member.betaInvite?.emails?.length) {
		const cancelled = await cancelBetaEmails({ apiKey, emails: member.betaInvite.emails, now });
		if (cancelled.length)
			await members.updateOne(
				{ _id: member._id },
				{ $pull: { 'betaInvite.emails': { step: { $in: cancelled } } } }
			);
	}
}

/** Make a member an owner, or an owner a member. There is always at least one owner. */
export async function setMemberRole(db, memberId, role, now = new Date()) {
	if (role !== 'owner' && role !== 'member') throw invalid('Unknown role');
	const members = db.collection(MEMBERS);
	const member = await members.findOne(idQuery(memberId));
	if (!member) throw invalid('Unknown member');
	if (role === 'member' && member.role === 'owner' && (await activeOwners(db)) <= 1)
		throw invalid('That is the last owner. Make someone else an owner first.');
	await members.updateOne({ _id: member._id }, { $set: { role, updatedAt: now } });
}

/** The chosen beta game night, if any, for the Admin page. */
export async function betaDecision(db, appUrl) {
	const decision = await db.collection(SETTINGS).findOne({ _id: 'beta' });
	return decision
		? { start: decision.start, label: gameTime(decision.start.toISOString(), appUrl).label }
		: null;
}

/**
 * Send a member whichever beta emails they are due, and record them (idempotent: nothing is
 * sent twice). Returns the steps sent.
 */
export async function sendDueBeta(db, memberId, beta, now = new Date()) {
	const members = db.collection(MEMBERS);
	const member = await members.findOne(idQuery(memberId));
	if (!member) throw invalid('Unknown member');
	if (member.status === 'suspended') throw invalid('That member is paused');
	if (member.betaOptOut) throw invalid('That member opted out of beta emails');
	const decision = await db.collection(SETTINGS).findOne({ _id: 'beta' });
	const steps = plannedSteps(member, decision, now);
	if (!steps.length) return [];
	if (!beta.apiKey)
		throw new ClubError(
			'Email is not set up on the server (RESEND_API_KEY).',
			'EMAIL_UNAVAILABLE',
			503
		);
	if (steps.some(({ step }) => step === 1) && !beta.formUrl)
		throw new ClubError(
			'Set BETA_FORM_URL on the server to send the availability email.',
			'EMAIL_UNAVAILABLE',
			503
		);
	const owner = await members.findOne({ role: 'owner', status: { $ne: 'suspended' } });
	const details = {
		formUrl: beta.formUrl,
		nights: candidateNights(now),
		game: decision ? gameTime(decision.start.toISOString(), beta.appUrl) : null,
		host: owner?.nickname || 'The Chaal table',
		appUrl: beta.appUrl
	};
	try {
		const sent = await sendBetaEmails({ ...beta, member, steps, details, now });
		await members.updateOne(
			{ _id: member._id },
			{ $push: { 'betaInvite.emails': { $each: sent } } }
		);
		return sent.map((entry) => entry.step);
	} catch (error) {
		// Record whatever went out before the failure, so a retry never sends it twice.
		if (error.sent?.length)
			await members.updateOne(
				{ _id: member._id },
				{ $push: { 'betaInvite.emails': { $each: error.sent } } }
			);
		throw new ClubError('Some beta emails could not be sent. Try again.', 'EMAIL_FAILED', 502);
	}
}

/** Pick the beta game night. Changing an already chosen night is not offered here. */
export async function decideGameNight(db, start, appUrl, now = new Date()) {
	let game;
	try {
		game = gameTime(start, appUrl);
	} catch {
		throw invalid('Pick a date and time');
	}
	const previous = await db.collection(SETTINGS).findOne({ _id: 'beta' });
	if (previous && previous.start.getTime() !== game.start.getTime())
		throw invalid(
			`The beta is already set for ${gameTime(previous.start.toISOString(), appUrl).label}. Change it with npm run club -- beta-decide --force.`
		);
	await db
		.collection(SETTINGS)
		.updateOne({ _id: 'beta' }, { $set: { start: game.start, decidedAt: now } }, { upsert: true });
	return game.label;
}
