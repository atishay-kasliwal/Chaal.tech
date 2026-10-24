import { evaluateHand, compareHands } from '../classic.mjs';

const CLASSIC_ORDER = Object.freeze([
	'trail',
	'pure-sequence',
	'sequence',
	'flush',
	'pair',
	'high-card'
]);

/**
 * Classic with the Side Show. A seen player on their turn, with three or more still in, pays a
 * chaal and asks the player just before them (who must have seen their cards too) to compare hands.
 * The other can accept or decline (no answer in 15 seconds declines). If they accept, the server
 * compares the two hands without showing them to the table: the weaker hand leaves the round, and a
 * tie goes against the one who asked. The engine runs the request and the answer; this variant
 * only switches it on (`sideShow`).
 */
export const sideShow = Object.freeze({
	id: 'side-show',
	version: 1,
	rulesVersion: 'side-show-1',
	name: 'Side Show',
	description:
		'Classic, plus the Side Show: a seen player can ask the player before them to compare hands. The weaker hand leaves.',
	evaluateHand,
	compareHands,
	sideShow: true,
	getRules: () =>
		Object.freeze({
			rankingOrder: CLASSIC_ORDER,
			suitsBreakTies: false,
			sideShow:
				'On your turn, once you have seen your cards and three or more players are in, you can pay a chaal and ask the player just before you for a side show, if they have seen their cards too. They can accept or decline (no answer in 15 seconds declines). If they accept, the two hands are compared in private: the weaker hand leaves the round, and a tie goes against the one who asked. You pay your chaal either way. With two players left, ask for a Show instead.'
		})
});
