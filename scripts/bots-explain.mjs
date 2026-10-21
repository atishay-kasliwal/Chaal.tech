/**
 * Decision inspector for a real recorded hand (owner/developer only): reads the hand's sealed
 * record, replays it, and explains every bot decision from its stored trace (BOT_BRAIN.md §26,
 * phase 2). Traces carry the bot's own hand strength and mind: never show this to players.
 *
 *   node --env-file-if-exists=.env scripts/bots-explain.mjs <room:handId>
 *
 * For simulated hands use scripts/sim/explain.mjs instead.
 */
import { MongoClient } from 'mongodb';
import { COLLECTIONS, readSealed } from '../server/analytics/store.mjs';
import { replayHand } from '../server/analytics/recorder.mjs';
import { explainDecision } from '../server/sim/explain.mjs';

const id = process.argv[2];
const uri = process.env.MONGODB_URI;
if (!id || !uri) {
	console.error('Usage: MONGODB_URI=... node scripts/bots-explain.mjs <room:handId>');
	process.exit(1);
}
const client = new MongoClient(uri);
try {
	await client.connect();
	const db = client.db(process.env.MONGODB_DB || 'chaal');
	const doc = await db.collection(COLLECTIONS.sealed).findOne({ _id: id });
	if (!doc) throw new Error(`No sealed record ${id}`);
	const sealed = await readSealed(doc);
	const states = replayHand(sealed.preDeal, sealed.steps);
	const traces = sealed.botTrace ?? [];
	if (!traces.length) console.log('No bot decisions in this hand.');
	for (const t of traces) {
		const before = states[t.i];
		const actor = before.players.find((p) => p.id === t.p);
		const alive = before.players.filter(
			(p) => p.cards?.length && !p.isPacked && !p.departed
		).length;
		const decision = {
			name:
				t.chosen === 'bet' ? (t.params?.amount > before.maxStake ? 'raise' : 'chaal') : t.chosen,
			blind: actor?.isBlind,
			rounds: ((actor?.handBet ?? 0) / Math.max(before.boot ?? 1, 1)).toFixed(1),
			alive,
			facing: false,
			showOk: false
		};
		console.log(
			explainDecision({
				name: `${actor?.username ?? t.p} (${t.styleId ?? 'unknown style'}, ${t.verified})`,
				move: { reason: t.reason, trace: t.trace ?? { probs: t.probs } },
				decision
			})
		);
		console.log('');
	}
} finally {
	await client.close();
}
