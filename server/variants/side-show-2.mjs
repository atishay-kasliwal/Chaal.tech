import { sideShow } from './side-show.mjs';

/**
 * Side Show 2: everything in Side Show, plus showing your cards to a friend. Once you have looked
 * at your cards, you can show them, in private, to a friend who has packed (so two friends who are
 * both out can compare too). They see the hand until it ends, and the table is told who showed
 * whom. Players still in the hand never see each other's cards. The engine runs it (`friendShow`).
 */
export const sideShow2 = Object.freeze({
	...sideShow,
	version: 2,
	rulesVersion: 'side-show-2',
	description:
		'Classic, plus the Side Show, and you can show your cards to a friend who has packed. The weaker hand leaves a side show.',
	friendShow: true,
	getRules: () =>
		Object.freeze({
			...sideShow.getRules(),
			friendShow:
				'Once you have looked at your cards you can show them, in private, to a friend who has packed, whether you are still in or have packed yourself. They see your hand until the hand ends, and the table is told who showed whom. Players still in the hand never see each other’s cards.'
		})
});
