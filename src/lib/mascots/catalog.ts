/** Sprite atlas contract: nine cells per sheet, ordered left to right, top to bottom. */
export const MASCOT_NAMES: Record<string, string> = {
	atishay: 'Atishay',
	adityaraj: 'Adityaraj',
	mradul: 'Mradul',
	divyansh: 'Divyansh',
	adarsh: 'Adarsh'
};

export const SHEET_CELLS: Record<string, string[]> = {
	reactions: [
		'blink',
		'heart',
		'sparkle',
		'surprised',
		'starstruck',
		'bashful',
		'sleepy',
		'dizzy',
		'delighted'
	],
	game: ['blind', 'cry', 'angry', 'smug', 'nervous', 'thinking', 'laugh', 'shocked', 'rich'],
	food: [
		'diet-coke',
		'chai',
		'lassi',
		'poha',
		'jalebi',
		'paneer-tikka',
		'dal-bati',
		'samosa',
		'too-spicy'
	],
	snacks: [
		'pani-puri',
		'vada-pav',
		'pav-bhaji',
		'maggi',
		'pizza',
		'momos',
		'gulab-jamun',
		'kulfi',
		'food-coma'
	],
	moods: [
		'begging',
		'praying',
		'side-eye',
		'poker-face',
		'evil-laugh',
		'eye-roll',
		'yawn',
		'mind-blown',
		'heart-eyes'
	],
	fun: ['party', 'diwali', 'holi', 'cricket', 'headphones', 'king', 'devil', 'angel', 'nerd']
};
