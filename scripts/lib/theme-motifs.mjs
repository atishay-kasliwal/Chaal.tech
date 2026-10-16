/** Original vector motifs; assembled in paired halves for reversible backs. */
const spiral = (color, width = 3) =>
	`<path d="M 0 0 C -5 -7 6 -12 12 -5 C 24 11 0 26 -16 13 C -37 -5 -11 -39 16 -27 C 48 -12 34 36 1 40" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>`;
const star = (color) =>
	`<path d="M 0 -30 L 6 -8 L 29 0 L 6 7 L 0 30 L -6 7 L -29 0 L -6 -8 Z" fill="${color}"/>`;
const lamp = (gold, base) =>
	`<path d="M -26 0 Q 0 34 26 0 Q 0 8 -26 0 Z" fill="${gold}" stroke="${base}" stroke-width="1.2"/><path d="M 0 -29 C -17 -11 -6 -3 0 -3 C 11 -6 10 -14 0 -29 Z" fill="${gold}"/>`;
const leaf = (color) =>
	`<path d="M 0 0 C -20 -20 -7 -33 0 -37 C 11 -25 17 -10 0 0 Z" fill="${color}"/>`;
export function themeMotifs({ id, base, gold, accent }) {
	let emblem, decoration, center;
	const floral = `<g stroke="${gold}" fill="none"><path d="M -90 0 Q -66 -35 -42 -48 M 90 0 Q 66 -35 42 -48"/>${[-1, 1].map((sign) => `<g transform="translate(${sign * 64} -24) rotate(${sign * 35})">${leaf(accent)}</g>`).join('')}</g>`;
	switch (id) {
		case 'indore-poha-jalebi':
			emblem = `<g transform="translate(-2 -6) scale(.7)">${spiral('#f08516', 6)}${spiral(gold, 1)}</g>`;
			decoration = `<ellipse cy="9" rx="57" ry="23" fill="#e8dcc3" stroke="${gold}" stroke-width="2"/><ellipse cy="5" rx="49" ry="17" fill="#efc23f"/>${Array.from({ length: 16 }, (_, i) => `<path d="M ${-36 + (i % 8) * 10} ${-3 + Math.floor(i / 8) * 12} l 5 2" stroke="#fff0a7" stroke-width="2"/>`).join('')}<g transform="translate(-20 0) scale(.3)">${leaf(accent)}</g><path d="M 21 9 L 38 -1 A 20 20 0 0 1 39 16 Z" fill="#ffe895" stroke="${gold}"/>`;
			center = `<g transform="scale(.8)">${emblem}</g>${floral}`;
			break;
		case 'ujjain-shaam':
			emblem =
				lamp(gold, base) +
				`<path d="M -30 27 Q 0 19 30 27 M -37 36 Q 0 28 37 36" stroke="${gold}" fill="none"/>`;
			decoration = `<path d="M -87 27 H -35 V 15 H -22 V 3 H -9 V -9 H 4 V -21 H 17" stroke="${accent}" stroke-width="7" fill="none"/><path d="M 87 27 H 35 V 15 H 22 V 3 H 9 V -9 H -4 V -21 H -17" stroke="${accent}" stroke-width="7" fill="none"/><g transform="translate(0 4) scale(.6)">${lamp(gold, base)}</g>`;
			center = `${[-28, -14, 0, 14, 28].map((y) => `<path d="M -75 ${y} Q -30 ${y - 9} 0 ${y} T 75 ${y}" fill="none" stroke="${gold}" stroke-width="1"/>`).join('')}`;
			break;
		case 'paneer-tikka-night':
			emblem = `<path d="M 0 -41 V 43" stroke="${gold}" stroke-width="3"/>${[-25, 0, 25].map((y, i) => `<g transform="translate(0 ${y}) rotate(${i % 2 ? 12 : -12})"><rect x="-12" y="-10" width="24" height="20" rx="3" fill="#e9a544" stroke="${base}" stroke-width="1.5"/><path d="M -8 -4 L -2 -2 M 3 4 L 8 6" stroke="#ad4d23" stroke-width="2"/><path d="M -14 12 H 14" stroke="${accent}" stroke-width="4"/></g>`).join('')}`;
			decoration = `<g transform="translate(-35 0) rotate(-30) scale(.8)">${emblem}</g><g transform="translate(35 0) rotate(30) scale(.8)">${emblem}</g><path d="M -65 -30 Q -45 -50 -62 -64 M 65 -30 Q 45 -50 62 -64" fill="none" stroke="${gold}" stroke-width="1.5"/>`;
			center = `<ellipse rx="33" ry="17" fill="${gold}"/><ellipse cy="-3" rx="27" ry="11" fill="${accent}"/>${floral}`;
			break;
		case 'christmas':
			emblem = `<rect x="-7" y="-29" width="14" height="8" rx="2" fill="${gold}"/><circle r="26" cy="4" fill="${accent}" stroke="${gold}" stroke-width="1.5"/><g transform="translate(0 4) scale(.55)">${star(gold)}</g><path d="M -22 17 Q 0 25 22 17" fill="none" stroke="${gold}"/>`;
			decoration =
				emblem +
				`<g stroke="${gold}" stroke-width="1.5">${[-1, 1].map((s) => `<path d="M ${s * 30} 25 L ${s * 70} -20"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M ${s * (35 + i * 6)} ${20 - i * 7} l ${s * 15} 0 m ${-s * 15} 0 l ${-s * 2} -17"/>`).join('')}`).join('')}</g>`;
			center = star(gold) + floral;
			break;
		case 'new-year': {
			const burst = `<g stroke="${gold}" fill="none">${Array.from({ length: 20 }, (_, i) => `<g transform="rotate(${i * 18})"><path d="M 0 -8 Q -6 -32 0 -55" stroke-width="1.3"/><circle cy="-59" r="1.5" fill="${i % 2 ? accent : gold}"/></g>`).join('')}</g>`;
			emblem = `<g transform="scale(.55)">${burst}</g>`;
			decoration = burst;
			center =
				burst +
				`<g transform="translate(-75 0) scale(.25)">${star(accent)}</g><g transform="translate(75 0) scale(.25)">${star(accent)}</g>`;
			break;
		}
		case 'holi':
			emblem = `<path d="M -29 5 Q 0 40 29 5 Z" fill="${gold}"/><path d="M -26 4 Q -16 -20 0 -28 Q 17 -12 26 4 Z" fill="#f05a9d"/><path d="M -15 0 Q 3 -18 15 0" fill="${accent}"/>`;
			decoration =
				emblem +
				`<g fill="${accent}">${[
					[-43, -15],
					[-35, 17],
					[40, -25],
					[48, 9]
				]
					.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6"/>`)
					.join(
						''
					)}</g><path d="M -60 -20 Q -45 -45 -26 -30 M 60 -20 Q 45 -45 26 -30" fill="none" stroke="#f2bd30" stroke-width="10" stroke-linecap="round"/>`;
			center = `<g fill="${gold}">${star(gold)}</g><g transform="rotate(45) scale(.75)">${star(accent)}</g><circle r="9" fill="${base}"/>`;
			break;
		case 'garba-night': {
			const stick = `<rect x="-3" y="-48" width="6" height="96" rx="2" fill="${gold}"/>${[-36, -18, 0, 18, 36].map((y) => `<path d="M -3 ${y} H 3" stroke="${accent}" stroke-width="8"/>`).join('')}`;
			emblem = `<g transform="rotate(-40)">${stick}</g><g transform="rotate(40)">${stick}</g><circle cy="-38" r="7" fill="#d9dfd7" stroke="${gold}"/>`;
			decoration = emblem;
			center = `${star(gold)}<g transform="rotate(45) scale(.9)">${star(accent)}</g><circle r="12" fill="#d9dfd7" stroke="${gold}" stroke-width="3"/>`;
			break;
		}
		default:
			throw new Error('Unknown motif ' + id);
	}
	// Opposite halves are exact rotated instances, including all tiny directional details.
	const half = `<g id="back-half"><g transform="translate(140 96)">${decoration}</g><path d="M 32 176 Q 25 95 61 39 M 248 176 Q 255 95 219 39" fill="none" stroke="${gold}" stroke-width="1.1"/>${[34, 54, 74, 94, 114, 134, 154, 174].map((y) => `<circle cx="22" cy="${y}" r="1.4" fill="${gold}"/><circle cx="258" cy="${y}" r="1.4" fill="${gold}"/>`).join('')}<path d="M 26 26 Q 45 27 48 44 Q 29 42 26 26 M 254 26 Q 235 27 232 44 Q 251 42 254 26" fill="${accent}"/><g transform="translate(63 163) scale(.27)">${emblem}</g><g transform="translate(217 163) scale(.27)">${emblem}</g><path d="M 58 52 Q 140 9 222 52 M 63 185 Q 140 154 217 185" fill="none" stroke="${gold}" stroke-width=".8"/>${[50, 70, 90, 110, 130, 150, 170, 190, 210, 230].map((x) => `<path d="M ${x} 20 l 2 3 l -2 3 l -2 -3 Z" fill="${gold}"/>`).join('')}</g>`;
	const back = `<rect x="1" y="1" width="278" height="398" rx="18" fill="${base}" stroke="${gold}" stroke-width="2"/><rect x="10" y="10" width="260" height="380" rx="11" fill="none" stroke="${gold}" stroke-width="2"/><rect x="15" y="15" width="250" height="370" rx="7" fill="none" stroke="${gold}" stroke-width=".7"/><use href="#back-half"/><use href="#back-half" transform="rotate(180 140 200)"/><g transform="translate(140 200)"><use href="#back-center"/><use href="#back-center" transform="rotate(180)"/></g>`;
	return {
		emblem,
		half:
			half +
			`<clipPath id="center-half"><rect x="-120" y="-100" width="240" height="100"/></clipPath><g id="back-center" clip-path="url(#center-half)">${center}</g>`,
		back
	};
}
