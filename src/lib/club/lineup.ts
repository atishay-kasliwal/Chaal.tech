import { VARIANT_BY_VERSION, type RulesVersion } from '#lib/variant-catalog.js';

/** A lineup slot that draws a surprise game when its turn comes (same token as the server). */
export const MYSTERY = 'mystery';
/** Hands per lineup game; 0 means one round (a hand for each player at the table). */
export const LINEUP_HANDS = [1, 2, 3, 0] as const;
export const handsLabel = (hands: number) =>
	hands === 0 ? 'One round' : `${hands} hand${hands === 1 ? '' : 's'}`;

export const slotName = (slot: string) =>
	slot === MYSTERY
		? 'Mystery'
		: (VARIANT_BY_VERSION[slot as RulesVersion]?.selectionLabel.split(': ')[0] ?? slot);
export const slotHint = (slot: string) =>
	slot === MYSTERY
		? 'A surprise game'
		: (VARIANT_BY_VERSION[slot as RulesVersion]?.selectionLabel.split(': ')[1] ?? '');

/** Families of games, for filtering the picker. */
export const GAME_FAMILIES = [
	{
		id: 'classic',
		label: 'Classic',
		games: ['classic-1', 'muflis-1', '999-1', '2-card-1', 'pot-blind-1']
	},
	{
		id: 'jokers',
		label: 'Jokers',
		games: [
			'ak47-1',
			'joker-1',
			'lowest-joker-1',
			'highest-joker-1',
			'one-eyed-jack-1',
			'color-joker-1',
			'lallan-kallan-1'
		]
	},
	{
		id: 'four',
		label: '4+ cards',
		games: [
			'4-card-1',
			'discard-one-1',
			'folding-joker-1',
			'muflis-4-1',
			'joker-4-1',
			'lowest-joker-4-1',
			'highest-joker-4-1',
			'color-joker-4-1',
			'kiss-miss-bliss-1',
			'kissing-missing-1'
		]
	},
	{
		id: 'table',
		label: 'Table cards',
		games: ['chatai-1', 'running-1', 'rotating-joker-1', 'revolving-joker-1']
	}
] as const;
export const familyOf = (version: string) =>
	GAME_FAMILIES.find((family) => (family.games as readonly string[]).includes(version))?.id ??
	'classic';

/**
 * Where the lineup goes next, the same way the server works it out: the slot now playing keeps
 * going until it has had its hands, then the next slot; the lineup loops.
 */
export function lineupNext(
	lineup: string[],
	at: { index: number; rulesVersion: string; played: number } | undefined,
	current: string,
	hands: number,
	seats: number
): { index: number; slot: string; repeat: boolean } | null {
	if (!lineup.length) return null;
	const perGame = hands === 0 ? Math.max(1, seats) : hands;
	if (at && lineup[at.index] !== undefined && at.rulesVersion === current && at.played < perGame)
		return { index: at.index, slot: lineup[at.index], repeat: true };
	const from = at && lineup[at.index] !== undefined ? at.index : lineup.indexOf(current);
	const index = (from + 1) % lineup.length;
	return { index, slot: lineup[index], repeat: false };
}
