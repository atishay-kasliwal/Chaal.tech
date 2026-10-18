/**
 * A table driven exactly the way the room Durable Object drives one (server/cloudflare/
 * room-object.mjs): transition with a recorded context, seal patch, commit, recorder, outbox.
 * Lets recorder tests cover every game without Cloudflare.
 */
import { newRoom, transition, playing, projection } from '../../../server/engine.mjs';
import { createGameRoom } from '../../../server/games/index.mjs';
import { nextBotMove } from '../../../server/bots/runner.mjs';
import { recordCommitSafely, stepRecorder, botRandom, finishCapture } from '../../../server/analytics/recorder.mjs';

/** Small seeded PRNG (mulberry32) so every test hand is reproducible. */
export function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffled(cards, random) {
	const deck = structuredClone(cards);
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return deck;
}

export class TableSim {
	constructor({ seed = 1, turnMs = 30000, engine = 'test-build' } = {}) {
		this.random = seeded(seed);
		this.turnMs = turnMs;
		this.engine = engine;
		this.now = 1_700_000_000_000;
		this.room = null;
		this.state = null;
		this.rows = [];
		this.connected = new Set();
		this.failures = [];
		/** Every commit: revision, action and the live balance changes, for completeness checks. */
		this.log = [];
	}

	/** Change the stored table outside recording (history from before the recorder existed). */
	patchRoom(change) {
		change(this.room);
	}

	tick(ms = 1000) {
		this.now += ms;
	}

	randomInt = (minOrMax, maybeMax) => {
		const min = maybeMax === undefined ? 0 : minOrMax;
		const max = maybeMax === undefined ? minOrMax : maybeMax;
		return min + Math.floor(this.random() * (max - min));
	};

	commit(after, step) {
		const afterJson = JSON.stringify(after);
		const out = recordCommitSafely(this.state, {
			before: this.room,
			after,
			afterJson,
			step,
			now: this.now,
			engine: this.engine
		});
		if (out.error) this.failures.push(out.error);
		this.state = out.state;
		this.rows.push(...out.rows);
		const chips = {};
		for (const p of after.players) {
			const old = this.room?.players.find((candidate) => candidate.id === p.id);
			if (old && p.balance !== old.balance) chips[p.id] = p.balance - old.balance;
		}
		this.log.push({ rev: after.revision, action: step.action, handId: after.handId, chips });
		this.room = JSON.parse(afterJson);
		return this.room;
	}

	create({ gameType = 'teen-patti', table = 1000, rulesVersion = 'classic-1', options, host = 'a' } = {}) {
		const room =
			gameType === 'teen-patti'
				? newRoom('sim-room', table, host, rulesVersion, options)
				: createGameRoom(gameType, 'sim-room', table, host);
		room.revision = 1;
		return this.commit(room, { actor: host, action: 'create', payload: {}, ctx: {}, kind: 'player' });
	}

	ctx(extra = {}) {
		return {
			now: this.now,
			turnMs: this.turnMs,
			connected: new Set(this.connected),
			lineup: [],
			lineupHands: 1,
			randomInt: this.randomInt,
			...extra
		};
	}

	act(actor, action, payload = {}, { ctx = {}, kind = 'player', cause, seal, bot } = {}) {
		const recorder = stepRecorder(this.ctx(ctx));
		const after = transition(this.room, actor, action, payload, recorder.ctx);
		let sealPatch;
		if (seal && after.cut && !after.seal) {
			after.seal = seal;
			sealPatch = seal;
		}
		return this.commit(
			after,
			recorder.step(actor, action, payload, {
				kind,
				...(cause ? { cause } : {}),
				...(bot ? { bot } : {}),
				...(sealPatch ? { seal: sealPatch } : {})
			})
		);
	}

	/** The bot runner's move, with its random draws logged, as the room's alarm does. */
	botMove() {
		const rng = botRandom(() => Math.floor(this.random() * 0x1_0000_0000));
		const move = nextBotMove(this.room, this.connected, rng.random, undefined, this.memoryFor);
		if (!move) return null;
		this.act(move.botId, move.action, move.payload, {
			kind: 'bot',
			bot: { seed: rng.seed, draws: rng.draws, reason: move.reason, ...(move.adaptive ? { memory: move.memory, adaptive: move.adaptive } : {}) }
		});
		return move;
	}

	/** The step just recorded (still in progress or in the newest capture). */
	lastStepRef() {
		if (this.state?.hand?.steps?.length) return this.state.hand.steps.at(-1);
		const capture = [...this.rows].reverse().find((row) => row.payload.type === 'capture');
		return capture?.payload.hand.steps.at(-1) ?? null;
	}

	timeout() {
		this.now = Math.max(this.now, this.room.deadline ?? this.now);
		return this.act(this.room.currentPlayerId, 'timeout', {}, { kind: 'system', cause: 'timeout' });
	}

	hostRecovery(nextHost) {
		const before = this.room;
		const after = { ...before, hostId: nextHost, revision: before.revision + 1 };
		return this.commit(after, {
			actor: before.hostId,
			action: 'hostRecovery',
			payload: { hostId: nextHost },
			ctx: {},
			kind: 'system',
			cause: 'host-recovery'
		});
	}

	view(id) {
		return projection(this.room, id, this.connected);
	}

	playing() {
		return playing(this.room);
	}

	captures() {
		return this.rows.filter((row) => row.payload.type === 'capture').map((row) => row.payload);
	}

	finished() {
		return this.captures().map(finishCapture);
	}
}
