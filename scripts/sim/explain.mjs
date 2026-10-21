/**
 * Decision inspector (developer only): replay one simulated hand from its seeds and explain every
 * character decision in it.
 *
 *   node scripts/sim/explain.mjs --seed 1 --table 4242 --hand 0 [--seats rohit-sharma,gg,...] [--variant classic-1]
 *
 * Seats default to the five characters. Traces include the bot's own hand strength: never show
 * this output to players.
 */
import { reproduceHand } from '../../server/sim/table.mjs';
import { explainDecision } from '../../server/sim/explain.mjs';
import { CHARACTER_IDS, castMember } from '../../src/lib/bots/cast.js';

const arg = (name, fallback) => {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 ? process.argv[i + 1] : fallback;
};
const seats = arg('seats', CHARACTER_IDS.join(',')).split(',');
const spec = {
	seed: Number(arg('seed', 1)),
	table: Number(arg('table', 0)),
	seats,
	rulesVersion: arg('variant', 'classic-1')
};
const h = Number(arg('hand', 0));
const hand = reproduceHand(spec, h);
console.log(
	`Seed ${spec.seed}, table ${spec.table}, hand ${h} (${spec.rulesVersion}): ${seats.join(', ')}\n`
);
for (const d of hand.decisions) {
	const id = seats[d.seat];
	const name = castMember(id.split('@')[0])?.name ?? id;
	if (!d.move.trace?.probs) {
		console.log(`${name}: ${d.name} (${d.move.reason ?? 'no trace'})\n`);
		continue;
	}
	console.log(
		explainDecision({ name, move: d.move, decision: { ...d, rounds: d.rounds.toFixed(1) } })
	);
	console.log('');
}
const result = hand.seats
	.map(
		(s) =>
			`${castMember(s.member.split('@')[0])?.name ?? s.member} ${s.net >= 0 ? '+' : ''}${s.net} boots`
	)
	.join(', ');
console.log(`Result (${hand.reason}): ${result}`);
