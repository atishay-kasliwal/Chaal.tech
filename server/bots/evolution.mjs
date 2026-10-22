/**
 * The bot evolution workflow (docs/archive/ANALYTICS_PHASE5.md, "Bot evolution"). Analytics can notice a
 * weakness; only an owner can change a bot, and only by publishing a NEW immutable style version.
 *
 *   observed → proposed → simulated → validated → approved → published      (or rejected)
 *
 * Each step is an explicit owner action. A proposal is a normal draft style created through the
 * existing manageBot path, so every rule that protects published styles still applies: a published
 * version is never edited, a bot's identity never changes, and historical hands keep resolving to the
 * exact version that played them. Nothing here runs on a timer or patches a bot automatically.
 */
import { ClubError } from '../club/members.mjs';
import { RANGES } from './config.mjs';
import { MEMORY_RANGES } from './memory/adaptive.mjs';
import { manageBot } from './directory.mjs';
import { compareStyles } from './exploit-sim.mjs';

export const EVOLUTIONS = 'bot_evolution';
export const STATES = Object.freeze([
	'observed',
	'proposed',
	'simulated',
	'validated',
	'approved',
	'rejected',
	'published'
]);
const fail = (message, status = 400) => new ClubError(message, 'INVALID_BOT_REQUEST', status);
const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
const round3 = (x) => Math.round(x * 1000) / 1000;

/** Apply a finding's suggested deltas to a style, clamped to the allowed ranges. Returns null if nothing changes. */
export function proposeChange(style, suggestion = {}) {
	const tendencies = { ...style.tendencies };
	const changes = [];
	for (const [key, delta] of Object.entries(suggestion)) {
		if (key === 'memory' || !Object.hasOwn(RANGES, key) || typeof delta !== 'number') continue;
		const next = round3(clamp(tendencies[key] + delta, RANGES[key]));
		if (next !== tendencies[key])
			changes.push({ key: `tendencies.${key}`, from: tendencies[key], to: next });
		tendencies[key] = next;
	}
	if (tendencies.raise < tendencies.call) tendencies.raise = tendencies.call;
	let memory = style.memory;
	if (suggestion.memory && memory) {
		memory = { ...memory };
		for (const [key, delta] of Object.entries(suggestion.memory)) {
			if (!Object.hasOwn(MEMORY_RANGES, key)) continue;
			const next = round3(clamp(memory[key] + delta, MEMORY_RANGES[key]));
			if (next !== memory[key]) changes.push({ key: `memory.${key}`, from: memory[key], to: next });
			memory[key] = next;
		}
	}
	return changes.length ? { tendencies, memory, changes } : null;
}

async function current(db, botId) {
	const bot = await db.collection('bots').findOne({ _id: botId });
	if (!bot) throw fail('Unknown bot', 404);
	const style = await db
		.collection('bot_styles')
		.findOne({ _id: bot.currentStyle, status: 'published' });
	if (!style) throw fail('This bot has no published style to evolve from');
	return { bot, style };
}
async function evolutionOf(db, id) {
	const doc = await db.collection(EVOLUTIONS).findOne({ _id: id });
	if (!doc) throw fail('Unknown proposal', 404);
	return doc;
}
const step = (doc, status, by, now, extra = {}) => ({
	$set: { status, updatedAt: now, ...extra },
	$push: { history: { status, at: now, by } }
});
const need = (doc, ...states) => {
	if (!states.includes(doc.status))
		throw fail(`This proposal is ${doc.status}; it must be ${states.join(' or ')} first`, 409);
};

/**
 * @param owner the signed-in owner (checked again here)
 * @param body { action, botId?, findingId?, id?, decision?, note? }
 * @param deps { findings(botId) → current findings; simulate?(base, candidate) → comparison }
 */
export async function evolve(db, owner, body, deps, now = Date.now()) {
	if (owner?.role !== 'owner' || owner.status === 'suspended')
		throw fail('Only owners change bots', 403);
	const by = String(owner._id);
	if (body.action === 'observe') {
		const { style } = await current(db, body.botId);
		const found = (await deps.findings(body.botId)).find((f) => f.id === body.findingId);
		if (!found) throw fail('That finding is not present any more');
		const open = await db
			.collection(EVOLUTIONS)
			.findOne({
				botId: body.botId,
				'finding.id': found.id,
				status: { $nin: ['published', 'rejected'] }
			});
		if (open) throw fail('This finding already has an open proposal', 409);
		const id = `${body.botId}:${found.id}:${now}`;
		await db
			.collection(EVOLUTIONS)
			.insertOne({
				_id: id,
				botId: body.botId,
				baseStyleId: style._id,
				status: 'observed',
				finding: {
					id: found.id,
					title: found.title,
					evidence: found.evidence,
					why: found.why,
					suggestion: found.suggestion
				},
				createdAt: now,
				updatedAt: now,
				createdBy: by,
				history: [{ status: 'observed', at: now, by }]
			});
		return { id };
	}
	const doc = await evolutionOf(db, body.id);
	const base = await db.collection('bot_styles').findOne({ _id: doc.baseStyleId });
	if (body.action === 'propose') {
		need(doc, 'observed');
		const change = proposeChange(base, doc.finding.suggestion);
		if (!change) throw fail('The suggested change has no effect on this style');
		await manageBot(db, owner, {
			action: 'draft',
			botId: doc.botId,
			config: {
				...base,
				tendencies: change.tendencies,
				...(change.memory ? { memory: change.memory } : {}),
				source: 'manual',
				notes: `Proposed from finding: ${doc.finding.title}.`
			}
		});
		const bot = await db.collection('bots').findOne({ _id: doc.botId });
		await db
			.collection(EVOLUTIONS)
			.updateOne(
				{ _id: doc._id },
				step(doc, 'proposed', by, now, {
					draftStyleId: `${doc.botId}@${bot.nextVersion}`,
					changes: change.changes
				})
			);
	} else if (body.action === 'simulate') {
		need(doc, 'proposed', 'simulated');
		const draft = await db.collection('bot_styles').findOne({ _id: doc.draftStyleId });
		const comparison = (deps.simulate ?? compareStyles)(base.tendencies, draft.tendencies, {
			hands: Math.min(120, Math.max(20, Number(body.hands) || 80)),
			seed: 1
		});
		await db
			.collection(EVOLUTIONS)
			.updateOne({ _id: doc._id }, step(doc, 'simulated', by, now, { comparison }));
	} else if (body.action === 'validate') {
		need(doc, 'simulated', 'validated');
		await manageBot(db, owner, { action: 'validate', botId: doc.botId, styleId: doc.draftStyleId });
		const draft = await db.collection('bot_styles').findOne({ _id: doc.draftStyleId });
		if (!draft.validation?.passed)
			throw fail(
				`Validation failed: ${(draft.validation?.errors ?? []).join('; ') || 'see the draft'}`
			);
		await db.collection(EVOLUTIONS).updateOne({ _id: doc._id }, step(doc, 'validated', by, now));
	} else if (body.action === 'review') {
		need(doc, 'validated');
		if (!['approve', 'reject'].includes(body.decision)) throw fail('Approve or reject');
		const note = String(body.note ?? '').trim();
		if (note.length < 5 || note.length > 400)
			throw fail('Say why, in a few words: it becomes the reason shown in the bot’s history');
		if (
			body.decision === 'approve' &&
			doc.comparison?.regressions?.length &&
			body.acceptRegressions !== true
		)
			throw fail(
				`The simulation found it easier to exploit with: ${doc.comparison.regressions.join(', ')}. Acknowledge to approve anyway.`,
				409
			);
		await db
			.collection(EVOLUTIONS)
			.updateOne(
				{ _id: doc._id },
				step(doc, body.decision === 'approve' ? 'approved' : 'rejected', by, now, {
					review: { by, at: now, decision: body.decision, note }
				})
			);
	} else if (body.action === 'publish') {
		need(doc, 'approved');
		await manageBot(db, owner, { action: 'publish', botId: doc.botId, styleId: doc.draftStyleId });
		await db
			.collection(EVOLUTIONS)
			.updateOne({ _id: doc._id }, step(doc, 'published', by, now, { publishedAt: now }));
	} else throw fail('Unknown evolution action');
	return { id: doc._id };
}

export async function listEvolutions(db, botId = null) {
	return db
		.collection(EVOLUTIONS)
		.find(botId ? { botId } : {})
		.sort({ createdAt: -1 })
		.limit(100)
		.toArray();
}
