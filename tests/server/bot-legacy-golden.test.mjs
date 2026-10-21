import test from 'node:test';
import assert from 'node:assert/strict';
import { legacyGolden } from '../helpers/legacy-bot-golden.mjs';
import { characterV1Golden } from '../helpers/character-v1-golden.mjs';
import { characterGolden } from '../helpers/character-golden.mjs';

// Recorded on 2026-10-19 from e4561b4a, before the character policy existed. If this fails, the
// legacy policy (tp-heuristic@1) changed: published styles are immutable, so revert the change.
const RECORDED = {
	decisions: 17094,
	digest: '9356a296dd16f1e0bee183d782a48b53ed1b10904dad7fcead5f91306463d626'
};

test('legacy bots (tp-heuristic@1) decide exactly as before the character policy', () => {
	assert.deepEqual(legacyGolden(), RECORDED);
});

// Recorded on 2026-10-19 before tp-dna@2 existed. The @1 character styles and their policy
// are published: v2 is a new policy and new styles, never an edit to these.
const CHARACTER_V1 = {
	decisions: 10168,
	digest: '5b7c78a1278a61ebc91460d6618bd4d5ebd3fb1948194c201c7dc25266b24f8a'
};

test('character styles @1 (tp-dna@1) decide exactly as when first measured', () => {
	assert.deepEqual(characterV1Golden(), CHARACTER_V1);
});

// Recorded on 2026-10-20 when Phase 2 was approved (BOT_BRAIN.md §29): the Phase 1.1 and Phase 2
// characters are frozen reference versions for Phase 3. Decisions, traces and (for @3) every
// mind after every hand must stay identical. A change belongs in a new version.
const FROZEN = {
	2: {
		decisions: 8707,
		digest: '80d9d105094c54c50951f4dc066b22f1b6f05e0a786bf347ec6f7316285cf9eb'
	},
	3: { decisions: 9333, digest: '0d82a9f0799825374d5d85f181e03b0428e902a45e0570a0747f5f8dea3b827e' }
};

for (const version of [2, 3])
	test(`character styles @${version} decide (and remember) exactly as when Phase 2 was approved`, () => {
		assert.deepEqual(characterGolden(version), FROZEN[version]);
	});
