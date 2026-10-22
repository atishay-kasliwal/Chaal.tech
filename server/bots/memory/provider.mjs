/** Strict, seat-bound MemoryProvider. Policy sees only a frozen value, never this database. */
import { canonicalJson, fingerprint64 } from '../../analytics/hash.mjs';
import { MEMORY_VERSION, contextId } from './observations.mjs';
import { playerModel, relationship } from './model.mjs';
import { MEMORY_COLLECTION, memoryReady } from './store.mjs';

const freeze = (v) => {
	if (v && typeof v === 'object') {
		Object.values(v).forEach(freeze);
		Object.freeze(v);
	}
	return v;
};
export const snapshotHash = (s) =>
	fingerprint64(canonicalJson(Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'id'))));
function seal(snapshot) {
	snapshot.id = snapshotHash(snapshot);
	return freeze(snapshot);
}

/** Pluggable retrieval contract: implementations get only observer-scoped episode metadata.
 * Structured matching is exact for player/game/tag/time; no semantic search infrastructure. */
export class EpisodicMemoryProvider {
	findRelevantEpisodes() {
		throw new Error('Implement observer-scoped retrieval');
	}
}
export class StructuredEpisodicMemoryProvider extends EpisodicMemoryProvider {
	#episodes;
	constructor(episodes) {
		super();
		this.#episodes = structuredClone(episodes);
	}
	findRelevantEpisodes({ playerIds, before, limit = 6, tags = [] }) {
		return this.#episodes
			.filter(
				(e) =>
					playerIds.includes(e.playerId) &&
					e.at < before &&
					(!tags.length || tags.some((t) => e.tags.includes(t)))
			)
			.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id))
			.slice(0, Math.min(6, Math.max(0, limit)))
			.map((e) => structuredClone(e));
	}
}

export class MemoryProvider {
	#scope;
	#memory;
	#episodes;
	constructor(scope, memory, episodic = null) {
		this.#scope = freeze(structuredClone(scope));
		if (!scope.botId || !Array.isArray(scope.playerIds) || !Number.isFinite(scope.asOf))
			throw new Error('Invalid memory scope');
		if (
			memory &&
			(memory.botId !== scope.botId ||
				memory.game !== scope.game ||
				memory.variant !== scope.variant ||
				memory.schema !== MEMORY_VERSION ||
				memory.through >= scope.asOf)
		)
			throw new Error('Memory observer/context/time boundary violated');
		this.#memory = memory ? structuredClone(memory) : null;
		this.#episodes = episodic ?? new StructuredEpisodicMemoryProvider(memory?.episodes ?? []);
	}
	#model(playerId) {
		if (typeof playerId !== 'string' || !this.#scope.playerIds.includes(playerId))
			throw new Error('Player outside observer scope');
		return this.#memory?.models.find((m) => m.playerId === playerId);
	}
	getPlayerModel(playerId) {
		const m = this.#model(playerId);
		return m ? freeze(playerModel(m, this.#scope.asOf)) : null;
	}
	getRelationship(playerId) {
		const m = this.#model(playerId);
		return m
			? freeze(relationship(m, this.#scope.game, this.#scope.variant, this.#scope.asOf))
			: null;
	}
	getRecentObservations(playerId) {
		return freeze(
			structuredClone((this.#model(playerId)?.recent ?? []).filter((r) => r.at < this.#scope.asOf))
		);
	}
	findRelevantEpisodes(playerId) {
		this.#model(playerId);
		// Re-check a future backend's results at this boundary as well.
		const allowed = new Map((this.#memory?.episodes ?? []).map((e) => [e.id, e]));
		return freeze(
			this.#episodes
				.findRelevantEpisodes({ playerIds: [playerId], before: this.#scope.asOf, limit: 4 })
				.filter(
					(e) =>
						allowed.has(e.id) &&
						allowed.get(e.id).playerId === playerId &&
						allowed.get(e.id).at < this.#scope.asOf
				)
				.slice(0, 4)
				.map((e) => structuredClone(allowed.get(e.id)))
		);
	}
	getSessionContext() {
		return freeze({
			nightId: this.#scope.nightId,
			recentHands: structuredClone(
				(this.#memory?.recent ?? [])
					.filter((r) => r.nightId === this.#scope.nightId && r.at < this.#scope.asOf)
					.slice(-6)
			),
			working: structuredClone(this.#scope.working ?? { actions: [] })
		});
	}
	freeze(metrics = {}) {
		const models = this.#scope.playerIds.map((p) => this.getPlayerModel(p)).filter(Boolean);
		const episodeStarted = performance.now();
		const episodes = this.#scope.playerIds
			.flatMap((p) => this.findRelevantEpisodes(p))
			.slice(0, 12);
		metrics.episodeMs = performance.now() - episodeStarted;
		return seal({
			schema: MEMORY_VERSION,
			botId: this.#scope.botId,
			game: this.#scope.game,
			variant: this.#scope.variant,
			handId: this.#scope.handId,
			asOf: this.#scope.asOf,
			status: this.#memory ? 'available' : 'empty',
			revision: this.#memory?.revision ?? 0,
			through: this.#memory?.through ?? 0,
			models,
			episodes,
			session: this.getSessionContext()
		});
	}
}
export function unavailableMemory(scope, reason = 'lookup-failed') {
	return seal({
		schema: MEMORY_VERSION,
		botId: scope.botId,
		game: scope.game,
		variant: scope.variant,
		handId: scope.handId,
		asOf: scope.asOf,
		status: 'unavailable',
		reason,
		revision: null,
		through: null,
		models: [],
		episodes: [],
		session: { nightId: scope.nightId, recentHands: [], working: { actions: [] } }
	});
}

/** One indexed read; no historical, private, sealed, admin or other bot collection access. */
export async function loadMemory(db, scope, metrics = {}) {
	const memory = await db
		.collection(MEMORY_COLLECTION)
		.findOne({ _id: contextId(scope.botId, scope.game, scope.variant) });
	if (!memory && !(await memoryReady(db))) throw new Error('memory-not-migrated');
	return new MemoryProvider(scope, memory).freeze(metrics);
}

export async function timedMemory(load, scope, timeoutMs = 180) {
	const started = performance.now();
	let timer;
	try {
		const snapshot = await Promise.race([
			load(),
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error('lookup-timeout')), timeoutMs);
			})
		]);
		return { snapshot, lookupMs: performance.now() - started };
	} catch (error) {
		return {
			snapshot: unavailableMemory(
				scope,
				error.message === 'lookup-timeout' ? 'lookup-timeout' : 'lookup-failed'
			),
			lookupMs: performance.now() - started
		};
	} finally {
		clearTimeout(timer);
	}
}

/** Runtime adapter uses only an already-filtered seat projection plus past public commands.
 * No decision trace, random draws, decks, cards or unpublished style is copied from a step. */
export function decisionScope(view, seatId, botId, recorder, asOf) {
	const subject = (id) => {
		const u = view.usersList.find((u) => u.id === id);
		return u?.botId ? `bot:${u.botId}` : u?.id;
	};
	const hand = recorder?.hand;
	const mine = view.usersList.find((u) => u.id === seatId);
	const actions =
		hand?.handId === view.handId
			? (hand.steps ?? [])
					.filter((s) => s.t < asOf && ['bet', 'pack', 'see', 'show', 'timeout'].includes(s.action))
					.slice(-24)
					.map((s, i) => ({
						playerId: subject(s.actor),
						action: s.action,
						at: s.t,
						i,
						...(s.action === 'bet' && typeof s.payload?.amount === 'number'
							? { amount: s.payload.amount }
							: {}),
						automatic: s.kind === 'system'
					}))
					.filter((s) => !!s.playerId)
			: [];
	return {
		botId,
		game: view.gameType ?? 'teen-patti',
		variant: view.rulesVersion ?? null,
		handId: view.handId,
		nightId: recorder?.night?.id ?? null,
		asOf,
		playerIds: view.usersList
			.filter((u) => u.id !== seatId && u.cardsInHand?.length)
			.map((u) => subject(u.id)),
		working: { actions, ownBlind: !!mine?.isBlind }
	};
}
