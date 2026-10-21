/**
 * Counter-based seeding for simulations: every random stream is derived from
 * (simSeed, purpose, table, hand, step), never drawn from a shared generator, so any hand's
 * deck and any decision's draws are reproducible from their coordinates alone.
 */

/** 128-bit hash of a string (cyrb128), as four 32-bit words. */
export function hash128(text) {
	let h1 = 1779033703,
		h2 = 3144134277,
		h3 = 1013904242,
		h4 = 2773480762;
	for (let i = 0; i < text.length; i++) {
		const k = text.charCodeAt(i);
		h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
		h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
		h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
		h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
	}
	h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
	h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
	h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
	h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
	h1 ^= h2 ^ h3 ^ h4;
	h2 ^= h1;
	h3 ^= h1;
	h4 ^= h1;
	return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32, the generator the room uses for bot decisions (server/analytics/recorder.mjs). */
export function sfc32([a, b, c, d]) {
	return () => {
		a >>>= 0;
		b >>>= 0;
		c >>>= 0;
		d >>>= 0;
		let t = (a + b) | 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) | 0;
		c = (c << 21) | (c >>> 11);
		d = (d + 1) | 0;
		t = (t + d) | 0;
		c = (c + t) | 0;
		return (t >>> 0) / 0x1_0000_0000;
	};
}

/** A counted random stream for one coordinate, e.g. stream(7, 'decision', 3, 41, 12). */
export function stream(simSeed, ...coordinates) {
	const seed = hash128([simSeed, ...coordinates].join(':'));
	const next = sfc32(seed);
	const rng = {
		seed,
		draws: 0,
		random: () => {
			rng.draws++;
			return next();
		}
	};
	return rng;
}

/** Fisher-Yates with a given random source. */
export function shuffle(items, random) {
	const out = items.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}
