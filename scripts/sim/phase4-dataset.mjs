/**
 * Phase 4 training-data export (brief §18): decision records from simulated tables, for future
 * offline work on learned policies. No training code: data only.
 *
 * The compact, reproducible form of every simulated hand is its table spec (seed, table, seats,
 * hands, matched): runTable replays it exactly. This script replays a sample of specs with traces
 * and writes one JSON line per decision of a watched seat, split into tiers like the live recorder
 * (server/analytics/recorder.mjs):
 *   public   what anyone at the table saw: pot, stake, who is in, blind or seen, the hand so far
 *   private  the deciding bot's own cards and its strength estimate (never anyone else's cards)
 *   mind     its mood, pressure, who it faced, and the opponent reads it consulted
 *   decision candidate moves with probabilities and utilities, the chosen move and its reason
 *   outcome  its result for the hand, whether it won and reached a showdown, cards revealed there
 * plus character, style version, policy, configuration hash, scenario and seeds.
 *
 *   node scripts/sim/phase4-dataset.mjs [--seed 44] [--tables 20] [--out .sim/phase4/data]
 */
import { mkdirSync, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { runTable, SIM_VERSION } from '../../server/sim/table.mjs';
import { opponents, seatsFor } from '../../server/sim/evaluate.mjs';
import { CHAMPIONS } from '../../server/sim/league.mjs';
import { STYLES } from '../../server/bots/dna-styles.mjs';
import { EXPLOITS } from '../../server/sim/adversary.mjs';
import { CHARACTER_IDS } from '../../src/lib/bots/cast.js';

export const DATASET_VERSION = 'p4data@1';
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const SEED = Number(opt('seed', 44));
const T = Number(opt('tables', 20));
const OUT = opt('out', '.sim/phase4/data');
mkdirSync(OUT, { recursive: true });

const scenarios = (c) => [
	{ id: 'population', seats: (t) => seatsFor(CHAMPIONS[c], opponents(SEED, 'data', t, c), t) },
	{
		id: 'vs-maniac',
		seats: () => ({ seats: [CHAMPIONS[c], ...Array(4).fill('human-maniac')], heroSeat: 0 })
	},
	{
		id: 'vs-station',
		seats: () => ({ seats: [CHAMPIONS[c], ...Array(4).fill('human-station')], heroSeat: 0 })
	},
	{
		id: 'vs-pressure-after-loss',
		seats: () => ({
			seats: [
				CHAMPIONS[c],
				...[1, 2, 3, 4].map((i) => ({
					id: `adv${i}`,
					adversary: EXPLOITS['pressure-after-loss'].g,
					target: 0
				}))
			],
			heroSeat: 0
		})
	}
];

let records = 0;
for (const c of CHARACTER_IDS) {
	const style = STYLES[CHAMPIONS[c]];
	const gz = createGzip();
	gz.pipe(createWriteStream(`${OUT}/${c}.jsonl.gz`));
	for (const sc of scenarios(c))
		for (let t = 0; t < T; t++) {
			const { seats, heroSeat } = sc.seats(t);
			const spec = { seed: SEED, table: 80000 + t, hands: 200, seats, matched: true, traces: true };
			const pending = [];
			runTable(
				spec,
				(hand) => {
					const me = hand.seats.find((s) => s.seat === heroSeat);
					for (const r of pending.splice(0)) {
						r.outcome = {
							net: me?.net ?? null,
							won: !!me?.won,
							showdown: !!me?.showdown,
							revealedPercentiles: hand.seats
								.filter((s) => s.shownP != null)
								.map((s) => [s.seat, s.shownP])
						};
						gz.write(JSON.stringify(r) + '\n');
						records++;
					}
				},
				{
					decision: ({ view, actor, move, row }) => {
						if (row.seat !== heroSeat) return undefined;
						const tr = move.trace ?? {};
						pending.push({
							v: DATASET_VERSION,
							sim: SIM_VERSION,
							seed: SEED,
							table: spec.table,
							hand: view.handId,
							step: row.i,
							scenario: sc.id,
							character: c,
							style: style._id,
							policy: style.policy,
							configHash: style.configHash,
							seat: heroSeat,
							public: {
								pot: view.pot,
								boot: view.boot,
								stake: view.legalActions?.minBet ?? null,
								blind: row.blind,
								rounds: row.rounds,
								alive: row.alive,
								facing: row.facing,
								players: view.usersList.map((u) => ({
									id: u.id,
									balance: u.balance,
									bet: u.handBet ?? 0,
									blind: !!u.isBlind,
									packed: !!u.isPacked
								}))
							},
							private: { cards: actor.cards, eq: tr.eq ?? null, strength: tr.s ?? null },
							mind: {
								mood: tr.mood ?? null,
								pressure: tr.pressure ?? null,
								facing: tr.facing ?? null,
								reads: tr.memoryRefs ?? []
							},
							decision: {
								candidates: Object.keys(tr.probs ?? {}),
								probs: tr.probs ?? null,
								utility: tr.utility ?? null,
								chosen: row.name,
								reason: row.reason
							}
						});
						return undefined;
					}
				}
			);
		}
	gz.end();
}
console.log(`${records.toLocaleString()} decision records (${DATASET_VERSION}) in ${OUT}`);
