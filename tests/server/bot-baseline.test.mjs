import test from 'node:test';
import assert from 'node:assert/strict';
import { dnaLineDigest, mainLineDigest } from '../helpers/baseline-digest.mjs';

// The Phase 3.1 baseline (docs/archive/bots/CANONICAL.md). Both digests were identical before and after the
// DNA line was merged onto main and its policies renamed tp-dna@n: a change belongs in a new version.

test('the DNA line decides exactly as at the baseline: v1 to v3, the Phase 3 finals (incl. GG c034), minds and traces', () => {
	assert.deepEqual(dnaLineDigest(), { digest: '460c2fdbe14da294', decisions: 16348 });
});

test("main's own bot styles decide exactly as before the merge: tp-character@1 seeds, tp-adaptive@1 v3, legacy", () => {
	assert.deepEqual(mainLineDigest(), { digest: 'e18d345cc94ae4de', decisions: 6943 });
});
