/**
 * 29 character evaluation (docs/games/29_REPORT.md): strength and identity of the five characters on
 * matched tables.
 *   node scripts/sim/29-eval.mjs [tables] > docs/games/29/results/eval-<seed>.json
 *
 * Strength: the character in seat 0, the plain brain (no personality, no adaptation) in the other three
 * seats; the control is the plain brain in seat 0 on the same decks and draws. Paired difference in
 * seat 0's team: hands won (scored hands) and points per hand.
 * Identity, from seat 0's own decisions: how often it bids when it may, how high its winning bids are,
 * how often its side makes a bid it won, how often it contests a trick it could win, spends a trump
 * while it could follow, and gives a point card to a trick its partner is winning.
 */
import { runTable29 } from '../../server/sim/tricks/table-29.mjs';
import { bot29, PERSONA_SCALE } from '../../server/bots/tricks/bot-29.mjs';
import { trickWinner } from '../../server/tricks/cards.mjs';
import { CANONICAL_STYLES } from '../../server/bots/dna-styles.mjs';
import { ci, paired } from '../../server/sim/p4stats.mjs';

const TABLES = Number(process.argv[2] ?? 60);
const HANDS = 6;
const SEED = 71;
const CHARS = Object.keys(CANONICAL_STYLES);
const STRENGTH = { 11: 8, 9: 7, 14: 6, 10: 5, 13: 4, 12: 3, 8: 2, 7: 1 };
const POINTS = { 11: 3, 9: 2, 14: 1, 10: 1 };
const s = (c) => STRENGTH[c.rank];
const base = () => bot29(null, { personality: false, adaptive: false });

function run(hero) {
	const won = [];
	const points = [];
	const f = {
		bidChance: 0,
		bid: 0,
		wonBids: [],
		made: 0,
		canWin: 0,
		contest: 0,
		trumpChance: 0,
		trump: 0,
		giftChance: 0,
		gift: 0
	};
	for (let t = 0; t < TABLES; t++) {
		const { results } = runTable29(
			{ seed: SEED, table: t, hands: HANDS, seats: [hero(), base(), base(), base()] },
			{
				onDecision({ seat, view, move }) {
					if (seat !== 0) return;
					const l = view.legalActions;
					if (l.pass && l.bid.length) {
						f.bidChance++;
						if (move.action === 'bid') f.bid++;
					}
					if (move.action !== 'play') return;
					const card = move.payload.card;
					const plays = view.trick.plays;
					const trump = view.revealed ? view.trump : null;
					if (plays.length) {
						const beats = (c) =>
							trickWinner([...plays, { id: 'p0', card: c }], trump, s) === plays.length;
						if (l.play.some(beats)) {
							f.canWin++;
							if (beats(card)) f.contest++;
						}
						if (
							plays[trickWinner(plays, trump, s)].id === 'p2' &&
							l.play.some((c) => POINTS[c.rank])
						) {
							f.giftChance++;
							if (POINTS[card.rank]) f.gift++;
						}
					}
					if (
						trump &&
						l.play.some((c) => c.suit === trump) &&
						l.play.some((c) => c.suit !== trump)
					) {
						f.trumpChance++;
						if (card.suit === trump) f.trump++;
					}
				}
			}
		);
		for (const r of results) {
			if (r.winnerTeam === null || r.winnerTeam === undefined) {
				won.push(0.5);
				points.push(14);
				continue;
			}
			won.push(r.winnerTeam === 0 ? 1 : 0);
			points.push(r.points[0]);
			if (r.bidderId === 'p0') {
				f.wonBids.push(r.bid);
				if (r.made) f.made++;
			}
		}
	}
	const rate = (a, b) => (b ? +(a / b).toFixed(3) : null);
	const mean = (xs) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null);
	return {
		won,
		points,
		style: {
			bidRate: rate(f.bid, f.bidChance),
			bidsWon: f.wonBids.length,
			meanWinningBid: mean(f.wonBids),
			makeRate: rate(f.made, f.wonBids.length),
			contest: rate(f.contest, f.canWin),
			trumpWhileFollowing: rate(f.trump, f.trumpChance),
			giftToPartner: rate(f.gift, f.giftChance)
		}
	};
}

const control = run(base);
const out = {
	seed: SEED,
	tables: TABLES,
	hands: HANDS,
	personaScale: PERSONA_SCALE,
	baseline: { won: ci(control.won), points: ci(control.points), style: control.style },
	characters: {}
};
for (const c of CHARS) {
	const r = run(() => bot29(c));
	out.characters[c] = {
		wonVsBaseline: paired(r.won, control.won),
		pointsVsBaseline: paired(r.points, control.points),
		style: r.style
	};
	console.error(
		c,
		JSON.stringify(r.style),
		'won',
		out.characters[c].wonVsBaseline.mean.toFixed(3),
		'±',
		out.characters[c].wonVsBaseline.ci.toFixed(3)
	);
}
console.error('baseline', JSON.stringify(control.style));
console.log(JSON.stringify(out, null, '\t'));
