/**
 * The legacy bot policy (tp-heuristic@1) must never change. This drives seeded bot-only tables in
 * every variant through the runner and hashes every decision (action, payload, reason and the
 * number of random draws it used). The hash was recorded before the character policy existed;
 * tests/server/bot-legacy-golden.test.mjs compares against it.
 *
 *   node tests/helpers/legacy-bot-golden.mjs   prints the current digest
 */
import { createHash } from 'node:crypto';
import { freshDeck } from '../../server/classic.mjs';
import { listVariants, getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, playing } from '../../server/engine.mjs';
import { nextBotMove } from '../../server/bots/runner.mjs';

function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const ctx = { now: 1000, turnMs: 60000, connected: new Set() };
const LEVELS = ['easy', 'normal', 'hard'];

export function legacyGolden({ hands = 12, seeds = 4 } = {}) {
	const digest = createHash('sha256');
	let decisions = 0;
	for (const { rulesVersion } of listVariants()) {
		const variant = getVariant(rulesVersion);
		for (let seed = 1; seed <= seeds; seed++) {
			const random = rng(seed * 7919 + rulesVersion.length);
			const seats = 2 + (seed % 4);
			let room = newRoom('golden-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
			room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
			for (let i = 0; i < seats; i++)
				room = transition(
					room,
					'host',
					'addBot',
					{ botId: `bot-gold-${i}`, name: `G${i}`, level: LEVELS[(i + seed) % 3] },
					ctx
				);
			room = transition(room, 'host', 'leave', {}, ctx);
			for (let h = 0; h < hands; h++) {
				const dealer = room.players.find((p) => p.bot && !p.departed).id;
				const deck = freshDeck();
				for (let i = deck.length - 1; i > 0; i--) {
					const j = Math.floor(random() * (i + 1));
					[deck[i], deck[j]] = [deck[j], deck[i]];
				}
				room = transition(
					{ ...room, hostId: dealer },
					dealer,
					'start',
					{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
					{ ...ctx, deck, handId: `g${seed}-${h}`, requireReady: true }
				);
				let steps = 0;
				while (playing(room) && steps++ < 400) {
					let draws = 0;
					const counted = () => (draws++, random());
					const move = nextBotMove(room, ctx.connected, counted);
					digest.update(
						JSON.stringify([
							rulesVersion,
							move.botId,
							move.action,
							move.payload,
							move.reason,
							draws
						])
					);
					decisions++;
					room = transition(room, move.botId, move.action, move.payload, ctx);
				}
			}
		}
	}
	return { decisions, digest: digest.digest('hex') };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(legacyGolden());
