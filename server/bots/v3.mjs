/**
 * Version 3 of each character: the adaptive style plus the three Phase 6 behaviours, as ordinary
 * reviewed drafts through the same path the admin page uses. Published styles are never edited; each
 * bot just gets a new immutable version, with the reason stored in its history.
 */
import { manageBot } from './directory.mjs';
import { EVOLUTIONS } from './evolution.mjs';
import { compareStyles } from './exploit-sim.mjs';
import { ADAPTIVE_POLICY, defaultMemory } from './memory/adaptive.mjs';

/** What each character weighs when it reads a line (see docs/BOT_PERSONALITY.md). */
export const FOCUS = Object.freeze({
	'rohit-sharma': 'balanced',
	'virat-kohli': 'bluffs',
	'ms-dhoni': 'overbets',
	gg: 'careful',
	'samay-raina': 'tilt'
});
export const LINE_WEIGHT = 0.12;
export const REASON =
	'Stays blind against a blind raiser (closes the keep-raising exploit), reads the opponent’s betting line, and remembers its own character’s kind of habit.';

export async function publishV3(db, owner, { hands = 80, now = Date.now(), log = () => {} } = {}) {
	const bots = await db
		.collection('bots')
		.find({ status: 'active', _id: { $in: Object.keys(FOCUS) } })
		.toArray();
	const out = [];
	for (const bot of bots) {
		const current = await db
			.collection('bot_styles')
			.findOne({ _id: bot.currentStyle, status: 'published' });
		if (!current) continue;
		if (current.tendencies.blindMatch === 1 && current.memory?.focus) {
			out.push({ botId: bot._id, skipped: 'already on the new behaviour' });
			continue;
		}
		const candidate = {
			...current,
			policy: ADAPTIVE_POLICY,
			tendencies: { ...current.tendencies, blindMatch: 1 },
			memory: {
				...(current.memory ?? defaultMemory(current.tendencies)),
				lineWeight: LINE_WEIGHT,
				focus: FOCUS[bot._id]
			},
			source: 'manual',
			notes: REASON
		};
		const comparison = compareStyles(current.tendencies, candidate.tendencies, { hands, seed: 1 });
		await manageBot(db, owner, { action: 'draft', botId: bot._id, config: candidate });
		const after = await db.collection('bots').findOne({ _id: bot._id });
		const styleId = `${bot._id}@${after.nextVersion}`;
		await manageBot(db, owner, { action: 'validate', botId: bot._id, styleId });
		const drafted = await db.collection('bot_styles').findOne({ _id: styleId });
		if (!drafted.validation?.passed)
			throw new Error(
				`${styleId} failed validation: ${(drafted.validation?.errors ?? []).join('; ')}`
			);
		// A candidate that is clearly easier to exploit in some strategy is not published.
		if (comparison.regressions.length) {
			out.push({
				botId: bot._id,
				styleId,
				held: `easier to exploit with ${comparison.regressions.join(', ')}`
			});
			continue;
		}
		await manageBot(db, owner, { action: 'publish', botId: bot._id, styleId });
		await db.collection(EVOLUTIONS).insertOne({
			_id: `${bot._id}:blind-raise-war:${now}`,
			botId: bot._id,
			baseStyleId: current._id,
			status: 'published',
			finding: {
				id: 'blind-raise-war',
				title: 'A blind max-raiser prices out a seen bot',
				why: 'A seen player pays double against a blind one and cannot Show.',
				evidence: {
					exploiterEdgeBefore: comparison.base.perHand,
					after: comparison.candidate.perHand
				}
			},
			draftStyleId: styleId,
			comparison,
			review: { by: String(owner._id), at: now, decision: 'approve', note: REASON },
			createdAt: now,
			updatedAt: now,
			history: [{ status: 'published', at: now, by: String(owner._id) }]
		});
		log(
			`${bot._id}: published ${styleId} (exploiter edge ${comparison.base.perHand} to ${comparison.candidate.perHand})`
		);
		out.push({
			botId: bot._id,
			styleId,
			before: comparison.base.perHand,
			after: comparison.candidate.perHand
		});
	}
	return out;
}
