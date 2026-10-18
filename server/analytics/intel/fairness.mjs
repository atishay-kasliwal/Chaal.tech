/**
 * The fairness center (docs/ANALYTICS_PHASE5.md, "Fairness"). It answers two different questions and
 * is careful to keep them apart:
 *
 *   Are the cards I was dealt consistent with a fair shuffle?   (statistics, on my own cards)
 *   Was this hand's deck sealed before anyone played?           (integrity, from public records)
 *
 * It never exposes deck order, a seal's secret, a salt, or any other player's cards. Short-term
 * unevenness is shown as normal: about one bar in twenty falls outside a 95% band by chance alone,
 * and the verdict only changes for a pattern that survives a multiple-comparison correction.
 */
import { deckFairness } from '../compute/cards.mjs';
import { round, Z95 } from '../compute/stats.mjs';

const band = (n, p) => {
	const sd = Math.sqrt(n * p * (1 - p));
	return { low: round(Math.max(0, n * p - Z95 * sd), 1), high: round(n * p + Z95 * sd, 1) };
};

/** How far the busiest rank is from even, as cards accumulate: it should shrink like 1/sqrt(n). */
function convergence(cards) {
	const out = [];
	for (const f of [0.25, 0.5, 0.75, 1]) {
		const slice = cards.slice(0, Math.max(26, Math.round(cards.length * f)));
		if (slice.length < 26) continue;
		const counts = new Map();
		for (const c of slice) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
		const expected = slice.length / 13;
		const worst = Math.max(...Array.from({ length: 13 }, (_, i) => Math.abs((counts.get(i + 2) ?? 0) - expected) / expected));
		out.push({ cards: slice.length, deviation: round(worst, 3), typical: round(1.5 / Math.sqrt(expected), 3) });
	}
	return out;
}

/**
 * @param owns the viewer's own hand_private docs (never anyone else's)
 * @param integrity counts only, from the public records: { hands, sealed, cutByPlayer, replayVerified }
 * @param club anonymous club-wide counts: { cards, ranks: number[13], suits: number[4] } or null
 */
export function fairnessCenter({ owns, integrity = null, club = null }) {
	const own = deckFairness(owns);
	const all = owns.filter((o) => ['teen-patti', 'texas-holdem', 'blackjack'].includes(o.gameType)).flatMap((o) => o.dealt ?? []);
	const ranks = own.ranks.map((r) => ({ ...r, ...band(own.cards, 1 / 13), within: r.count >= band(own.cards, 1 / 13).low && r.count <= band(own.cards, 1 / 13).high }));
	const suits = own.suits.map((s) => ({ ...s, ...band(own.cards, 1 / 4), within: s.count >= band(own.cards, 1 / 4).low && s.count <= band(own.cards, 1 / 4).high }));
	const outside = ranks.filter((r) => !r.within).length + suits.filter((s) => !s.within).length;
	const enough = own.verdict !== 'insufficient';
	const clubView = club && !club.withheld && club.cards >= 520
		? {
				cards: club.cards,
				ranks: club.ranks.map((count, i) => ({ rank: i + 2, count, expected: round(club.cards / 13, 1), ...band(club.cards, 1 / 13) })),
				suits: club.suits.map((count, i) => ({ suit: ['hearts', 'diamonds', 'clubs', 'spades'][i], count, expected: round(club.cards / 4, 1), ...band(club.cards, 1 / 4) })),
				note: 'Anonymous counts of every card dealt across the club. No player or hand is identifiable.'
			}
		: null;
	return {
		you: {
			verdict: own.verdict,
			sample: { cards: own.cards, hands: owns.length },
			ranks,
			suits,
			outsideBand: enough ? outside : null,
			expectedOutside: 0.85,
			categories: own.classicCategories,
			mostDealt: own.mostDealt,
			unusualCards: own.unusualCards,
			convergence: convergence(all),
			tests: { rank: own.rankTest, suit: own.suitTest }
		},
		club: clubView,
		integrity: integrity
			? {
					hands: integrity.hands,
					sealedBeforeDealing: integrity.sealed,
					cutByAPlayer: integrity.cutByPlayer,
					replayVerified: integrity.replayVerified
				}
			: null,
		explain: {
			what: [
				'Every hand’s deck is shuffled and sealed on the server before anyone sees a card. The seal is a fingerprint that is published with the hand, so the deck cannot be swapped afterwards.',
				'A player then chooses where the deck is cut, so the server alone cannot decide who gets which cards.',
				'After the hand, the recorded game replays exactly from its own history, which checks the result matches the rules.'
			],
			cannot: [
				'It cannot prove a shuffle was random in a single hand: any one deal is just one of many possible deals.',
				'It cannot show deck order or the seal’s secret. Those stay private so a table could never be scouted.',
				'A run of bad cards is normal. With dozens of cards, some ranks will always look a little busy.'
			],
			howToRead: 'Bars sit inside a 95% band when the deal looks like a fair one. Expect about one in twenty to poke outside by chance. We only call a deal unusual when several tests agree after correcting for how many things were checked.'
		}
	};
}
