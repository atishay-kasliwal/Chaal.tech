/**
 * Add recorded hands to the replay corpus (tests/fixtures/replay-corpus.json.gz) for every game
 * and variant version this code implements that the corpus does not cover yet. Append-only:
 * existing hands are never regenerated, because they stand for hands already in production.
 *   npm run analytics:corpus
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { listVariants } from '../server/variants/index.mjs';
import { GAME_VERSIONS } from '../server/games/versions.mjs';
import {
	teenPattiTable,
	dealTeenPatti,
	playTeenPatti,
	holdemTable,
	playHoldem,
	blackjackTable,
	playBlackjack,
	rummyTable,
	playRummy
} from '../tests/server/helpers/drivers.mjs';

export const CORPUS = new URL('../tests/fixtures/replay-corpus.json.gz', import.meta.url);
export const corpusKey = (v) => `${v.game}@${v.gameVersion}|${v.rulesVersion ?? '-'}|${v.variant ? `${v.variant.id}@${v.variant.version}` : '-'}`;

export function readCorpus() {
	return existsSync(CORPUS) ? JSON.parse(gunzipSync(readFileSync(CORPUS)).toString('utf8')) : { hands: [] };
}

function sample(game, rulesVersion, seed) {
	if (game === 'teen-patti') {
		const sim = teenPattiTable({ seed, rulesVersion, bots: ['hard', 'easy'] });
		dealTeenPatti(sim, rulesVersion);
		playTeenPatti(sim, { packBias: 0.1 });
		return sim.captures();
	}
	if (game === 'texas-holdem') {
		const sim = holdemTable({ seed, players: ['a', 'b', 'c', 'd'], stacks: [1000, 300, 120, 700] });
		playHoldem(sim, { allInBias: 0.3 });
		return sim.captures();
	}
	if (game === 'blackjack') {
		const sim = blackjackTable({ seed, players: ['a', 'b', 'c'] });
		playBlackjack(sim, { timeoutBias: 0.2 });
		return sim.captures();
	}
	const sim = rummyTable({ seed });
	playRummy(sim, { turns: 10 });
	return sim.captures();
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const corpus = readCorpus();
	const covered = new Set(corpus.hands.map((h) => corpusKey(h.hand.versions)));
	const wanted = [
		...listVariants().map((v) => ['teen-patti', v.rulesVersion]),
		...Object.keys(GAME_VERSIONS).filter((g) => g !== 'teen-patti').map((g) => [g, null])
	];
	let added = 0;
	wanted.forEach(([game, rulesVersion], index) => {
		const [capture] = sample(game, rulesVersion, 4000 + index);
		const key = corpusKey(capture.hand.versions);
		if (covered.has(key)) return;
		corpus.hands.push({ addedAt: new Date().toISOString().slice(0, 10), ...capture });
		covered.add(key);
		added++;
	});
	writeFileSync(CORPUS, gzipSync(JSON.stringify(corpus)));
	console.log(`Replay corpus: ${corpus.hands.length} hands (${added} added).`);
}
