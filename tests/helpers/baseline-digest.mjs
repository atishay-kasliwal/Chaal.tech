/**
 * Decision digests that pin the Phase 3.1 baseline (docs/bots/CANONICAL.md): every decision, trace,
 * random draw and mind of the DNA line on fixed seeds, and every decision of main's own live bot
 * styles. Recorded 2026-10-21; identical before and after the DNA line was merged onto main.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runTable } from '../../server/sim/table.mjs';
import { versioned, CHARACTER_IDS } from '../../server/sim/population.mjs';
import { candidateStyle } from '../../server/sim/candidates.mjs';
import { newRoom, transition, playing } from '../../server/engine.mjs';
import { nextBotMove } from '../../server/bots/runner.mjs';
import { freshDeck } from '../../server/classic.mjs';
import { CHARACTER_SEEDS } from '../../server/bots/characters.mjs';
import { runtimeStyle, characterHash } from '../../server/bots/config.mjs';
import { ADAPTIVE_POLICY, defaultMemory } from '../../server/bots/memory/adaptive.mjs';
import { FOCUS, LINE_WEIGHT } from '../../server/bots/v3.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const FINALS = {
	'rohit-sharma': 'rohit-sharma@4-c026',
	'virat-kohli': 'virat-kohli@4-c024',
	gg: 'gg@4-c034',
	'samay-raina': 'samay-raina@4-c008',
	'ms-dhoni': 'ms-dhoni@4-c039'
};

/** DNA v1, v2, v3 and the five Phase 3 finals (incl. c034), plus a mixed table with legacy bots. */
export function dnaLineDigest() {
	const finals = read('docs/bots/phase3/finals-51.json');
	const league = read('docs/bots/phase3/league-41.json');
	const cands = CHARACTER_IDS.map((c) => {
		const style = candidateStyle(c, finals[c], {
			id: FINALS[c],
			parent: league.candidates[FINALS[c]].parent,
			generation: league.candidates[FINALS[c]].generation
		});
		return { id: style._id, style };
	});
	const tables = [];
	let decisions = 0;
	for (const [label, seats] of [
		['v1', versioned(1)],
		['v2', versioned(2)],
		['v3', versioned(3)],
		['v4', cands],
		['mix', ['legacy-hard', 'gg@3', cands[2], 'ms-dhoni@3', 'legacy-easy']]
	])
		for (let t = 1; t <= 3; t++) {
			const hands = runTable({ seed: 7, table: t, seats, hands: 60, traces: true, matched: true });
			tables.push({
				label,
				t,
				hands: hands.map((h) => ({
					h: h.h,
					d: h.decisions.map((d) => [d.seat, d.name, d.reason, d.draws, d.move?.trace ?? null]),
					minds: h.minds ?? null,
					nets: h.seats.map((s) => s.net)
				}))
			});
			decisions += hands.reduce((s, h) => s + h.decisions.length, 0);
		}
	return { digest: sha(JSON.stringify(JSON.parse(JSON.stringify(tables)))), decisions };
}

const sfc = (seed) => {
	let a = seed >>> 0,
		b = 0x9e3779b9,
		c = 0x85ebca6b,
		d = 0xc2b2ae35;
	return () => {
		const t = (a + b + d++) >>> 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) >>> 0;
		c = (((c << 21) | (c >>> 11)) + t) >>> 0;
		return (t >>> 0) / 4294967296;
	};
};

/** main's five tp-character@1 seed styles, their tp-adaptive@1 v3 versions, and a legacy bot. */
export function mainLineDigest() {
	const ctx = { now: 1, turnMs: 1e12 };
	const v1 = CHARACTER_SEEDS.map((s) => ({ ...runtimeStyle(s.style), status: 'published' }));
	const v3 = v1.map((s) => {
		const c = {
			...s,
			version: 2,
			_id: `${s.botId}@2`,
			policy: ADAPTIVE_POLICY,
			tendencies: { ...s.tendencies, blindMatch: 1 },
			memory: { ...defaultMemory(s.tendencies), lineWeight: LINE_WEIGHT, focus: FOCUS[s.botId] }
		};
		return { ...c, configHash: characterHash(c) };
	});
	const res = [];
	for (const [label, styles] of [
		['seed-v1', v1],
		['adaptive-v3', v3]
	])
		for (let table = 1; table <= 4; table++) {
			let room = newRoom('eq-room', 1000, 'host', 'classic-1', { boot: 10, autoReady: true });
			room = transition(room, 'host', 'join', { username: 'Host' }, ctx);
			styles.slice(0, 4).forEach((style, i) => {
				room = transition(
					room,
					'host',
					'addBot',
					{ botId: `bot-eq-${i}`, name: style.botId.slice(0, 20), level: 'normal', style },
					ctx
				);
			});
			room = transition(
				room,
				'host',
				'addBot',
				{ botId: 'bot-eq-legacy', name: 'raju', level: 'hard' },
				ctx
			);
			room = transition(room, 'host', 'leave', {}, ctx);
			const rnd = sfc(table * 7919);
			for (let h = 0; h < 40; h++) {
				const deck = freshDeck();
				for (let i = deck.length - 1; i > 0; i--) {
					const j = Math.floor(rnd() * (i + 1));
					[deck[i], deck[j]] = [deck[j], deck[i]];
				}
				const dealer = room.players.find((p) => p.bot && !p.departed).id;
				room = transition(
					{ ...room, hostId: dealer },
					dealer,
					'start',
					{ cutAt: 0, cardsToDeal: 3, rulesVersion: 'classic-1' },
					{ ...ctx, deck, handId: `eq-${table}-${h}`, requireReady: true, connected: new Set() }
				);
				let step = 0;
				while (playing(room) && step++ < 400) {
					const move = nextBotMove(room, new Set(), sfc(table * 1000003 + h * 1009 + step), {});
					res.push([
						label,
						table,
						h,
						move.botId,
						move.action,
						JSON.stringify(move.payload ?? {}),
						move.reason ?? null,
						JSON.stringify(move.adaptive ?? null)
					]);
					room = transition(room, move.botId, move.action, move.payload, {
						...ctx,
						connected: new Set()
					});
				}
			}
		}
	return { digest: sha(JSON.stringify(res)), decisions: res.length };
}
