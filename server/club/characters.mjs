/**
 * Character IDs a member may pick. The art and names live in src/lib/club/characters.ts;
 * this list is what the server accepts. Keep the two in step (a test checks it).
 */
export const CHARACTER_IDS = ['tiger', 'peacock', 'elephant', 'cobra', 'owl', 'fox'];

/** A stable default, so a new member is greeted by the same character on every device. */
export function defaultCharacterFor(seed) {
	let hash = 0;
	for (const character of String(seed)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
	return CHARACTER_IDS[hash % CHARACTER_IDS.length];
}
