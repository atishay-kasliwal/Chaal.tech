/**
 * Frozen character versions (Phase 3, BOT_BRAIN.md §29): styles @2 (tp-dna@2) and @3
 * (tp-dna@3, with minds) must decide exactly as when Phase 2 was approved. This hashes every
 * decision (action, payload, reason, trace, random draws) and, for mind-keeping styles, every mind
 * after every hand, at seeded tables of all five characters across the variants. Compared in
 * tests/server/bot-legacy-golden.test.mjs.
 *
 *   node tests/helpers/character-golden.mjs 3   prints the current digest for @3
 */
import { createHash } from 'node:crypto';
import { freshDeck } from '../../server/classic.mjs';
import { getVariant } from '../../server/variants/index.mjs';
import { newRoom, transition, playing } from '../../server/engine.mjs';
import { nextBotMove, updateMinds, botSeatPayload } from '../../server/bots/runner.mjs';
import { CAST } from '../../src/lib/bots/cast.js';

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
const VARIANTS = ['classic-1', 'muflis-1', 'joker-1', 'discard-one-1', 'pot-blind-1'];

export function characterGolden(version, { hands = 30, seeds = 3 } = {}) {
	const digest = createHash('sha256');
	let decisions = 0;
	for (const rulesVersion of VARIANTS) {
		const variant = getVariant(rulesVersion);
		for (let seed = 1; seed <= seeds; seed++) {
			const random = rng(seed * 7919 + rulesVersion.length * version);
			let room = newRoom('golden-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
			room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
			CAST.forEach(({ id, name }, i) => {
				room = transition(
					room,
					'host',
					'addBot',
					botSeatPayload(room, id, `bot-gold-${i}`, null, `${id}@${version}`),
					ctx
				);
			});
			room = transition(room, 'host', 'leave', {}, ctx);
			let minds = updateMinds({}, null, room);
			const commit = (next) => {
				minds = updateMinds(minds, room, next);
				room = next;
			};
			for (let h = 0; h < hands; h++) {
				const dealer = room.players.find((p) => p.bot && !p.departed).id;
				const deck = freshDeck();
				for (let i = deck.length - 1; i > 0; i--) {
					const j = Math.floor(random() * (i + 1));
					[deck[i], deck[j]] = [deck[j], deck[i]];
				}
				commit(
					transition(
						{ ...room, hostId: dealer },
						dealer,
						'start',
						{ cutAt: 0, cardsToDeal: variant.cardsPerPlayer ?? 3, rulesVersion },
						{ ...ctx, deck, handId: `g${version}-${seed}-${h}`, requireReady: true }
					)
				);
				let steps = 0;
				while (playing(room) && steps++ < 5000) {
					let draws = 0;
					const counted = () => (draws++, random());
					const move = nextBotMove(room, ctx.connected, counted, { minds });
					digest.update(JSON.stringify([rulesVersion, move, draws]));
					decisions++;
					commit(transition(room, move.botId, move.action, move.payload, ctx));
				}
				digest.update(JSON.stringify(minds));
			}
		}
	}
	return { decisions, digest: digest.digest('hex') };
}

if (import.meta.url === `file://${process.argv[1]}`)
	console.log(characterGolden(Number(process.argv[2] ?? 3)));
