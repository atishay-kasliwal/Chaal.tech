/** Deterministic vector masters for the approved PROBO PLAYER / CT chip family. */
import { mkdir, writeFile } from 'node:fs/promises';

const palette = {
	5: '#34658a',
	10: '#147782',
	20: '#67448b',
	25: '#09634c',
	50: '#cd541b',
	100: '#333330',
	200: '#802938',
	500: '#244ca0',
	1000: '#aa2630'
};
const output = new URL('../static/chips/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [value, color] of Object.entries(palette)) {
	const inserts = Array.from(
		{ length: 6 },
		(_, i) => `
		<path d="M -18 -116 A 117.4 117.4 0 0 1 18 -116 L 14 -90 A 91 91 0 0 0 -14 -90 Z" fill="#f2e5c9" transform="translate(128 128) rotate(${i * 60})"/>
		<rect x="124.5" y="17" width="7" height="19" rx="1" fill="url(#gold)" stroke="#e5c47c" stroke-width=".6" transform="rotate(${i * 60 + 30} 128 128)"/>`
	).join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 256 256" role="img" aria-labelledby="title">
	<title id="title">PROBO PLAYER CT ${value} chip</title>
	<defs>
		<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e1bf70"/><stop offset=".5" stop-color="#a4772d"/><stop offset="1" stop-color="#d2aa57"/></linearGradient>
		<radialGradient id="ivory" cx=".36" cy=".25" r=".8"><stop stop-color="#fff8e8"/><stop offset="1" stop-color="#e9d9b8"/></radialGradient>
		<linearGradient id="bevel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".24"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-opacity=".28"/></linearGradient>
		<path id="brand-arc" d="M 60 119 A 70 70 0 0 1 196 119"/>
	</defs>
	<circle cx="128" cy="130" r="118" fill="#182e26"/>
	<circle cx="128" cy="128" r="118" fill="${color}"/>
	${inserts}
	<circle cx="128" cy="128" r="116.8" fill="none" stroke="url(#bevel)" stroke-width="2"/>
	<circle cx="128" cy="128" r="91" fill="none" stroke="#112d26" stroke-opacity=".6" stroke-width="2"/>
	<circle cx="128" cy="128" r="87.5" fill="url(#gold)"/>
	<circle cx="128" cy="128" r="84" fill="url(#ivory)" stroke="#f9ebc9" stroke-width="1"/>
	<circle cx="128" cy="128" r="79.5" fill="none" stroke="#a77931" stroke-width="1"/>
	<circle cx="128" cy="128" r="76.5" fill="none" stroke="#b58c47" stroke-width=".65"/>
	<text fill="#153c30" font-family="Georgia, 'Times New Roman', serif" font-size="14" font-weight="700" letter-spacing=".65"><textPath href="#brand-arc" startOffset="50%" text-anchor="middle">PROBO PLAYER</textPath></text>
	<g fill="#a4772d" font-family="Georgia, 'Times New Roman', serif" font-weight="400"><text x="119" y="107" font-size="25" text-anchor="middle">C</text><text x="132" y="115" font-size="25" text-anchor="middle">T</text></g>
	<text x="128" y="163" fill="#123e30" font-family="Georgia, 'Times New Roman', serif" font-size="${value.length === 4 ? 49 : value.length === 3 ? 55 : 62}" font-weight="700" text-anchor="middle" letter-spacing="-2">${value}</text>
	<path d="M 100 181 H 120 M 136 181 H 156" fill="none" stroke="#a4772d" stroke-width="1"/>
	<path d="M 128 176 L 133 181 L 128 186 L 123 181 Z" fill="url(#gold)"/>
</svg>
`;
	await writeFile(new URL(`probo-player-${value}.svg`, output), svg);
}
console.log(`Generated ${Object.keys(palette).length} chip SVGs.`);
