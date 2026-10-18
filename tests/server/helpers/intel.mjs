/** Shared helpers for the Phase 5 intelligence tests. */
import { hand, T0 } from './records.mjs';
import { factsFor } from '../../../server/analytics/compute/facts.mjs';
import { getVariant } from '../../../server/variants/index.mjs';
import { freshDeck } from '../../../server/classic.mjs';

export { hand, T0, factsFor };
export const DAY = 86_400_000;

/** Seeded generator (same one the engine tests use in spirit): deterministic, no Math.random. */
export function seeded(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
export function shuffle(list, random) {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * Deal real Classic hands and settle them: every player who stays to the end competes, the best hand
 * wins the pot. `packBelow(equity-ish)` lets a scripted player pack. Returns { records, owns } for the
 * viewer 'me', in the shape the recorder stores, so the analytics under test see real structure.
 */
export function simulateTeenPatti({ hands = 60, players = 4, seed = 1, nightLength = 20, start = T0, packRule = () => false, boot = 10, rulesVersion = 'classic-1' } = {}) {
	const random = seeded(seed);
	const variant = getVariant(rulesVersion);
	const ids = ['me', ...Array.from({ length: players - 1 }, (_, i) => `p${i + 1}`)];
	const records = [];
	const owns = [];
	for (let i = 0; i < hands; i++) {
		const deck = shuffle(freshDeck(), random);
		const cards = Object.fromEntries(ids.map((id, k) => [id, deck.slice(k * 3, k * 3 + 3)]));
		const staying = ids.filter((id) => !(id === 'me' && packRule(cards.me, i)));
		let best = staying[0];
		for (const id of staying) if (variant.compareHands(cards[id], cards[best]) > 0) best = id;
		// Staying to the end costs three boots (the betting rounds); packing early costs one.
		const paid = (id) => (staying.includes(id) ? 3 * boot : boot);
		const pot = ids.reduce((s, id) => s + paid(id), 0);
		const seats = ids.map((id) => ({
			p: id,
			net: id === best ? pot - paid(id) : -paid(id),
			contributed: paid(id),
			exit: id === best ? 'won' : staying.includes(id) ? 'lost' : 'fold'
		}));
		const night = `room:n${Math.floor(i / nightLength)}`;
		const at = start + Math.floor(i / nightLength) * DAY + (i % nightLength) * 60_000;
		records.push(hand({ id: `sim${seed}-${i}`, at, night, handNo: (i % nightLength) + 1, seats, winners: [best], boot, rulesVersion, pot }));
		owns.push({ handId: records.at(-1)._id, p: 'me', gameType: 'teen-patti', rulesVersion, dealt: cards.me, final: cards.me });
	}
	return { records, owns, ownsByHand: new Map(owns.map((o) => [o.handId, o])) };
}

/** Keys that must never appear in a member-facing analytics response. */
const FORBIDDEN = new Set(['deck', 'salt', 'seal', 'commitment', 'hole', 'opponentCards', 'trace', 'botTrace', 'adaptive', 'memorySnapshot', 'configHash', 'seed', 'email', 'sub']);
/** Own-cards fields allowed only where the route is explicitly about the viewer's own cards. */
export function privacyViolations(value, { allow = [] } = {}) {
	const bad = [];
	const walk = (v, path) => {
		if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
		if (v && typeof v === 'object') {
			for (const [k, x] of Object.entries(v)) {
				if ((FORBIDDEN.has(k) || ['dealt', 'final', 'cardsInHand'].includes(k)) && !allow.includes(k)) bad.push(`${path}.${k}`);
				walk(x, `${path}.${k}`);
			}
		}
	};
	walk(value, '$');
	return bad;
}
