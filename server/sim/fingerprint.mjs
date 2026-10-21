/**
 * Behavioural fingerprints (fp@1) from simulated hands. Everything here is computed from what a
 * person at the table could see (moves, blind or seen, bet size, shows, showdowns, results), plus
 * the policy's own probabilities for entropy. No card information is used, so the same numbers
 * describe "how the bot looks" to the people it plays.
 *
 * Phase 1 bots have no memory or mood, so metrics that only mean something with them (tilt,
 * after-win, revenge, adaptation) are reported as unavailable, not estimated.
 */
export const FINGERPRINT_VERSION = 'fp@4';

const BETS = new Set(['chaal', 'raise']);

/**
 * Decision-quality counters, filled from server/sim/judge.mjs grades (the bot's own cards, offline
 * only). They are never identification features: a watching player cannot see them.
 */
const QUALITY = [
	'strongN',
	'strongPack',
	'strongRaiseOk',
	'strongPassive',
	'weakN',
	'weakContinue',
	'weakRaiseOk',
	'weakRaise',
	'monsterN',
	'monsterNoRaise',
	'pressN',
	'pressSee',
	'calmN',
	'calmSee',
	'ovN',
	'ov',
	'ovAdv',
	'ovBig',
	'qovN',
	'qov',
	// tp-dna@3 influence (per decision with a trace): mood / memory moved it, or changed its best move.
	'infN',
	'stateOn',
	'memOn',
	'stateOv',
	'memOv',
	'mconfSum',
	'mconfN',
	// Continue rate by hand strength (w as a multiple of a fair share) and by base-brain clarity.
	'b0N',
	'b0C',
	'b1N',
	'b1C',
	'b2N',
	'b2C',
	'b3N',
	'b3C',
	'b4N',
	'b4C',
	'b0RN',
	'b0R',
	'b1RN',
	'b1R',
	'b2RN',
	'b2R',
	'b3RN',
	'b3R',
	'b4RN',
	'b4R',
	'ambN',
	'ambC',
	'clrN',
	'clrC'
];
/** Where raises happen (public): blind, seen unopened, seen facing a raise, heads-up, multiway, late. */
const CONTEXT = [
	'blindN',
	'blindR',
	'openN',
	'openR',
	'faceN',
	'faceR',
	'huN',
	'huR',
	'mwN',
	'mwR',
	'lateN',
	'lateR',
	'seeAt0',
	'seeAt1',
	'seeAt2',
	'seeAt3',
	'neverSaw',
	// Seen decisions facing a raise where calling was possible, and how many were packs.
	'sFaceN',
	'sFaceP',
	// Blind decisions facing a raise where calling was possible, and how many were packs.
	'bFaceN',
	'bFaceP'
];
export const STRENGTH_BUCKETS = [
	'< 1/3 fair',
	'1/3 to 2/3',
	'2/3 to 1.25 (borderline)',
	'1.25 to 2',
	'2x fair or more'
];
/** An override that beat a base-brain preference larger than this is a big one. */
export const BIG_OVERRIDE = 0.1;

function context(s, d) {
	if (!d.blind && d.facing && d.name !== 'see' && !d.forced) {
		s.sFaceN++;
		if (d.name === 'pack') s.sFaceP++;
	}
	if (d.blind && d.facing && d.name !== 'see' && !d.forced) {
		s.bFaceN++;
		if (d.name === 'pack') s.bFaceP++;
	}
	if (d.name === 'see') {
		s[`seeAt${Math.min(3, s.blindBets)}`]++;
		s.saw = true;
		return;
	}
	if (!d.raiseOk) return;
	const raised = d.name === 'raise' ? 1 : 0;
	const add = (k) => {
		s[`${k}N`]++;
		s[`${k}R`] += raised;
	};
	if (d.blind) add('blind');
	else {
		add(d.facing ? 'face' : 'open');
		add(d.alive === 2 ? 'hu' : 'mw');
	}
	if (d.rounds >= 4) add('late');
}

function grade(s, d) {
	const q = d.q;
	if (!q) return;
	if (q.stateOn !== undefined) {
		s.infN++;
		s.stateOn += q.stateOn ? 1 : 0;
		s.memOn += q.memOn ? 1 : 0;
		s.stateOv += q.stateOv ? 1 : 0;
		s.memOv += q.memOv ? 1 : 0;
		if (q.mconf !== undefined) {
			s.mconfSum += q.mconf;
			s.mconfN++;
		}
	}
	if (q.w !== undefined) {
		const fair = 1 / Math.max(d.alive, 2);
		const x = q.w / fair;
		const b = x < 1 / 3 ? 0 : x < 2 / 3 ? 1 : x < 1.25 ? 2 : x < 2 ? 3 : 4;
		const cont = d.name !== 'pack' ? 1 : 0;
		s[`b${b}N`]++;
		s[`b${b}C`] += cont;
		if (d.raiseOk) {
			s[`b${b}RN`]++;
			if (d.name === 'raise') s[`b${b}R`]++;
		}
		if (q.clarity !== undefined) {
			const k = q.clarity < 0.1 ? 'amb' : 'clr';
			s[`${k}N`]++;
			s[`${k}C`] += cont;
		}
	}
	if (q.pressure !== undefined) {
		if (q.pressure) {
			s.pressN++;
			if (d.name === 'see') s.pressSee++;
		} else {
			s.calmN++;
			if (d.name === 'see') s.calmSee++;
		}
	}
	if (q.strong) {
		s.strongN++;
		if (d.name === 'pack') s.strongPack++;
		if (d.raiseOk && d.name !== 'pack') {
			s.strongRaiseOk++;
			if (d.name === 'chaal') s.strongPassive++;
		}
	}
	if (q.weak) {
		s.weakN++;
		if (d.name !== 'pack') s.weakContinue++;
		if (d.raiseOk) {
			s.weakRaiseOk++;
			if (d.name === 'raise') s.weakRaise++;
		}
	}
	if (q.monster && d.raiseOk) {
		s.monsterN++;
		if (d.name !== 'raise') s.monsterNoRaise++;
	}
	if (q.ov !== undefined) {
		s.ovN++;
		if (q.ov) {
			s.ov++;
			s.ovAdv += q.ovAdv;
			if (q.ovAdv > BIG_OVERRIDE) s.ovBig++;
		}
	}
	if (q.qov !== undefined) {
		s.qovN++;
		if (q.qov) s.qov++;
	}
}

/** Per seat, one compact record of what that seat did in a hand. */
export function seatHandStats(hand) {
	const stats = new Map();
	for (const s of hand.seats)
		if (s.dealt)
			stats.set(s.seat, {
				member: s.member,
				net: s.net,
				showdown: s.showdown ? 1 : 0,
				won: s.won ? 1 : 0,
				blindBets: 0,
				blindRaises: 0,
				seenChaal: 0,
				seenRaise: 0,
				seenPack: 0,
				blindPack: 0,
				see: 0,
				showOk: 0,
				show: 0,
				facing: 0,
				facingPack: 0,
				firstSeen: null,
				decisions: 0,
				entropy: 0,
				entropyN: 0,
				...Object.fromEntries([...QUALITY, ...CONTEXT].map((k) => [k, 0])),
				saw: false
			});
	for (const d of hand.decisions) {
		const s = stats.get(d.seat);
		if (!s || d.name === 'discard' || d.name === 'table') continue;
		s.decisions++;
		grade(s, d);
		context(s, d);
		if (d.entropy !== null) {
			s.entropy += d.entropy;
			s.entropyN++;
		}
		if (d.showOk) {
			s.showOk++;
			if (d.name === 'show') s.show++;
		}
		if (d.facing && d.name !== 'see') {
			s.facing++;
			if (d.name === 'pack') s.facingPack++;
		}
		if (d.name === 'see') s.see++;
		else if (d.blind) {
			if (BETS.has(d.name)) s.blindBets++;
			if (d.name === 'raise') s.blindRaises++;
			if (d.name === 'pack') s.blindPack++;
		} else {
			if (s.firstSeen === null) s.firstSeen = d.name === 'pack' ? 0 : 1;
			if (d.name === 'chaal') s.seenChaal++;
			if (d.name === 'raise') s.seenRaise++;
			if (d.name === 'pack') s.seenPack++;
		}
	}
	for (const s of stats.values()) {
		if (!s.saw && s.decisions) s.neverSaw++;
		delete s.saw;
	}
	return stats;
}

/** Summed counters over any set of seat-hands. */
export function sum(records) {
	const t = { hands: 0, net: 0, net2: 0, showdown: 0, won: 0, wonShowdown: 0 };
	for (const r of records) {
		t.hands++;
		t.net += r.net;
		t.net2 += r.net * r.net;
		t.showdown += r.showdown;
		if (r.showdown && r.won) t.wonShowdown++;
		for (const k of [
			'blindBets',
			'blindRaises',
			'seenChaal',
			'seenRaise',
			'seenPack',
			'blindPack',
			'see',
			'showOk',
			'show',
			'facing',
			'facingPack',
			'decisions',
			'entropy',
			'entropyN',
			...QUALITY,
			...CONTEXT
		])
			t[k] = (t[k] ?? 0) + r[k];
		if (r.firstSeen !== null) {
			t.firstSeen = (t.firstSeen ?? 0) + 1;
			t.stay = (t.stay ?? 0) + r.firstSeen;
		}
	}
	return t;
}

const rate = (a, b) => (b ? a / b : null);

/** The fp@1 metrics from summed counters. */
export function metrics(t) {
	const mean = t.net / Math.max(t.hands, 1);
	const sd = Math.sqrt(Math.max(t.net2 / Math.max(t.hands, 1) - mean * mean, 0));
	const decided = t.decisions ?? 0;
	const seenDecisions = (t.seenChaal ?? 0) + (t.seenRaise ?? 0) + (t.seenPack ?? 0);
	const bets = (t.blindBets ?? 0) + (t.seenChaal ?? 0) + (t.seenRaise ?? 0);
	return {
		hands: t.hands,
		decisions: decided,
		bootsPer100: mean * 100,
		bootsPer100Ci95: (196 * sd) / Math.sqrt(Math.max(t.hands, 1)),
		blindRounds: rate(t.blindBets, t.hands),
		blindRaiseRate: rate(t.blindRaises, t.blindBets),
		seeRate: rate(t.see, decided),
		chaalRate: rate((t.blindBets ?? 0) - (t.blindRaises ?? 0) + (t.seenChaal ?? 0), decided),
		raiseRate: rate((t.blindRaises ?? 0) + (t.seenRaise ?? 0), decided),
		packRate: rate((t.seenPack ?? 0) + (t.blindPack ?? 0), decided),
		showRate: rate(t.show, t.showOk),
		seenRaiseRate: rate(t.seenRaise, seenDecisions),
		seenPackRate: rate(t.seenPack, seenDecisions),
		aggression: rate(t.seenRaise, t.seenChaal),
		foldToRaise: rate(t.facingPack, t.facing),
		// fp@4: only seen decisions where calling was possible (blind and forced packs excluded).
		seenFoldToRaise: rate(t.sFaceP, t.sFaceN),
		blindFoldToRaise: rate(t.bFaceP, t.bFaceN),
		stayAfterSeeing: rate(t.stay, t.firstSeen),
		showdownRate: rate(t.showdown, t.hands),
		wonAtShowdown: rate(t.wonShowdown, t.showdown),
		raiseShareOfBets: rate((t.blindRaises ?? 0) + (t.seenRaise ?? 0), bets),
		entropy: t.entropyN ? t.entropy / t.entropyN : null,
		// Decision quality (judge@1, classic hands; null where no such situation arose).
		strongPackRate: rate(t.strongPack, t.strongN),
		strongPassiveRate: rate(t.strongPassive, t.strongRaiseOk),
		weakContinueRate: rate(t.weakContinue, t.weakN),
		weakRaiseRate: rate(t.weakRaise, t.weakRaiseOk),
		monsterNoRaiseRate: rate(t.monsterNoRaise, t.monsterN),
		seeUnderPressure: rate(t.pressSee, t.pressN),
		seeWithoutPressure: rate(t.calmSee, t.calmN),
		overrideRate: rate(t.ov, t.ovN),
		meanOverriddenAdvantage: rate(t.ovAdv, t.ov),
		bigOverrideRate: rate(t.ovBig, t.ovN),
		quirkOverrideRate: rate(t.qov, t.qovN),
		stateInfluence: rate(t.stateOn, t.infN),
		memoryInfluence: rate(t.memOn, t.infN),
		stateOverrideRate: rate(t.stateOv, t.infN),
		memoryOverrideRate: rate(t.memOv, t.infN),
		modelConfidence: rate(t.mconfSum, t.mconfN),
		continueByStrength: [0, 1, 2, 3, 4].map((b) => rate(t[`b${b}C`], t[`b${b}N`])),
		strengthCounts: [0, 1, 2, 3, 4].map((b) => t[`b${b}N`] ?? 0),
		raiseByStrength: [0, 1, 2, 3, 4].map((b) => rate(t[`b${b}R`], t[`b${b}RN`])),
		// Raises with at most a fair share (bluffs and thin pressure) vs with more (value).
		thinRaise: rate(
			(t.b0R ?? 0) + (t.b1R ?? 0) + (t.b2R ?? 0),
			(t.b0RN ?? 0) + (t.b1RN ?? 0) + (t.b2RN ?? 0)
		),
		valueRaise: rate((t.b3R ?? 0) + (t.b4R ?? 0), (t.b3RN ?? 0) + (t.b4RN ?? 0)),
		continueAmbiguous: rate(t.ambC, t.ambN),
		continueClear: rate(t.clrC, t.clrN),
		raiseWhere: {
			blind: rate(t.blindR, t.blindN),
			seenOpen: rate(t.openR, t.openN),
			seenFacingRaise: rate(t.faceR, t.faceN),
			headsUp: rate(t.huR, t.huN),
			multiway: rate(t.mwR, t.mwN),
			late: rate(t.lateR, t.lateN)
		},
		lookTiming: (() => {
			const counts = [t.seeAt0, t.seeAt1, t.seeAt2, t.seeAt3, t.neverSaw].map((x) => x ?? 0);
			const total = counts.reduce((a, b) => a + b, 0);
			return counts.map((x) => rate(x, total));
		})(),
		gradedSituations: {
			strong: t.strongN ?? 0,
			weak: t.weakN ?? 0,
			monster: t.monsterN ?? 0,
			pressure: t.pressN ?? 0
		},
		tiltIndex: 'unavailable (phase 2: needs mood)',
		afterWinDelta: 'unavailable (phase 2: needs mood)',
		revengeIndex: 'unavailable (phase 2: needs relationships)',
		adaptation: 'unavailable (phase 2: needs opponent models)'
	};
}

/**
 * Public behaviour features for identification: what a person watching the table could tally.
 * Order matters (vectors); null where the window had no such situation.
 */
export const FEATURES = Object.freeze([
	'blindRounds',
	'blindRaiseRate',
	'raiseRate',
	'chaalRate',
	'packRate',
	'seeRate',
	'showRate',
	'aggression',
	'seenRaiseRate',
	'seenPackRate',
	'foldToRaise',
	'stayAfterSeeing',
	'showdownRate',
	'raiseShareOfBets'
]);

/** The feature vector, optionally without some features (single-feature ablation). */
export function featureVector(t, without = []) {
	const m = metrics(t);
	return FEATURES.filter((f) => !without.includes(f)).map((f) => m[f]);
}

/**
 * Night effect: how much one session differs from another beyond decision noise. Each session's
 * hands are split into even and odd halves; if halves of the same night are closer than halves
 * of different nights, the night itself had a character (mood, tonight's form, memory). A
 * stateless policy at the same table with the same decks should score about zero.
 * Features are standardized over all halves. Returns mean within-night and between-night
 * distances, their difference (night) and its 95% interval over sessions.
 */
export function nightEffect(sessions) {
	const halves = sessions.map((hands) =>
		[0, 1].map((r) => featureVector(sum(hands.filter((_, i) => i % 2 === r))))
	);
	const all = halves.flat();
	const n = all[0].length;
	const mean = Array.from({ length: n }, (_, i) => {
		const xs = all.map((x) => x[i]).filter((v) => v != null);
		return xs.reduce((s, v) => s + v, 0) / Math.max(xs.length, 1);
	});
	const sd = Array.from({ length: n }, (_, i) => {
		const xs = all.map((x) => x[i] ?? mean[i]);
		return Math.sqrt(xs.reduce((s, v) => s + (v - mean[i]) ** 2, 0) / xs.length) || 1;
	});
	const z = (x) => x.map((v, i) => ((v ?? mean[i]) - mean[i]) / sd[i]);
	const zs = halves.map(([a, b]) => [z(a), z(b)]);
	const dist = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
	const per = zs.map(([a, b], i) => {
		const within = dist(a, b);
		const others = zs.filter((_, j) => j !== i).map(([, b2]) => dist(a, b2));
		const between = others.reduce((s, v) => s + v, 0) / others.length;
		return { within, between, night: between - within };
	});
	const avg = (k) => per.reduce((s, p) => s + p[k], 0) / per.length;
	const night = avg('night');
	const sdN = Math.sqrt(
		per.reduce((s, p) => s + (p.night - night) ** 2, 0) / Math.max(per.length - 1, 1)
	);
	return {
		within: avg('within'),
		between: avg('between'),
		night,
		ci: (1.96 * sdN) / Math.sqrt(per.length),
		n: per.length
	};
}
