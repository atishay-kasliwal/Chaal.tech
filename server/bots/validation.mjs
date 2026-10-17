/** Publication checks run off the live game loop, against human-visible projections. */
import { configErrors, characterHash } from './config.mjs';
import { newRoom, transition, projection, playing } from '../engine.mjs';
import { freshDeck } from '../classic.mjs';
import { decide, PROFILES } from './strategy.mjs';
import { canonicalJson } from '../analytics/hash.mjs';

function randomFor(seed) {
	let value = seed >>> 0;
	return () => {
		value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
		return value / 4294967296;
	};
}

function game(seed) {
	const random = randomFor(seed);
	let room = newRoom('style-validation', 1000, 'human', 'classic-1', { boot: 10, autoReady: true });
	room = transition(room, 'human', 'join', { username: 'Reference' });
	room = transition(room, 'human', 'addBot', {
		botId: 'bot-validation',
		name: 'Candidate',
		level: 'normal'
	});
	const deck = freshDeck();
	for (let i = deck.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[deck[i], deck[j]] = [deck[j], deck[i]];
	}
	return transition(
		room,
		'human',
		'start',
		{ cutAt: 0, cardsToDeal: 3, rulesVersion: 'classic-1' },
		{ now: 1, turnMs: 30000, deck, handId: `validation-${seed}`, connected: new Set(['human']) }
	);
}

/** Returns evidence, not a strength rating. No measured difficulty claim from tiny simulations. */
export function validateStyle(style, { hands = 24 } = {}) {
	const errors = configErrors(style);
	if (
		!/^[a-z][a-z0-9-]{1,47}$/.test(style?.botId ?? '') ||
		!Number.isSafeInteger(style?.version) ||
		style.version < 1 ||
		style._id !== `${style.botId}@${style.version}`
	)
		errors.push('Invalid historical identity');
	const report = {
		configHash: characterHash(style),
		schema: errors.length === 0,
		invariance: false,
		policy: style?.policy,
		simulation: { hands: 0, decisions: 0, actions: {}, reference: 'legacy-normal@1' },
		predictability: { status: 'not-measured' },
		errors,
		passed: false
	};
	if (errors.length) return report;
	try {
		let comparisons = 0;
		for (let seed = 1; seed <= hands; seed++) {
			let room = game(seed);
			const random = randomFor(seed + 6000);
			for (let step = 0; step < 120 && playing(room); step++) {
				const actor = room.currentPlayerId;
				const view = projection(room, actor, new Set(['human']));
				const moveSeed = Math.floor(random() * 4294967296);
				const profile = actor === 'bot-validation' ? style.tendencies : PROFILES.normal;
				const move = decide(view, actor, randomFor(moveSeed), profile);
				if (!move) throw new Error('Policy did not return a legal move');
				if (actor === 'bot-validation') {
					const changed = structuredClone(room);
					for (const opponent of changed.players.filter((p) => p.id !== actor))
						opponent.cards = opponent.cards.map((_, i) => ({ rank: 2 + i, suit: 'clubs' }));
					const other = decide(
						projection(changed, actor, new Set(['human'])),
						actor,
						randomFor(moveSeed),
						profile
					);
					if (canonicalJson(move) !== canonicalJson(other))
						throw new Error('Hidden-card invariance failed');
					comparisons++;
					report.simulation.decisions++;
					report.simulation.actions[move.action] =
						(report.simulation.actions[move.action] ?? 0) + 1;
				}
				room = transition(room, actor, move.action, move.payload, {
					now: step + 2,
					turnMs: 30000,
					connected: new Set(['human'])
				});
			}
			if (playing(room)) throw new Error('Simulation failed to complete');
			report.simulation.hands++;
		}
		report.invariance = comparisons > 0;
		report.passed = report.invariance && report.simulation.hands === hands;
	} catch (error) {
		errors.push(error.message);
	}
	return report;
}
