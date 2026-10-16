/** Shared deterministic face layout for the themed deck collection. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { themeMotifs } from './theme-motifs.mjs';
export async function generateThemedDeck(theme) {
	const output = new URL(`../../static/cards/${theme.id}/`, import.meta.url);
	await mkdir(output, { recursive: true });
	const { gold, base: maroon, ivory } = theme;
	const { emblem: lamp, half, back } = themeMotifs(theme);
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
		id: theme.id,
		name: theme.name,
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
			await writeFile(
				new URL(file, output),
				root(`${rank} of ${suit} — ${theme.name}`, body, defs)
			);
			manifest.cards.push({ rank, suit, file });
		}
	await writeFile(
		new URL('back.svg', output),
		root(`${theme.name} — reversible card back`, back, half)
	);
	await writeFile(new URL('manifest.json', output), JSON.stringify(manifest, null, 2) + '\n');
	console.log(`${theme.name}: ${manifest.cards.length} faces and one back.`);
}
