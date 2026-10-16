/** Shared catalog for asset generation and the review page. */
export const DECKS = [
	{
		id: 'diwali-taash',
		name: 'Diwali Taash',
		base: '#751d27',
		gold: '#b48a43',
		accent: '#d9a93b',
		ivory: '#fff8e8'
	},
	{
		id: 'indore-poha-jalebi',
		name: 'Indore Poha Jalebi',
		base: '#c74f12',
		gold: '#edbf46',
		accent: '#3d7546',
		ivory: '#fff8e8'
	},
	{
		id: 'ujjain-shaam',
		name: 'Ujjain Shaam',
		base: '#13344e',
		gold: '#b98b4a',
		accent: '#cb9661',
		ivory: '#fff8e8'
	},
	{
		id: 'paneer-tikka-night',
		name: 'Paneer Tikka Night',
		base: '#8f3022',
		gold: '#c99d52',
		accent: '#3c7450',
		ivory: '#fff8e8'
	},
	{
		id: 'christmas',
		name: 'Christmas',
		base: '#0c3f30',
		gold: '#c4a25f',
		accent: '#aa293a',
		ivory: '#fff8e8'
	},
	{
		id: 'new-year',
		name: 'New Year',
		base: '#102638',
		gold: '#d8b365',
		accent: '#bcc9cd',
		ivory: '#fff8e8'
	},
	{
		id: 'holi',
		name: 'Holi',
		base: '#b52266',
		gold: '#edb740',
		accent: '#147f89',
		ivory: '#fff8e8'
	},
	{
		id: 'garba-night',
		name: 'Garba Night',
		base: '#086368',
		gold: '#e5b558',
		accent: '#d32970',
		ivory: '#fff8e8'
	}
] as const;
export type DeckId = (typeof DECKS)[number]['id'];
