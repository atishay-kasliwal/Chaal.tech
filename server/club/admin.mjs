/**
 * Owner-only club administration: the guest list, club-wide settings and the beta emails.
 * The same rules as `npm run club` (scripts/club-members.mjs), reachable from the Admin page.
 */
import { ObjectId } from 'mongodb';
import { MEMBERS, ClubError, normalizeEmail } from './members.mjs';
import { CHARACTER_IDS, defaultCharacterFor } from './characters.mjs';
import {
	plannedSteps,
	sendBetaEmails,
	cancelBetaEmails,
	candidateNights,
	gameTime
} from './beta-emails.mjs';
import { currentPoll, pollNights, personalLink } from './availability.mjs';
import { getVariant } from '../variants/index.mjs';

/** Most games a night's lineup can hold. */
export const LINEUP_MAX = 30;
/** A lineup slot that draws a surprise game when its turn comes. */
export const MYSTERY = 'mystery';
/** Hands each lineup game is played for; 0 means one round (a hand per player at the table). */
export const LINEUP_HANDS = [1, 2, 3, 0];
const lineupItem = (v) => typeof v === 'string' && (v === MYSTERY || !!getVariant(v));
const cleanLineup = (lineup) =>
	Array.isArray(lineup) ? lineup.filter(lineupItem).slice(0, LINEUP_MAX) : [];
const cleanHands = (hands) => (LINEUP_HANDS.includes(hands) ? hands : 1);

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
	// The night's lineup: Teen Patti variants in play order. Empty means every game.
	return {
		...normalizeSettings(saved ?? DEFAULT_SETTINGS),
		lineup: cleanLineup(saved?.lineup),
		lineupHands: cleanHands(saved?.lineupHands)
	};
}

/** Set the night's lineup (owners only, checked by the caller). */
export async function saveLineup(db, lineup, byMemberId, now = new Date(), hands = 1) {
	if (!Array.isArray(lineup) || lineup.length > LINEUP_MAX)
		throw invalid(`A lineup holds up to ${LINEUP_MAX} games`);
	const clean = cleanLineup(lineup);
	if (clean.length !== lineup.length) throw invalid('Unknown game in the lineup');
	if (!LINEUP_HANDS.includes(hands))
		throw invalid('Play each game for 1, 2 or 3 hands, or one round');
	await db.collection(SETTINGS).updateOne(
		{ _id: 'club' },
		{
			$set: {
				lineup: clean,
				lineupHands: hands,
				lineupUpdatedAt: now,
				lineupUpdatedBy: byMemberId
			}
		},
		{ upsert: true }
	);
	return clean;
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
		// Never-chosen characters show the same stable default the member themselves would see.
		characterId: CHARACTER_IDS.includes(member.characterId)
			? member.characterId
			: defaultCharacterFor(String(member._id)),
		signedIn: Boolean(member.claimedAt),
		betaOptOut: member.betaOptOut === true,
		betaSteps: [...new Set((member.betaInvite?.emails ?? []).map((email) => email.step))].sort()
	}));
}

/**
 * Add someone to the guest list (or update their nickname/role). Sends nothing by itself.
 * Returns the member and whether they were new, so the caller can welcome new people.
 */
export async function addMember(db, { email, nickname, role }, now = new Date()) {
	const address = normalizeEmail(email);
	if (!EMAIL.test(address) || address.length > 254) throw invalid('Enter a valid email address');
	const name = typeof nickname === 'string' ? nickname.trim().slice(0, 24) : '';
	const owner = role === 'owner';
	const result = await db.collection(MEMBERS).updateOne(
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
				// A random character to start with; they can change it when they first sign in.
				characterId:
					CHARACTER_IDS[crypto.getRandomValues(new Uint32Array(1))[0] % CHARACTER_IDS.length],
				...(owner ? {} : { role: 'member' })
			}
		},
		{ upsert: true }
	);
	return {
		added: result.upsertedCount > 0,
		member: await db.collection(MEMBERS).findOne({ email: address })
	};
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
	// An open availability poll replaces the Google Form: its page is the link in the first email.
	const poll = await currentPoll(db);
	if (poll)
		beta = {
			...beta,
			formUrl: await personalLink(beta.secret, poll, String(member._id), beta.appUrl)
		};
	if (!steps.length) return [];
	if (!beta.apiKey)
		throw new ClubError(
			'Email is not set up on the server (RESEND_API_KEY).',
			'EMAIL_UNAVAILABLE',
			503
		);
	if (steps.some(({ step }) => step === 1) && !beta.formUrl)
		throw new ClubError(
			'Open a game-night poll first (Admin → Game night) so the first email has a link.',
			'EMAIL_UNAVAILABLE',
			503
		);
	const owner = await members.findOne({ role: 'owner', status: { $ne: 'suspended' } });
	const details = {
		formUrl: beta.formUrl,
		// An open availability poll decides which nights the first email offers.
		nights: (poll && pollNights(poll)) || candidateNights(now),
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

/** Send every active member whatever beta emails they are due. Returns how many got something. */
export async function sendDueBetaToAll(db, beta, now = new Date()) {
	const members = await db
		.collection(MEMBERS)
		.find(
			{ status: { $in: ['invited', 'active'] }, betaOptOut: { $ne: true } },
			{ projection: { _id: 1 } }
		)
		.toArray();
	let reached = 0;
	for (const member of members)
		if ((await sendDueBeta(db, String(member._id), beta, now)).length) reached++;
	return { reached, total: members.length };
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

/**
 * A new game-night round: forget the picked night and who was emailed, so the new poll's links
 * and the new time go out to everyone. Emails still scheduled for the old night are cancelled.
 */
export async function resetGameNight(db, { apiKey, now = new Date() } = {}) {
	const members = db.collection(MEMBERS);
	if (apiKey)
		for (const member of await members.find({ 'betaInvite.emails.0': { $exists: true } }).toArray())
			await cancelBetaEmails({ apiKey, emails: member.betaInvite.emails, now }).catch(() => []);
	await members.updateMany({}, { $unset: { betaInvite: '' } });
	await db.collection(SETTINGS).deleteOne({ _id: 'beta' });
}
