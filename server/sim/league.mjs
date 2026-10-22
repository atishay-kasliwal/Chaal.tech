import { readFileSync } from 'node:fs';
import { PHASE4_CHAMPIONS, CHARACTER_STYLES_V3 } from '../bots/dna-styles.mjs';
import { CHARACTER_POLICY_V4 } from '../bots/character-v4.mjs';
import { CHARACTER_POLICY_V5 } from '../bots/character-v5.mjs';
import { candidateStyle } from './candidates.mjs';
import { FORMER_NAMES } from '../bots/dna-policies.mjs';
import { styleConfigHash } from '../bots/identity.mjs';
import { ARCHETYPE_IDS, SCENARIO_IDS } from './archetypes.mjs';
import { P4_ARCHETYPE_IDS } from './archetypes-p4.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';

/**
 * The Phase 4 league (brief §2): the canonical champions, the historical versions worth keeping,
 * the standard baselines and the human archetypes. A member is a sim member id (string) or
 * { id, style } for an unpublished historical candidate, rebuilt from its league record and checked
 * against the configuration hash it was measured under.
 */
export const SHORT = Object.freeze({
	'rohit-sharma': 'Rohit',
	'virat-kohli': 'Virat',
	gg: 'GG',
	'samay-raina': 'Samay',
	'ms-dhoni': 'Dhoni'
});

/** Champions: the canonical lineup, as sim members (the frozen references the publish script copies). */
export const CHAMPIONS = Object.freeze(
	Object.fromEntries(CHARACTER_IDS.map((c) => [c, PHASE4_CHAMPIONS[c]._id]))
);

const LEAGUES = {
	4: { file: 'docs/bots/phase3/league-41.json', policy: CHARACTER_POLICY_V4, phase: 'Phase 3' },
	5: { file: 'docs/bots/phase31/league-43.json', policy: CHARACTER_POLICY_V5, phase: 'Phase 3.1' }
};
const cache = {};
const league = (v) =>
	(cache[v] ??= JSON.parse(
		readFileSync(new URL(`../../${LEAGUES[v].file}`, import.meta.url), 'utf8')
	));

/** A Phase 3 / 3.1 candidate as a sim member, or throws if its hash no longer reproduces. */
export function historicalCandidate(key) {
	const v = Number(key.split('@')[1].split('-')[0]);
	const rec = league(v).candidates[key];
	if (!rec) throw new Error(`No league record for ${key}`);
	// League files omit the tempo, which candidates inherit unchanged from the Phase 2 reference.
	const genome = {
		...rec.genome,
		tempo: rec.genome.tempo ?? CHARACTER_STYLES_V3[rec.character].tendencies.tempo
	};
	const style = candidateStyle(rec.character, genome, {
		id: key,
		parent: rec.parent,
		generation: rec.generation,
		changed: rec.changed,
		policy: LEAGUES[v].policy
	});
	// Phase 3 records hashed the policy under its former name (tp-character@4).
	const former = FORMER_NAMES[style.policy];
	const measured = former
		? styleConfigHash({
				policy: former,
				tendencies: style.tendencies,
				supportedGames: style.supportedGames
			})
		: style.configHash;
	if (measured !== rec.configHash)
		throw new Error(`${key}: hash ${style.configHash} does not reproduce ${rec.configHash}`);
	return { id: key, style };
}

/** Historical versions: every published reference, plus the candidates that taught us something. */
export const HISTORICAL = Object.freeze([
	...CHARACTER_IDS.flatMap((c) => [
		{ key: `${c}@1`, character: c, note: 'Phase 1' },
		{ key: `${c}@2`, character: c, note: 'Phase 1.1 (stateless)' }
	]),
	{ key: 'gg@3', character: 'gg', note: 'Phase 2 GG (ancestor of c034)' },
	{
		key: 'rohit-sharma@4-c026',
		character: 'rohit-sharma',
		note: 'Phase 3 best finalist (not chosen)'
	},
	{ key: 'virat-kohli@4-c024', character: 'virat-kohli', note: 'Phase 3 chosen (not adopted)' },
	{ key: 'samay-raina@4-c008', character: 'samay-raina', note: 'Phase 3 chosen (not adopted)' },
	{ key: 'ms-dhoni@4-c039', character: 'ms-dhoni', note: 'Phase 3 chosen (not adopted)' },
	{ key: 'rohit-sharma@5-c004', character: 'rohit-sharma', note: 'Phase 3.1 best finalist' },
	{
		key: 'samay-raina@5-c046',
		character: 'samay-raina',
		note: 'Phase 3.1 chosen (rejected: less like Samay)'
	},
	{
		key: 'ms-dhoni@5-c039',
		character: 'ms-dhoni',
		note: 'Phase 3.1 chosen (bluffIndex fixed, aggression out)'
	}
]);

export const BASELINE_IDS = Object.freeze([
	'legacy-easy',
	'legacy-normal',
	'legacy-hard',
	'baseline-aggressive',
	'baseline-rock',
	'baseline-station',
	'baseline-random',
	'human-balanced'
]);

export const HUMAN_IDS = Object.freeze([
	...ARCHETYPE_IDS.filter((id) => id !== 'human-balanced'),
	...SCENARIO_IDS,
	...P4_ARCHETYPE_IDS
]);

/** The sim member for a league key. */
export function leagueMember(key) {
	return /@\d+-c\d+$/.test(key) ? historicalCandidate(key) : key;
}

/** Every league participant, grouped. */
export function leagueRoster() {
	return [
		...CHARACTER_IDS.map((c) => ({ key: CHAMPIONS[c], group: 'champion', character: c })),
		...HISTORICAL.filter((h) => !Object.values(CHAMPIONS).includes(h.key)).map((h) => ({
			...h,
			group: 'historical'
		})),
		...BASELINE_IDS.map((key) => ({ key, group: 'baseline' })),
		...HUMAN_IDS.map((key) => ({ key, group: 'human' }))
	];
}
