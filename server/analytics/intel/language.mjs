/**
 * Statistical language rules (docs/ANALYTICS_PHASE5.md, "Language"). One place decides how strongly a
 * finding may be worded, and every generated sentence is a deterministic template over structured
 * facts. No model writes routine product text; nothing here invents an explanation.
 *
 *   strong    state the observation plainly            ("You pack 7 of 9 times against a large raise.")
 *   moderate  hedge it                                  ("You tend to pack against a large raise.")
 *   weak      show the raw count or say it is too early ("Not enough history yet.")
 */
import { fingerprint64 } from '../hash.mjs';

export const TIERS = Object.freeze(['weak', 'moderate', 'strong']);

/** How firmly a finding with sample size n, minimum sample `min` and p-value p may be stated. */
export function tierOf({ n, min, p = null, q = null }) {
	if (!Number.isFinite(n) || n < min) return 'weak';
	const value = q ?? p;
	if (value === null || value === undefined) return n >= min * 3 ? 'moderate' : 'weak';
	if (value < 0.01 && n >= min * 3) return 'strong';
	if (value < 0.05) return 'moderate';
	return 'weak';
}

/** Pick the wording for a tier. A weak tier returns the raw fallback, never a claim. */
export function worded(tier, { strong, moderate, raw }) {
	if (tier === 'strong') return strong;
	if (tier === 'moderate') return moderate ?? strong;
	return raw ?? null;
}

/** Same facts → same variant (a night's recap never reshuffles on refresh), different seeds vary. */
export function variant(seed, options) {
	const hash = fingerprint64(String(seed));
	return options[parseInt(hash.slice(0, 6), 16) % options.length];
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const boots = (x, digits = 1) => {
	const v = Math.abs(Math.round(x * 10 ** digits) / 10 ** digits);
	return `${v} ${v === 1 ? 'boot' : 'boots'}`;
};
export const signedBoots = (x, digits = 1) => {
	const v = Math.round(x * 10 ** digits) / 10 ** digits;
	return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)} ${Math.abs(v) === 1 ? 'boot' : 'boots'}`;
};
export const pct = (x) => `${Math.round(Math.abs(x) * 100)}%`;

/** No em dashes in anything a player sees: use : , . or · instead. */
export const plain = (text) => String(text).replace(/\s*—\s*/g, ', ');

export const GAME_NAMES = Object.freeze({ 'teen-patti': 'Teen Patti', 'texas-holdem': 'Hold’em', blackjack: 'Blackjack', rummy: 'Rummy' });
export const gameName = (game) => GAME_NAMES[game] ?? game;

const TITLE = (s) => String(s).split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
/** A readable variant name: "muflis-1" → "Muflis". The version suffix is for history, not players. */
export const variantName = (rulesVersion) => (rulesVersion ? TITLE(String(rulesVersion).replace(/-\d+$/, '')) : null);
