/** Rebuild the Diwali Taash vector deck from its approved court artwork. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const output = new URL('../static/cards/diwali-taash/', import.meta.url);
await mkdir(output, { recursive: true });
const gold = '#b48a43',
	maroon = '#751d27',
	ivory = '#fff8e8';
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const suits = ['spades', 'hearts', 'diamonds', 'clubs'];
const shapes = {
	spades:
		'M 0 -24 C -8 -12 -24 -3 -24 9 C -24 23 -8 25 -3 13 C -3 22 -6 26 -12 29 L 12 29 C 6 26 3 22 3 13 C 8 25 24 23 24 9 C 24 -3 8 -12 0 -24 Z',
	hearts:
		'M 0 25 C -5 18 -25 5 -25 -8 C -25 -27 -5 -29 0 -15 C 5 -29 25 -27 25 -8 C 25 5 5 18 0 25 Z',
	diamonds: 'M 0 -28 L 21 0 L 0 28 L -21 0 Z',
	clubs:
		'M -5 10 C -19 25 -33 6 -21 -5 C -17 -9 -11 -9 -7 -6 C -22 -26 21 -31 8 -6 C 27 -17 35 9 20 16 C 14 19 7 17 3 11 C 3 21 6 25 12 29 L -12 29 C -6 25 -3 21 -5 10 Z'
};
const lamp = `<path d="M -24 0 Q 0 34 24 0 Q 0 9 -24 0 Z" fill="${gold}" stroke="${maroon}" stroke-width="1.5"/><path d="M 0 -29 C -18 -10 -7 -3 0 -3 C 10 -5 11 -14 0 -29 Z" fill="${gold}"/><path d="M 0 -21 Q -5 -10 0 -7 Q 5 -10 0 -21" fill="${ivory}"/>`;
function root(title, body, defs = '') {
	return `<svg xmlns="http://www.w3.org/2000/svg" width="700" height="1000" viewBox="0 0 280 400" role="img" aria-labelledby="title"><title id="title">${title}</title><defs>${defs}</defs>${body}</svg>\n`;
}
function stock() {
	return `<rect x="1" y="1" width="278" height="398" rx="18" fill="${ivory}" stroke="#dfd0b5" stroke-width="2"/><rect x="9" y="9" width="262" height="382" rx="12" fill="none" stroke="${maroon}" stroke-width="2"/><rect x="13" y="13" width="254" height="374" rx="9" fill="none" stroke="${gold}" stroke-width=".8"/>`;
}
function index(rank, suit, ink) {
	return `<g fill="${ink}" text-anchor="middle"><text x="31" y="47" font-family="Georgia, 'Times New Roman', serif" font-size="${rank === '10' ? 30 : 37}" font-weight="700">${rank}</text><use href="#pip" transform="translate(31 69) scale(.4)"/></g>`;
}
const pip = (x, y, flip = false, scale = 0.65) =>
	`<use href="#pip" transform="translate(${x} ${y}) rotate(${flip ? 180 : 0}) scale(${scale})"/>`;
const columns = (ys) =>
	ys.flatMap((y) => [
		[94, y],
		[186, y]
	]);
const layout = {
	2: [
		[140, 105],
		[140, 295]
	],
	3: [
		[140, 105],
		[140, 200],
		[140, 295]
	],
	4: columns([105, 295]),
	5: [...columns([105, 295]), [140, 200]],
	6: columns([105, 200, 295]),
	7: [...columns([105, 200, 295]), [140, 151]],
	8: [...columns([105, 200, 295]), [140, 151], [140, 249]],
	9: [...columns([100, 167, 233, 300]), [140, 200]],
	10: [...columns([100, 167, 233, 300]), [140, 133], [140, 267]]
};
const art = {};
for (const [rank, name] of [
	['J', 'jack'],
	['Q', 'queen'],
	['K', 'king']
]) {
	art[rank] =
		`data:image/png;base64,${(await readFile(new URL(`artwork/${name}.png`, output))).toString('base64')}`;
}
const manifest = {
	id: 'diwali-taash',
	name: 'Diwali Taash',
	width: 700,
	height: 1000,
	back: 'back.svg',
	cards: []
};
for (const suit of suits)
	for (const rank of ranks) {
		const ink = suit === 'hearts' || suit === 'diamonds' ? '#a2262c' : '#242623';
		let defs = `<path id="pip" d="${shapes[suit]}" fill="${ink}"/><g id="corner">${index(rank, suit, ink)}</g>`;
		let body =
			stock() + '<use href="#corner"/><use href="#corner" transform="rotate(180 140 200)"/>';
		if (rank === 'A') {
			body += pip(140, 200, false, 2.25);
			body += `<g transform="translate(140 205) scale(.9)">${lamp}</g><path d="M 103 281 Q 140 304 177 281 M 103 119 Q 140 96 177 119" fill="none" stroke="${gold}" stroke-width="1.2"/><g fill="${gold}"><path d="M 140 97 L 144 103 L 140 109 L 136 103 Z"/><path d="M 140 291 L 144 297 L 140 303 L 136 297 Z"/></g>`;
		} else if (art[rank]) {
			defs += `<clipPath id="court-clip"><rect x="55" y="25" width="170" height="350" rx="5"/></clipPath><g id="court-top"><image href="${art[rank]}" x="55" y="25" width="170" height="175" preserveAspectRatio="xMidYMin slice"/><use href="#pip" transform="translate(205 179) scale(.33)"/></g>`;
			body += `<g clip-path="url(#court-clip)"><use href="#court-top"/><use href="#court-top" transform="rotate(180 140 200)"/></g><rect x="55" y="25" width="170" height="350" rx="5" fill="none" stroke="${gold}" stroke-width="1.2"/><path d="M 55 200 H 225" stroke="${gold}" stroke-width="1"/>`;
		} else {
			body += layout[rank]
				.map(([x, y]) => pip(x, y, y > 200, Number(rank) >= 9 ? 0.53 : 0.65))
				.join('');
		}
		const file = `${suit}-${rank.toLowerCase()}.svg`;
		await writeFile(new URL(file, output), root(`${rank} of ${suit} — Diwali Taash`, body, defs));
		manifest.cards.push({ rank, suit, file });
	}
// Define one half and rotate it exactly; every directional detail is two-way.
const petals = Array.from(
	{ length: 12 },
	(_, i) =>
		`<path d="M 0 -8 C -20 -32 -16 -56 0 -66 C 16 -56 20 -32 0 -8 Z" transform="rotate(${i * 30})"/>`
).join('');
const dots = Array.from(
	{ length: 24 },
	(_, i) => `<circle cx="0" cy="-82" r="1.4" transform="rotate(${i * 15})"/>`
).join('');
const half = `<g id="back-half"><path d="M 40 190 C 20 150 42 110 70 111 C 64 77 103 68 140 38 C 177 68 216 77 210 111 C 238 110 260 150 240 190" fill="none" stroke="${gold}" stroke-width="1.8"/><g transform="translate(140 104) scale(.8)">${lamp}</g><g fill="${gold}"><path d="M 140 24 L 144 30 L 140 36 L 136 30 Z"/>${[55, 75, 95, 115, 135, 155, 175].map((y) => `<circle cx="30" cy="${y}" r="1.3"/><circle cx="250" cy="${y}" r="1.3"/>`).join('')}</g><path d="M 25 25 Q 43 26 49 44 Q 27 41 25 25 M 255 25 Q 237 26 231 44 Q 253 41 255 25" fill="${gold}"/></g>`;
const back = `<rect x="1" y="1" width="278" height="398" rx="18" fill="${maroon}" stroke="#56151f" stroke-width="2"/><rect x="10" y="10" width="260" height="380" rx="11" fill="none" stroke="${gold}" stroke-width="2"/><rect x="15" y="15" width="250" height="370" rx="7" fill="none" stroke="${gold}" stroke-width=".7"/><use href="#back-half"/><use href="#back-half" transform="rotate(180 140 200)"/><g transform="translate(140 200)" fill="none" stroke="${gold}" stroke-width="1.3">${petals}<circle r="72"/><g fill="${gold}" stroke="none">${dots}<circle r="6"/></g></g>`;
await writeFile(
	new URL('back.svg', output),
	root('Diwali Taash — reversible maroon and gold card back', back, half)
);
await writeFile(new URL('manifest.json', output), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Generated ${manifest.cards.length} card faces and one back.`);
