/**
 * The club's cast. IDs must match server/club/characters.mjs. Placeholder art until the
 * personal character family is drawn: a glyph on the character's own felt colours.
 */
export interface Character {
	id: string;
	name: string;
	glyph: string;
	/** Ring and background colours. */
	from: string;
	to: string;
}

export const CHARACTERS: Character[] = [
	{ id: 'tiger', name: 'Tiger', glyph: '🐯', from: '#f0b54a', to: '#9a4b12' },
	{ id: 'peacock', name: 'Peacock', glyph: '🦚', from: '#3cc7b4', to: '#173f6b' },
	{ id: 'elephant', name: 'Elephant', glyph: '🐘', from: '#a9b6c9', to: '#3a4658' },
	{ id: 'cobra', name: 'Cobra', glyph: '🐍', from: '#8fd36b', to: '#1f5131' },
	{ id: 'owl', name: 'Owl', glyph: '🦉', from: '#d6a77a', to: '#5b3720' },
	{ id: 'fox', name: 'Fox', glyph: '🦊', from: '#ff8f5a', to: '#7a2618' }
];

export function characterFor(id: string | undefined): Character {
	return CHARACTERS.find((character) => character.id === id) ?? CHARACTERS[0];
}
