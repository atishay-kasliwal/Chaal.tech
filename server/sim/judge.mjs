import { freshDeck } from '../classic.mjs';
import { getVariant } from '../variants/index.mjs';
import { compare } from '../bots/strategy.mjs';
import { situation, candidates, baseFactors } from '../bots/brain.mjs';
import { evidenceOf } from '../bots/character-v2.mjs';

/**
 * Decision-quality judge for simulations (never live). It grades a decision with the deciding
 * bot's own cards, which is allowed for measuring bots offline (ANALYTICS_SPEC §15.2 rule 5), and
 * with an exact hand-strength table rather than the bot's own sampled estimate, so every policy
 * (legacy, baseline, character) is judged by the same ruler.
 *
 * Classic hands only for now: other variants return no grade.
 */
export const JUDGE_VERSION = 'judge@2';
// judge@2: a decision with no real choice (pack the only legal move, e.g. too short to call) is
// not graded. judge@1 counted those forced packs as strong-hand packs.

const key = (card) => `${card.rank}:${card.suit}`;
const handKey = (cards) => cards.map(key).sort().join(',');

let PERCENTILE = null;
/** Share of all 22,100 three-card hands this hand beats (ties count half). */
function percentileTable() {
	if (PERCENTILE) return PERCENTILE;
	const classic = getVariant('classic-1');
	const deck = freshDeck();
	const hands = [];
	for (let a = 0; a < deck.length; a++)
		for (let b = a + 1; b < deck.length; b++)
			for (let c = b + 1; c < deck.length; c++) {
				const cards = [deck[a], deck[b], deck[c]];
				hands.push({ k: handKey(cards), v: classic.evaluateHand(cards) });
			}
	hands.sort((x, y) => compare(x.v, y.v));
	PERCENTILE = new Map();
	let i = 0;
	while (i < hands.length) {
		let j = i;
		while (j + 1 < hands.length && compare(hands[j + 1].v, hands[i].v) === 0) j++;
		const p = (i + (j - i) / 2) / hands.length;
		for (let n = i; n <= j; n++) PERCENTILE.set(hands[n].k, p);
		i = j + 1;
	}
	return PERCENTILE;
}

/** Percentile of a classic three-card hand (simulation only: used for hands shown at a showdown). */
export const handPercentile = (cards) => percentileTable().get(handKey(cards)) ?? null;

const PAY = new Set(['pack', 'chaal', 'raise', 'show']);
const argmax = (obj) => Object.entries(obj).reduce((best, e) => (e[1] > best[1] ? e : best))[0];

/**
 * @returns compact grade fields for one decision row, or {} when nothing applies.
 *   p: hand percentile, w: chance to beat every live opponent (p^opponents), strong / weak / monster,
 *   pressure (blind: a raise since its last move, or seen players betting over it),
 *   ov / ovAdv / qov: the policy's own best move differed from the base brain's, by how much of
 *   the base brain's evidence (cards and money; blind customs barely count, as in tp-dna@2),
 *   and whether a quirk did it (characters only; v1 traces cannot separate quirks).
 */
export function judgeDecision({ room, view, actor, move, row }) {
	const q = {};
	const opponents = row.alive - 1;
	if (actor.isBlind) {
		if (view.legalActions.see && row.name !== 'discard' && row.name !== 'table') {
			const sit = situation(view, actor.id);
			q.pressure = row.facing || sit.seenBetters > 0;
		}
	} else if (
		PAY.has(row.name) &&
		room.rulesVersion === 'classic-1' &&
		actor.cards.length === 3 &&
		(view.legalActions.bet || view.legalActions.show)
	) {
		const p = percentileTable().get(handKey(actor.cards));
		const w = p ** Math.max(opponents, 1);
		const fair = 1 / (opponents + 1);
		q.p = p;
		q.w = w;
		q.strong = w >= Math.min(0.8, 2 * fair);
		q.weak = w < fair / 3 && p < 0.5;
		q.monster = p >= 0.985;
	}
	const t = move.trace;
	if (t?.clarity !== undefined) q.clarity = t.clarity;
	if (t?.state) {
		// tp-dna@3: did mood or memory move this decision, or even change its best move?
		const moved = (o) => Object.values(o ?? {}).some((v) => v !== 0);
		q.stateOn = moved(t.state);
		q.memOn = moved(t.social) || moved(t.model);
		q.stateOv = t.stateOverride;
		q.memOv = t.memoryOverride;
		if (t.memoryRefs?.length)
			q.mconf = t.memoryRefs.reduce((s, r) => s + r[3] / (r[3] + 12), 0) / t.memoryRefs.length;
	}
	if (t?.baseBest !== undefined) {
		q.ov = t.override;
		q.ovAdv = t.overriddenEvidence;
		q.qov = t.quirkOverride;
	} else if (t?.utility) {
		// tp-dna@1: rebuild its base utilities (same base brain) from the recorded strength.
		const sit = situation(view, actor.id);
		const cands = candidates(sit);
		const factors = baseFactors(sit, cands, t.s === undefined ? null : { multi: t.s });
		const base = Object.fromEntries(cands.map((a) => [a, 0]));
		for (const { d } of factors) for (const [a, v] of Object.entries(d)) base[a] += v;
		const evidence = evidenceOf(cands, factors);
		const baseBest = argmax(base);
		const best = argmax(t.utility);
		q.ov = best !== baseBest;
		q.ovAdv = evidence[baseBest] - evidence[best];
	}
	return q;
}
