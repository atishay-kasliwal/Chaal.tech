/**
 * Moment memory: what a bot remembers about specific moments with a specific person, recalled by
 * similarity. No model, no embeddings and no text generation: a moment is a fixed-length numeric
 * fingerprint of a PUBLIC situation (pot size, who was blind, what the person did, how it ended), and
 * "similar" is plain cosine distance between fingerprints. That is a real vector index with real
 * semantic-style recall ("a moment like this one") and nothing learned or invented.
 *
 * Only public, observer-filtered facts go in (the same observation the statistical memory uses), never
 * cards. Recall feeds table talk and reactions; it never changes a move, so hands stay exactly
 * replayable.
 *
 * Backends behind one small interface: MemoryMomentIndex (tests), MongoMomentIndex (MongoDB Atlas
 * $vectorSearch when its index exists, exact search otherwise) and PineconeMomentIndex (REST, namespace
 * per bot). Changing backend never changes behaviour, only where the vectors live.
 */
export const MOMENTS = 'bot_moments';
export const MOMENT_INDEX = 'bot_moments_vec';
export const DIMENSIONS = 16;
const DAY = 86_400_000;
const clamp01 = (x) => Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
const PRIORITY = ['raise', 'show', 'call', 'see', 'fold', 'check'];

/** The fixed fingerprint of one public decision and how its hand ended, from the bot's side. */
export function fingerprint(decision, { handNo = 1, outcome = 'unknown' } = {}) {
	const action = (name) => (decision.action === name ? 1 : 0);
	const v = [
		clamp01((decision.potUnits ?? 0) / 100),
		clamp01((decision.stakeMultiple ?? 0) / 4),
		decision.facing === 'raise' ? 1 : 0,
		decision.blind === true ? 1 : 0,
		clamp01((decision.live?.length ?? 1) / 5),
		action('raise'),
		action('call'),
		action('fold'),
		action('show'),
		action('see'),
		outcome === 'won' ? 1 : outcome === 'lost' ? 0 : 0.5,
		(decision.potUnits ?? 0) >= 20 ? 1 : 0,
		(decision.stackUnits ?? 99) < 20 ? 1 : 0,
		clamp01(decision.relOrder ?? 0.5),
		clamp01(handNo / 20),
		decision.largeRaise ? 1 : 0
	];
	const norm = Math.hypot(...v) || 1;
	return v.map((x) => Math.round((x / norm) * 1e6) / 1e6);
}
export const cosine = (a, b) =>
	a.reduce((s, x, i) => s + x * b[i], 0) / (Math.hypot(...a) * Math.hypot(...b) || 1);

/** What kind of moment it was, in the bot's terms (for table talk and for reading history back). */
export function momentKind(decision, outcome) {
	if (outcome === 'lost' && decision.action === 'raise') return 'they-pushed-and-won';
	if (outcome === 'won' && decision.action === 'raise') return 'they-pushed-and-lost';
	if (decision.action === 'fold' && decision.facing === 'raise') return 'they-packed-to-me';
	if (decision.action === 'show') return 'show';
	return outcome === 'lost' ? 'i-lost-to-them' : outcome === 'won' ? 'i-beat-them' : 'played';
}

/**
 * Moments from one bot's observation of a hand: one per opponent that finished it, built from their
 * most decisive public action. `outcome` is from the BOT's side.
 */
export function momentsFrom(observation) {
	const out = [];
	for (const peer of observation.peers) {
		if (peer.kind !== 'human' || !peer.decisions.length) continue;
		const betting = peer.decisions.filter((d) => d.betting);
		const key = [...betting].sort(
			(a, b) => PRIORITY.indexOf(a.action) - PRIORITY.indexOf(b.action)
		)[0];
		if (!key) continue;
		const net = peer.result?.netBetween ?? 0;
		// netBetween is what the bot received from this person: positive means the bot won chips from them.
		const outcome = !peer.result ? 'unknown' : net > 0 ? 'won' : net < 0 ? 'lost' : 'unknown';
		out.push({
			_id: `${observation.handId}:${observation.botId}:${peer.playerId}`,
			botId: observation.botId,
			playerId: peer.playerId,
			handId: observation.handId,
			nightId: observation.nightId,
			game: observation.game,
			at: observation.at,
			kind: momentKind(key, outcome),
			outcome,
			units: Math.round(net * 10) / 10,
			vec: fingerprint(key, { handNo: observation.handNo, outcome })
		});
	}
	return out;
}

/* --------------------------------------------- backends --------------------------------------------- */

export class MemoryMomentIndex {
	docs = new Map();
	async upsert(moments) {
		for (const m of moments) this.docs.set(m._id, structuredClone(m));
	}
	async query({ botId, playerId, vec, limit = 5 }) {
		return [...this.docs.values()]
			.filter((m) => m.botId === botId && m.playerId === playerId)
			.map((m) => ({ ...m, score: cosine(vec, m.vec) }))
			.sort((a, b) => b.score - a.score || b.at - a.at)
			.slice(0, limit);
	}
	async recent({ botId, playerId, limit = 12 }) {
		return [...this.docs.values()]
			.filter((m) => m.botId === botId && m.playerId === playerId)
			.sort((a, b) => b.at - a.at)
			.slice(0, limit);
	}
}

export class MongoMomentIndex {
	constructor(db, { atlas = true } = {}) {
		this.db = db;
		this.atlas = atlas;
	}
	async upsert(moments) {
		for (const m of moments)
			await this.db.collection(MOMENTS).replaceOne({ _id: m._id }, m, { upsert: true });
	}
	async query({ botId, playerId, vec, limit = 5 }) {
		if (this.atlas) {
			try {
				const rows = await this.db
					.collection(MOMENTS)
					.aggregate([
						{
							$vectorSearch: {
								index: MOMENT_INDEX,
								path: 'vec',
								queryVector: vec,
								numCandidates: 100,
								limit,
								filter: { botId, playerId }
							}
						},
						{ $addFields: { score: { $meta: 'vectorSearchScore' } } }
					])
					.toArray();
				return rows;
			} catch {
				this.atlas = false; // no vector index on this cluster yet: fall back to an exact search
			}
		}
		const recent = await this.db
			.collection(MOMENTS)
			.find({ botId, playerId })
			.sort({ at: -1 })
			.limit(400)
			.toArray();
		return recent
			.map((m) => ({ ...m, score: cosine(vec, m.vec) }))
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);
	}
	async recent({ botId, playerId, limit = 12 }) {
		return this.db
			.collection(MOMENTS)
			.find({ botId, playerId })
			.sort({ at: -1 })
			.limit(limit)
			.toArray();
	}
}

/** Pinecone over plain REST (no SDK): one namespace per bot, the person as a metadata filter. */
export class PineconeMomentIndex {
	constructor({ host, apiKey, fetcher = fetch }) {
		this.host = host.replace(/\/$/, '');
		this.apiKey = apiKey;
		this.fetch = fetcher;
	}
	async call(path, body) {
		const response = await this.fetch(`${this.host}${path}`, {
			method: 'POST',
			headers: {
				'Api-Key': this.apiKey,
				'Content-Type': 'application/json',
				'X-Pinecone-API-Version': '2024-07'
			},
			body: JSON.stringify(body)
		});
		if (!response.ok) throw new Error(`Pinecone ${path} ${response.status}`);
		return response.json();
	}
	async upsert(moments) {
		const byBot = Map.groupBy(moments, (m) => m.botId);
		for (const [botId, list] of byBot)
			await this.call('/vectors/upsert', {
				namespace: botId,
				vectors: list.map((m) => ({
					id: m._id,
					values: m.vec,
					metadata: {
						playerId: m.playerId,
						handId: m.handId,
						nightId: m.nightId,
						at: m.at,
						kind: m.kind,
						outcome: m.outcome,
						units: m.units
					}
				}))
			});
	}
	async query({ botId, playerId, vec, limit = 5 }) {
		const { matches = [] } = await this.call('/query', {
			namespace: botId,
			vector: vec,
			topK: limit,
			includeMetadata: true,
			filter: { playerId: { $eq: playerId } }
		});
		return matches.map((m) => ({ _id: m.id, botId, ...m.metadata, vec, score: m.score }));
	}
	async recent({ botId, playerId, limit = 12 }) {
		// Pinecone cannot sort by time; a broad similarity query on a neutral vector, then sort here.
		const rows = await this.query({
			botId,
			playerId,
			vec: Array(DIMENSIONS).fill(1 / Math.sqrt(DIMENSIONS)),
			limit: 50
		});
		return rows.sort((a, b) => b.at - a.at).slice(0, limit);
	}
}

let backend = null;
/** The Worker calls this with its environment: Pinecone when configured, otherwise MongoDB. */
export function useMomentBackend(env = {}) {
	backend =
		env.PINECONE_API_KEY && env.PINECONE_HOST
			? { type: 'pinecone', host: env.PINECONE_HOST, apiKey: env.PINECONE_API_KEY }
			: null;
}
export const momentIndexFor = (db) =>
	backend?.type === 'pinecone' ? new PineconeMomentIndex(backend) : new MongoMomentIndex(db);

/* ------------------------------------------- reading back ------------------------------------------- */

/**
 * How a bot remembers one person, as small public facts for table talk. A person's own history with a
 * bot, so it is theirs to see; never anything about anyone else.
 */
export async function recallRelationship(index, { botId, playerId, now = Date.now() }) {
	const recent = await index.recent({ botId, playerId, limit: 12 });
	if (!recent.length) return { moments: 0, mood: 'new', lastAt: null };
	const last = recent[0];
	const lost = recent.filter((m) => m.outcome === 'lost').length;
	const won = recent.filter((m) => m.outcome === 'won').length;
	const pushed = recent.filter(
		(m) => m.kind === 'they-pushed-and-won' || m.kind === 'they-pushed-and-lost'
	).length;
	const mood =
		pushed >= 3 ? 'pressure' : lost >= won + 2 ? 'rematch' : won >= lost + 2 ? 'revenge' : 'back';
	return {
		moments: recent.length,
		mood,
		lastAt: last.at,
		lastOutcome: last.outcome,
		daysSince: Math.floor((now - last.at) / DAY)
	};
}

/** Moments most like a given situation, for "this feels like last time". */
export async function recallSimilar(
	index,
	{ botId, playerId, decision, handNo, outcome, limit = 3 }
) {
	return index.query({ botId, playerId, vec: fingerprint(decision, { handNo, outcome }), limit });
}

/** Operator step: create the Atlas vector index once. Safe to repeat. */
export async function createAtlasIndex(db) {
	const collection = db.collection(MOMENTS);
	await db.createCollection(MOMENTS).catch(() => {});
	const existing = await collection
		.listSearchIndexes(MOMENT_INDEX)
		.toArray()
		.catch(() => []);
	if (existing.length) return { created: false, status: existing[0].status };
	await collection.createSearchIndex({
		name: MOMENT_INDEX,
		type: 'vectorSearch',
		definition: {
			fields: [
				{ type: 'vector', path: 'vec', numDimensions: DIMENSIONS, similarity: 'cosine' },
				{ type: 'filter', path: 'botId' },
				{ type: 'filter', path: 'playerId' }
			]
		}
	});
	await collection.createIndex({ botId: 1, playerId: 1, at: -1 });
	return { created: true };
}
