/**
 * Quirks: named signature tendencies a style can list with a strength in [0, 1]. Any character
 * may have any quirk; the shared policy never asks which character it is playing.
 *
 * `needs: 'mind'` quirks depend on memory, mood or opponent models (BOT_BRAIN.md phase 2). The
 * phase 1 policy registers them but they contribute nothing yet.
 */

export const QUIRKS = Object.freeze({
	/** Proud of blind play: looking gets less appealing the longer he stays blind and when seen
	 * players lean on him. */
	blindPride: {
		reason: 'blind-pride',
		apply(sit, k) {
			if (sit.seen) return null;
			return { see: -k * (0.18 * sit.rounds + 0.25 * sit.seenBetters) };
		}
	},
	/** Survival first: the bigger the pot relative to the stack, the more packing appeals. */
	survivalMode: {
		reason: 'survival-pack',
		apply(sit, k) {
			const share = Math.min(1, sit.pot / Math.max(sit.me.balance ?? 1, 1));
			if (share < 0.15) return null;
			return { chaal: -k * 0.35 * share, raise: -k * 0.6 * share };
		}
	},
	tiltSpiral: { reason: 'tilt', needs: 'mind' },
	revengeRaise: { reason: 'revenge-raise', needs: 'mind' },
	bluffCatcher: { reason: 'bluff-catch', needs: 'mind' },
	readsTable: { reason: 'model-exploit', needs: 'mind' }
});

/**
 * Quirks for policy tp-dna@2. A quirk is a conditional character moment, never a permanent
 * copy of a DNA trait: each one acts only in a specific situation, and adds what the traits do not.
 * `apply(sit, k, strength)` returns deltas or null when its moment has not come.
 */
export const QUIRKS_V2 = Object.freeze({
	/** Pride under pressure: when seen players lean on a blind player, he pushes back instead of
	 * looking. Ordinary blind play is left to the blindPreference trait. */
	blindPride: {
		reason: 'blind-pride',
		apply(sit, k) {
			if (sit.seen || !sit.seenBetters) return null;
			return { see: -k * 0.3 * sit.seenBetters, raise: k * 0.12 * sit.seenBetters };
		}
	},
	/** Survival in big pots: once the pot is a large share of the stack, marginal hands get
	 * released. Strong hands are barely touched. */
	survivalMode: {
		reason: 'survival-pack',
		apply(sit, k, s) {
			const share = Math.min(1, sit.pot / Math.max(sit.me.balance ?? 1, 1));
			if (share < 0.25) return null;
			const weak = s ? (1 - s.multi) ** 2 : 0.5;
			return { chaal: -k * 0.4 * share * weak, raise: -k * 0.7 * share * weak };
		}
	},
	tiltSpiral: { reason: 'tilt', needs: 'mind' },
	revengeRaise: { reason: 'revenge-raise', needs: 'mind' },
	bluffCatcher: { reason: 'bluff-catch', needs: 'mind' },
	readsTable: { reason: 'model-exploit', needs: 'mind' }
});

/**
 * Quirks for policy tp-dna@3. Same rule: a quirk acts only in its moment. The mind-based
 * quirks are live from this policy on. `apply(sit, k, strength, m)` where `m` is what the bot
 * remembers about this hand and table (server/bots/character-v3.mjs `recall`).
 */
export const QUIRKS_V3 = Object.freeze({
	...QUIRKS_V2,
	/** Pride under pressure, where the pressure is seen players who raised this hand. */
	blindPride: {
		reason: 'blind-pride',
		apply(sit, k, s, m) {
			if (sit.seen || !m.pressure) return null;
			return { see: -k * 0.3 * m.pressure, raise: k * 0.12 * m.pressure };
		}
	},
	/** Tilt feeds on itself: past a frustration threshold, raising looks better and better. */
	tiltSpiral: {
		reason: 'tilt',
		apply(sit, k, s, m) {
			const over = m.mood.frustration - 0.3;
			if (over <= 0 || !sit.seen) return null;
			return { raise: k * 0.8 * over, chaal: k * 0.2 * over };
		}
	},
	/** Someone who beat this bot in a big pot lately is in the hand: take it to them. */
	revengeRaise: {
		reason: 'revenge-raise',
		apply(sit, k, s, m) {
			const target = m.opponents.find((o) => o.recent.beatMe <= 3 && o.rel.rivalry > 0.1);
			if (!target || !sit.seen) return null;
			return { raise: k * 0.35 * target.rel.rivalry, chaal: k * 0.1 * target.rel.rivalry };
		}
	},
	/** Facing a raise from a player already caught bluffing: call them down. */
	bluffCatcher: {
		reason: 'bluff-catch',
		apply(sit, k, s, m) {
			const raiser = m.facing;
			if (!raiser || !sit.seen) return null;
			const caught = Math.min(
				1,
				raiser.recent.caughtBluffing * 0.5 + raiser.beliefs.bluffShown.p - 0.25
			);
			if (caught <= 0) return null;
			return { chaal: k * 0.35 * caught, show: k * 0.25 * caught };
		}
	},
	/** Reads the table: opponent observations count double (applied in the beliefs node). */
	readsTable: { reason: 'model-exploit', modelWeight: true }
});
