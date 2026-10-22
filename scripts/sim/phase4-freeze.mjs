/**
 * Phase 4 §1: freeze the champions. Writes docs/bots/phase4/champions.json with everything that
 * defines each champion and how it is measured. tests/server/bot-phase4.test.mjs fails if a
 * champion's configuration ever drifts from this record: an improvement must be a new challenger.
 *
 *   node scripts/sim/phase4-freeze.mjs
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PHASE4_CHAMPIONS } from '../../server/bots/dna-styles.mjs';
import { MIND_RULES } from '../../server/bots/policies.mjs';
import { MIND_VERSIONS } from '../../server/bots/mind.mjs';
import { SIM_VERSION } from '../../server/sim/table.mjs';
import { FINGERPRINT_VERSION } from '../../server/sim/fingerprint.mjs';
import { TARGETS, TARGETS_VERSION } from '../../server/sim/targets.mjs';
import { JUDGE_VERSION } from '../../server/sim/judge.mjs';
import { SUMMARY_VERSION } from '../../server/sim/summary.mjs';
import { ADVERSARY_VERSION } from '../../server/sim/adversary.mjs';

const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
const record = {
	frozen: new Date().toISOString().slice(0, 10),
	baselineTag: 'phase3.1-baseline',
	baselineCommit: git('rev-list -n 1 phase3.1-baseline'),
	versions: {
		sim: SIM_VERSION,
		fingerprint: FINGERPRINT_VERSION,
		targets: TARGETS_VERSION,
		judge: JUDGE_VERSION,
		summary: SUMMARY_VERSION,
		adversary: ADVERSARY_VERSION
	},
	champions: Object.fromEntries(
		Object.entries(PHASE4_CHAMPIONS).map(([c, s]) => [
			c,
			{
				style: s._id,
				version: s.version,
				policy: s.policy,
				configHash: s.configHash,
				mind: MIND_VERSIONS[MIND_RULES[s.policy]],
				dna: s.tendencies.dna,
				quirks: s.tendencies.quirks,
				bands: TARGETS[c].map(({ key, min, max, core }) => ({ key, min, max, core }))
			}
		])
	)
};
mkdirSync('docs/bots/phase4', { recursive: true });
writeFileSync('docs/bots/phase4/champions.json', JSON.stringify(record, null, '\t') + '\n');
for (const [c, x] of Object.entries(record.champions))
	console.log(`${c.padEnd(13)} ${x.style.padEnd(15)} ${x.policy} ${x.mind} ${x.configHash}`);
