#!/usr/bin/env node
/**
 * Manage the private club's guest list in MongoDB. Reads MONGODB_URI (and MONGODB_DB) from
 * the environment or .env. Examples:
 *
 *   npm run club -- add raju@gmail.com --nickname Raju --character tiger
 *   npm run club -- add me@gmail.com --owner
 *   npm run club -- add raju@gmail.com --mascot adityaraj   (links the friend's personal mascot)
 *   npm run club -- list
 *   npm run club -- suspend raju@gmail.com      (also signs them out within five minutes)
 *   npm run club -- activate raju@gmail.com
 *   npm run club -- unlink raju@gmail.com       (lets a different Google account claim the email)
 *
 * Beta emails (server/club/beta-emails.mjs). Need RESEND_API_KEY, and BETA_FORM_URL for day 1.
 *   add                                          sends day 1 (availability) unless --no-beta
 *   npm run club -- beta-decide --start "2026-10-24 21:00"
 *                                                time picked: day 2 ("it's set") to everyone now,
 *                                                day 3 (welcome to the membership) a day later
 *   npm run club -- beta raju@gmail.com | --all  send whatever someone has not had yet
 *   npm run club -- beta-preview [folder]        write all three emails as HTML to look at
 */
import { MongoClient } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MEMBERS, ensureIndexes, normalizeEmail } from '../server/club/members.mjs';
import { CHARACTER_IDS } from '../server/club/characters.mjs';
import { MASCOT_IDS } from '../server/club/mascots.mjs';
import {
	BETA_STEPS,
	betaMessage,
	sendBetaEmails,
	plannedSteps,
	cancelBetaEmails,
	candidateNights,
	gameTime
} from '../server/club/beta-emails.mjs';

const [command, email, ...rest] = process.argv.slice(2);
const args = [email, ...rest];
const flag = (name) => {
	const index = args.indexOf(`--${name}`);
	if (index === -1) return undefined;
	const value = args[index + 1];
	return value === undefined || value.startsWith('--') ? true : value;
};

function fail(message) {
	console.error(message);
	process.exit(1);
}

const usage =
	'Usage: npm run club -- <add|list|suspend|activate|unlink|remove|beta|beta-decide|beta-preview> [email|--all] [--nickname N] [--character C] [--mascot M] [--owner] [--no-beta] [--start "YYYY-MM-DD HH:MM"]';
if (!command) fail(usage);

const beta = {
	apiKey: process.env.RESEND_API_KEY,
	from: process.env.BETA_FROM || process.env.INVITE_FROM || 'Chaal <invites@chaal.tech>',
	formUrl: process.env.BETA_FORM_URL,
	appUrl: process.env.PUBLIC_APP_URL || 'https://chaal.tech',
	nights: typeof flag('nights') === 'string' ? flag('nights') : undefined
};

if (command === 'beta-preview') {
	const folder = email && !email.startsWith('--') ? email : 'beta-email-preview';
	const start = typeof flag('start') === 'string' ? flag('start') : null;
	const game = gameTime(start ?? nextSaturdayNine(), beta.appUrl);
	await mkdir(folder, { recursive: true });
	for (const step of BETA_STEPS) {
		const message = betaMessage(step, {
			nickname: 'Raju',
			formUrl: beta.formUrl || 'https://forms.gle/your-form',
			nights: beta.nights || candidateNights(),
			game,
			host: process.env.BETA_HOST || 'Atishay',
			appUrl: beta.appUrl
		});
		await writeFile(path.join(folder, `day-${step}.html`), message.html);
		console.log(`Day ${step}: ${message.subject}`);
	}
	console.log(
		`Wrote ${BETA_STEPS.length} previews to ${folder}/ (sample game time: ${game.label}).`
	);
	process.exit(0);
}

function nextSaturdayNine() {
	const date = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
	while (
		new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(
			date
		) !== 'Sat'
	)
		date.setTime(date.getTime() + 24 * 60 * 60 * 1000);
	const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);
	return `${day} 21:00`;
}

if (!process.env.MONGODB_URI) fail('Set MONGODB_URI (for example in .env) first.');

const client = new MongoClient(process.env.MONGODB_URI);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	const members = db.collection(MEMBERS);
	const settings = db.collection('club_settings');
	await ensureIndexes(db);
	const now = new Date();

	/** Send a member whatever beta emails they are due, and record them. */
	async function sendBeta(member) {
		if (member.status === 'suspended')
			return console.log(`  ${member.email} is suspended. Skipping.`);
		if (member.betaOptOut) return;
		const decision = await settings.findOne({ _id: 'beta' });
		const steps = plannedSteps(member, decision, now);
		if (!steps.length)
			return console.log(`  ${member.email} already has every beta email. Skipping.`);
		if (!beta.apiKey) fail('Set RESEND_API_KEY (for example in .env) to send beta emails.');
		if (steps.some(({ step }) => step === 1) && !beta.formUrl)
			fail('Set BETA_FORM_URL (the Google Form share link) to send the availability email.');
		const owner = await members.findOne({ role: 'owner', status: { $ne: 'suspended' } });
		const details = {
			formUrl: beta.formUrl,
			nights: beta.nights || candidateNights(now),
			game: decision ? gameTime(decision.start.toISOString(), beta.appUrl) : null,
			host: process.env.BETA_HOST || owner?.nickname || 'The Chaal table',
			appUrl: beta.appUrl
		};
		try {
			const sent = await sendBetaEmails({ ...beta, member, steps, details, now });
			record(member, sent);
			await members.updateOne(
				{ _id: member._id },
				{ $push: { 'betaInvite.emails': { $each: sent } } }
			);
		} catch (error) {
			if (error.sent?.length)
				await members.updateOne(
					{ _id: member._id },
					{ $push: { 'betaInvite.emails': { $each: error.sent } } }
				);
			console.error(
				`  ${member.email}: ${error.message}. Rerun "beta ${member.email}" to finish; nothing is sent twice.`
			);
			process.exitCode = 1;
		}
	}

	function record(member, sent) {
		for (const entry of sent)
			console.log(
				`  ${member.email} · day ${entry.step} ${entry.at > now ? `scheduled ${entry.at.toISOString()}` : 'sent now'}: ${entry.subject}`
			);
	}

	async function cancelBeta(member) {
		if (!member?.betaInvite?.emails?.length || !beta.apiKey) return [];
		const cancelled = await cancelBetaEmails({
			apiKey: beta.apiKey,
			emails: member.betaInvite.emails,
			now
		});
		if (cancelled.length)
			console.log(
				`  Cancelled pending beta email (day ${cancelled.join(', ')}) for ${member.email}.`
			);
		return cancelled;
	}

	const everyone = (command === 'beta' && email === '--all') || command === 'beta-decide';
	const address = normalizeEmail(email);
	if (command !== 'list' && !everyone && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) fail(usage);

	if (command === 'add') {
		const nickname = flag('nickname');
		const characterId = flag('character');
		if (characterId && !CHARACTER_IDS.includes(characterId))
			fail(`Unknown character. Pick one of: ${CHARACTER_IDS.join(', ')}`);
		const mascotId = flag('mascot');
		if (mascotId && !MASCOT_IDS.includes(mascotId))
			fail(`Unknown mascot. Pick one of: ${MASCOT_IDS.join(', ')}`);
		const result = await members.updateOne(
			{ email: address },
			{
				$set: {
					...(typeof nickname === 'string' ? { nickname: nickname.slice(0, 24) } : {}),
					...(characterId ? { characterId } : {}),
					...(mascotId ? { mascotId } : {}),
					...(flag('owner') ? { role: 'owner' } : {}),
					// --no-beta: this member never gets the beta emails, now or on beta-decide.
					...(flag('no-beta') ? { betaOptOut: true } : {}),
					updatedAt: now
				},
				$setOnInsert: {
					email: address,
					status: 'invited',
					createdAt: now,
					...(flag('owner') ? {} : { role: 'member' })
				}
			},
			{ upsert: true }
		);
		console.log(result.upsertedCount ? `Added ${address} to the club.` : `Updated ${address}.`);
		if (result.upsertedCount && !flag('no-beta'))
			await sendBeta(await members.findOne({ email: address }));
	} else if (command === 'beta-decide') {
		const start = flag('start');
		if (typeof start !== 'string')
			fail('Give the chosen time: npm run club -- beta-decide --start "2026-10-24 21:00"');
		const game = gameTime(start, beta.appUrl);
		const previous = await settings.findOne({ _id: 'beta' });
		if (previous && previous.start.getTime() !== game.start.getTime()) {
			if (!flag('force'))
				fail(
					`The beta is already set for ${gameTime(previous.start.toISOString()).label}. Add --force to change it and re-send days 2 and 3.`
				);
			for (const member of await members
				.find({ 'betaInvite.emails.step': { $in: [2, 3] } })
				.toArray()) {
				await cancelBeta(member);
				await members.updateOne(
					{ _id: member._id },
					{ $pull: { 'betaInvite.emails': { step: { $in: [2, 3] } } } }
				);
			}
		}
		await settings.updateOne(
			{ _id: 'beta' },
			{ $set: { start: game.start, decidedAt: now } },
			{ upsert: true }
		);
		console.log(`Beta set for ${game.label}.`);
		for (const member of await members.find({ status: { $in: ['invited', 'active'] } }).toArray())
			await sendBeta(member);
	} else if (command === 'beta') {
		const targets = everyone
			? await members.find({ status: { $in: ['invited', 'active'] } }).toArray()
			: [await members.findOne({ email: address })];
		if (!targets[0] && !everyone) fail(`${address} is not on the guest list. Add them first.`);
		for (const member of targets) await sendBeta(member);
	} else if (command === 'list') {
		const decision = await settings.findOne({ _id: 'beta' });
		if (decision) console.log(`Beta set for ${gameTime(decision.start.toISOString()).label}`);
		const rows = await members
			.find(
				{},
				{
					projection: {
						email: 1,
						nickname: 1,
						role: 1,
						status: 1,
						characterId: 1,
						mascotId: 1,
						claimedAt: 1,
						betaInvite: 1
					}
				}
			)
			.sort({ createdAt: 1 })
			.toArray();
		console.table(
			rows.map(
				({
					email: rowEmail,
					nickname,
					role,
					status,
					characterId,
					mascotId,
					claimedAt,
					betaInvite
				}) => ({
					email: rowEmail,
					nickname,
					role,
					status,
					character: characterId ?? '(default)',
					mascot: mascotId ?? '-',
					signedIn: claimedAt ? 'yes' : 'not yet',
					betaEmails:
						[...new Set((betaInvite?.emails ?? []).map((entry) => entry.step))].sort().join(',') ||
						'-'
				})
			)
		);
	} else if (command === 'suspend' || command === 'activate') {
		const suspended = command === 'suspend';
		const member = await members.findOne({ email: address });
		if (!member) fail(`${address} is not on the guest list.`);
		await members.updateOne(
			{ _id: member._id },
			{
				$set: {
					status: suspended ? 'suspended' : member.googleSub ? 'active' : 'invited',
					updatedAt: now
				},
				// A new session version ends every existing sign-in for this member.
				$inc: { sessionVersion: suspended ? 1 : 0 }
			}
		);
		console.log(`${suspended ? 'Suspended' : 'Reactivated'} ${address}.`);
		if (suspended) {
			const cancelled = await cancelBeta(member);
			if (cancelled.length)
				await members.updateOne(
					{ _id: member._id },
					{ $pull: { 'betaInvite.emails': { step: { $in: cancelled } } } }
				);
		}
	} else if (command === 'unlink') {
		const result = await members.updateOne(
			{ email: address },
			{
				$unset: { googleSub: '' },
				$set: { status: 'invited', updatedAt: now },
				$inc: { sessionVersion: 1 }
			}
		);
		console.log(
			result.matchedCount
				? `${address} can now be claimed by its Google account again. Their player and chips stay the same.`
				: `${address} is not on the guest list.`
		);
	} else if (command === 'remove') {
		const member = await members.findOne({ email: address });
		if (
			member?.role === 'owner' &&
			(await members.countDocuments({ role: 'owner', status: { $ne: 'suspended' } })) <= 1
		)
			fail('That is the last owner. Add another owner first.');
		await cancelBeta(member);
		const result = await members.deleteOne({ email: address });
		console.log(
			result.deletedCount
				? `Removed ${address}. Prefer "suspend" to keep their profile.`
				: `${address} is not on the guest list.`
		);
	} else fail(usage);
} finally {
	await client.close();
}
