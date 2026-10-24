import { getVariant } from '../variants/index.mjs';
import { winChance, bestDiscard, tableMove, tableKnown, sideShowReply } from './strategy.mjs';

/**
 * The base brain: Teen Patti skill every character shares. It reads only the bot's own projection
 * (what a person in that seat sees), lists the candidate moves and scores them with named factors.
 * Personality never lives here; it nudges these scores later (server/bots/character.mjs).
 *
 * Utilities are relative to packing (always 0). Each factor is { f, d: { action: delta } } so the
 * decision trace can say which consideration moved which move.
 */

/** The table as this bot sees it, in the numbers decisions need. */
export function situation(view, botId) {
	const legal = view.legalActions;
	const me = view.usersList.find((user) => user.id === botId);
	const variant = getVariant(view.rulesVersion);
	const handState = variant.stateFor
		? variant.stateFor(view.variantState, botId)
		: view.variantState;
	const opponents = view.usersList.filter(
		(user) => user.id !== botId && user.cardsInHand.length && !user.isPacked
	);
	const boot = Math.max(view.boot ?? 1, 1);
	const seen = me.cardsInHand.some((card) => card.rank > 0);
	const cost = legal.minBet ?? 0;
	const balance = Math.max(me.balance ?? 0, 1);
	return {
		view,
		legal,
		me,
		variant,
		handState,
		opponents,
		myTurn: view.usersList[view.currentPlayer]?.id === botId,
		seen,
		boot,
		rounds: (me.handBet ?? 0) / boot,
		pot: view.pot ?? 0,
		cost,
		potOdds: cost / Math.max((view.pot ?? 0) + cost, 1),
		stackPressure: Math.min(1, cost / balance),
		canRaise: !!legal.bet && legal.maxBet > legal.minBet,
		// Seen opponents who have put in more than this bot: public pressure anyone at the table sees.
		seenBetters: opponents.filter(
			(user) => !user.isBlind && (user.handBet ?? 0) > (me.handBet ?? 0)
		).length,
		headsUp: opponents.length === 1
	};
}

/**
 * Moves that need no judgment of character: open the mat card it paid for, lock its best line,
 * make a joker, or throw the card that leaves the strongest hand. Null when none is due.
 */
export function forcedMove(sit, random) {
	const { legal, view } = sit;
	if (legal.sideShowAnswer) return sideShowReply(sit.me.cardsInHand, sit.variant, sit.handState, random);
	if (legal.table?.length)
		return {
			action: 'table',
			payload: tableMove(view, sit.me, sit.variant, random),
			reason: 'table-move'
		};
	if (legal.discard)
		return {
			action: 'discard',
			payload: { index: bestDiscard(sit.me.cardsInHand, sit.variant, sit.handState) },
			reason: 'discard'
		};
	return null;
}

/** Legal moves this policy considers, by name. Bets use the two existing sizes (chaal, double). */
export function candidates(sit) {
	const { legal } = sit;
	const list = ['pack'];
	if (!sit.seen && legal.see) list.push('see');
	if (legal.bet) list.push('chaal');
	if (sit.canRaise) list.push('raise');
	if (legal.show) list.push('show');
	return list;
}

export function move(sit, name) {
	if (name === 'chaal') return { action: 'bet', payload: { amount: sit.legal.minBet } };
	if (name === 'raise') return { action: 'bet', payload: { amount: sit.legal.maxBet } };
	return { action: name, payload: {} };
}

/**
 * Hand strength against everyone still in, from the bot's own cards only. Against several live
 * opponents the hand has to beat each of them; a seen opponent who keeps betting more is
 * probably holding something (public information).
 */
export function strength(sit, random) {
	const known = tableKnown(sit.handState);
	const single = winChance(sit.me.cardsInHand, sit.variant, sit.handState, random, known);
	let multi = single ** Math.max(1, sit.opponents.length * 0.8);
	if (sit.seenBetters) multi *= 0.92 ** sit.seenBetters;
	return { single, multi };
}

/** Baseline utilities for a competent, personality-free player. */
export function baseFactors(sit, cands, s) {
	const has = new Set(cands);
	const only = (d) => Object.fromEntries(Object.entries(d).filter(([a]) => has.has(a)));
	const factors = [];
	const add = (f, d) => {
		const kept = only(d);
		if (Object.values(kept).some((v) => v !== 0)) factors.push({ f, d: kept });
	};

	if (!sit.seen) {
		// Blind: betting costs half, packing unseen cards is rarely right, and looking gets more
		// attractive the more you have put in.
		add('base.blind-cheap', { chaal: 0.35, raise: 0.1 });
		add('base.see-timing', { see: -0.35 + 0.4 * sit.rounds });
		if (has.has('show')) add('base.blind-show', { show: 0.05 + 0.1 * sit.rounds });
		// Pot Blind (no looking): bow out once the stake eats a large share of the stack.
		if (!has.has('see') && sit.stackPressure > 0.25)
			add('base.stack-pressure', {
				chaal: -1.6 * (sit.stackPressure - 0.25),
				raise: -2 * (sit.stackPressure - 0.25)
			});
		return factors;
	}

	const m = s.multi;
	// Calling is worth it when strength beats the price; raising adds value with strong hands.
	add('base.equity', {
		chaal: m - sit.potOdds - 0.04,
		raise: m - sit.potOdds - 0.08,
		show: m - sit.potOdds
	});
	add('base.value-raise', { raise: 0.9 * (m - 0.62) });
	if (has.has('show')) add('base.show-value', { show: 0.6 * (m - 0.55) });
	if (sit.stackPressure > 0.3)
		add('base.stack-pressure', {
			chaal: -0.5 * (sit.stackPressure - 0.3),
			raise: -0.8 * (sit.stackPressure - 0.3)
		});
	return factors;
}
