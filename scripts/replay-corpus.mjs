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
import { CHARACTER_SEEDS } from '../server/bots/characters.mjs';
import { runtimeStyle } from '../server/bots/config.mjs';
import { finishCapture } from '../server/analytics/recorder.mjs';
import {
	teenPattiTable,
	dealTeenPatti,
	playTeenPatti,
	holdemTable,
	playHoldem,
	blackjackTable,
	playBlackjack,
	rummyTable,
	playRummy,
	threeTwoFiveTable,
	playThreeTwoFive,
	tenPakadTable,
	playTenPakad,
	twentyNineTable,
	playTwentyNine
} from '../tests/server/helpers/drivers.mjs';

export const CORPUS = new URL('../tests/fixtures/replay-corpus.json.gz', import.meta.url);
export const corpusKey = (v) =>
	`${v.game}@${v.gameVersion}|${v.rulesVersion ?? '-'}|${v.variant ? `${v.variant.id}@${v.variant.version}` : '-'}`;

export function readCorpus() {
	return existsSync(CORPUS)
		? JSON.parse(gunzipSync(readFileSync(CORPUS)).toString('utf8'))
		: { hands: [] };
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
	if (game === 'three-two-five') {
		const sim = threeTwoFiveTable({ seed });
		playThreeTwoFive(sim);
		return sim.captures();
	}
	if (game === 'twenty-nine') {
		const sim = twentyNineTable({ seed });
		playTwentyNine(sim);
		return sim.captures();
	}
	if (game === 'ten-pakad') {
		const sim = tenPakadTable({ seed });
		playTenPakad(sim);
		return sim.captures();
	}
	const sim = rummyTable({ seed });
	playRummy(sim, { turns: 10 });
	return sim.captures();
}

export const characterCorpusKey = (capture) => {
	const fixture = capture.characterPolicy;
	return fixture
		? `${fixture.styleId}|${fixture.policy}|${corpusKey(capture.hand.versions)}`
		: null;
};

function characterSample(character, rulesVersion, seed) {
	for (let attempt = 0; attempt < 12; attempt++) {
		const sim = teenPattiTable({
			seed: seed + attempt,
			humans: ['a'],
			bots: ['normal'],
			rulesVersion
		});
		sim.act('a', 'addBot', {
			botId: 'bot-corpus-character',
			name: character.bot.name,
			level: 'normal',
			mascotId: character.bot.avatar.mascotId,
			style: { ...runtimeStyle(character.style), status: 'published' }
		});
		dealTeenPatti(sim, rulesVersion);
		playTeenPatti(sim, { packBias: 0.05 });
		const [capture] = sim.captures();
		const finished = finishCapture(capture);
		if (!finished.ok)
			throw new Error(`Character corpus replay failed: ${JSON.stringify(finished.failure)}`);
		if (!finished.records.sealed.botTrace.some((trace) => trace.botId === character.bot._id))
			continue;
		return {
			...capture,
			characterPolicy: { styleId: character.style._id, policy: character.style.policy }
		};
	}
	throw new Error(
		`Could not record a character decision for ${character.style._id}/${rulesVersion}`
	);
}

if (import.meta.url === `file://${process.argv[1]}`) {
	const corpus = readCorpus();
	const covered = new Set(corpus.hands.map((h) => corpusKey(h.hand.versions)));
	const wanted = [
		...listVariants().map((v) => ['teen-patti', v.rulesVersion]),
		...Object.keys(GAME_VERSIONS)
			.filter((g) => g !== 'teen-patti')
			.map((g) => [g, null])
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
	const characterCovered = new Set(corpus.hands.map(characterCorpusKey).filter(Boolean));
	for (const [index, variant] of listVariants().entries())
		for (const [botIndex, character] of CHARACTER_SEEDS.entries()) {
			const versionKey = `teen-patti@${GAME_VERSIONS['teen-patti']}|${variant.rulesVersion}|${variant.id}@${variant.version}`;
			const key = `${character.style._id}|${character.style.policy}|${versionKey}`;
			if (characterCovered.has(key)) continue;
			const capture = characterSample(
				character,
				variant.rulesVersion,
				20000 + index * 100 + botIndex * 12
			);
			corpus.hands.push({ addedAt: new Date().toISOString().slice(0, 10), ...capture });
			characterCovered.add(key);
			added++;
		}
	writeFileSync(CORPUS, gzipSync(JSON.stringify(corpus)));
	console.log(`Replay corpus: ${corpus.hands.length} hands (${added} added).`);
}
