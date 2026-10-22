/**
 * 10 Pakad character evaluation (docs/games/10PAKAD_REPORT.md): strength and identity of the five
 * characters on matched tables.
 *   node scripts/sim/pakad-eval.mjs [tables] > docs/games/10pakad/results/eval-<seed>.json
 *
 * Strength: the character sits in seat 0 with the plain brain (no personality, no adaptation) in the
 * other three seats; the control is the plain brain in seat 0 on the same decks and draws. Reported as
 * the paired difference in seat 0's team: hands won and tens per hand.
 * Identity: what the character does with the cards it holds, from its own decisions: how often it
 * contests a trick it could win, spends a trump while it could follow or before the eighth trick,
 * feeds a ten onto a trick its partner is winning, and presses its own streak (wins the trick that
 * would collect, by leading a king, an ace or a trump). Each is compared with the plain brain in the same seat.
 */
import { runTablePakad } from '../../server/sim/tricks/table-pakad.mjs';
import { botPakad, PERSONA_SCALE } from '../../server/bots/tricks/bot-pakad.mjs';
import { trickWinner } from '../../server/tricks/cards.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';
import { ci, paired } from '../../server/sim/p4stats.mjs';

const TABLES = Number(process.argv[2] ?? 80);
const HANDS = 4;
const SEED = 61;
const CHARS = Object.keys(CANONICAL_STYLES);
const base = () => botPakad(null, { personality: false, adaptive: false });

function run(hero) {
	const won = [];
	const tens = [];
	const f = {
		decisions: 0,
		canWin: 0,
		contest: 0,
		trumpEarly: 0,
		ledFollow: 0,
		feedChance: 0,
		feed: 0,
		pressChance: 0,
		press: 0
	};
	for (let t = 0; t < TABLES; t++) {
		const seats = [hero(), base(), base(), base()];
		const { results } = runTablePakad(
			{ seed: SEED, table: t, hands: HANDS, seats },
			{
				onDecision({ seat, view, move }) {
					if (seat !== 0) return;
					const card = move.payload.card;
					const plays = view.trick.plays;
					const trump = view.trump;
					const legal = view.legalActions.play;
					f.decisions++;
					if (plays.length) {
						const beats = (c) =>
							trickWinner(
								[...plays, { id: 'p0', card: c }],
								trump ?? (c.suit !== plays[0].card.suit ? c.suit : null)
							) === plays.length;
						if (legal.some(beats)) {
							f.canWin++;
							if (beats(card)) f.contest++;
						}
						const partnerWinning = plays[trickWinner(plays, trump)].id === 'p2';
						if (partnerWinning && legal.some((c) => c.rank === 10)) {
							f.feedChance++;
							if (card.rank === 10) f.feed++;
						}
					}
					if (
						trump &&
						view.tricksPlayed < 7 &&
						legal.some((c) => c.suit === trump) &&
						legal.some((c) => c.suit !== trump)
					) {
						f.ledFollow++;
						if (card.suit === trump) f.trumpEarly++;
					}
					// Holding the streak means leading the trick that would collect: lead strength there.
					if (view.streak?.id === 'p0' && !plays.length) {
						f.pressChance++;
						if (card.rank >= 13 || (trump && card.suit === trump)) f.press++;
					}
				}
			}
		);
		for (const r of results) {
			won.push(r.winnerTeam === 0 ? 1 : 0);
			tens.push(r.tens[0]);
		}
	}
	const rate = (a, b) => (b ? +(a / b).toFixed(3) : null);
	return {
		won,
		tens,
		style: {
			contest: rate(f.contest, f.canWin),
			trumpEarly: rate(f.trumpEarly, f.ledFollow),
			feedTen: rate(f.feed, f.feedChance),
			pressStreak: rate(f.press, f.pressChance),
			decisions: f.decisions
		}
	};
}

const control = run(base);
const out = {
	seed: SEED,
	tables: TABLES,
	hands: HANDS,
	personaScale: PERSONA_SCALE,
	baseline: { won: ci(control.won), tens: ci(control.tens), style: control.style },
	characters: {}
};
for (const c of CHARS) {
	const r = run(() => botPakad(c));
	out.characters[c] = {
		wonVsBaseline: paired(r.won, control.won),
		tensVsBaseline: paired(r.tens, control.tens),
		style: r.style
	};
	console.error(
		c,
		JSON.stringify(out.characters[c].style),
		'won',
		out.characters[c].wonVsBaseline.mean.toFixed(3),
		'±',
		out.characters[c].wonVsBaseline.ci.toFixed(3)
	);
}
console.log(JSON.stringify(out, null, '\t'));
