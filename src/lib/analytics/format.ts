/** Wording and number formats for analytics. Never stronger than the evidence. */

export const GAME_NAMES: Record<string, string> = {
	'teen-patti': 'Teen Patti',
	'texas-holdem': 'Hold’em',
	blackjack: 'Blackjack',
	rummy: 'Rummy'
};
export const gameName = (game: string) => GAME_NAMES[game] ?? game;

/** "classic-1" → "Classic", "kiss-miss-bliss-1" → "Kiss Miss Bliss". */
export function variantName(rulesVersion: string | null | undefined) {
	if (!rulesVersion) return '';
	const base = rulesVersion.replace(/-\d+$/, '');
	const special: Record<string, string> = { '999': '999', '2-card': '2 Card', '4-card': '4 Card', ak47: 'AK47' };
	return special[base] ?? base.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

export const UNIT_NAMES: Record<string, [string, string]> = {
	'teen-patti': ['boot', 'boots'],
	'texas-holdem': ['big blind', 'big blinds'],
	blackjack: ['bet', 'bets'],
	rummy: ['point', 'points']
};

/** +3.2, −1.4, 0 (true minus sign). */
export function signed(value: number | null | undefined, digits = 1) {
	if (value === null || value === undefined || !Number.isFinite(value)) return '–';
	const rounded = Math.round(value * 10 ** digits) / 10 ** digits;
	if (rounded === 0) return '0';
	return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('en-IN', { maximumFractionDigits: digits })}`;
}
export const boots = (value: number | null | undefined, digits = 1) => `${signed(value, digits)} ${Math.abs(value ?? 0) === 1 ? 'boot' : 'boots'}`;
/** "1 hand", "3 hands". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const percent = (value: number | null | undefined) => (value === null || value === undefined ? '–' : `${Math.round(value * 100)}%`);

export type Verdict = 'insufficient' | 'winning' | 'losing' | 'about-even' | 'too-few' | 'ahead' | 'behind';

/** A results headline that only claims what the interval supports. */
export function resultsPhrase(r: { verdict: string; hands: number; perHand: number | null; units: number }) {
	if (r.verdict === 'insufficient' || r.verdict === 'too-few') return `Too early to tell (${r.hands} hands)`;
	if (r.verdict === 'about-even') return `About even across ${r.hands} hands`;
	if (r.verdict === 'winning' || r.verdict === 'ahead') return `Ahead: ${boots(r.perHand, 2)} a hand over ${r.hands} hands`;
	return `Behind: ${boots(r.perHand, 2)} a hand over ${r.hands} hands`;
}

/** Wins against the fair share, with table size already in the baseline. */
export function fairPhrase(f: { verdict: string; hands: number; wins: number; expected: number }) {
	if (f.verdict === 'insufficient') return `Too early to tell (${f.hands} hands)`;
	if (f.verdict === 'about-fair') return `Your fair share: ${f.wins} wins, about the ${f.expected} expected`;
	return `${f.verdict === 'above' ? 'More' : 'Fewer'} wins than your fair share: ${f.wins} against ${f.expected} expected`;
}

export const EVIDENCE_LABEL: Record<string, string> = {
	insufficient: 'Not enough hands yet',
	early: 'Early read',
	moderate: 'Fair evidence',
	strong: 'Strong evidence',
	descriptive: 'Record'
};

export function ago(at: number | string | null | undefined) {
	if (!at) return 'never';
	const minutes = Math.round((Date.now() - new Date(at).getTime()) / 60_000);
	if (minutes < 2) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	if (minutes < 48 * 60) return `${Math.round(minutes / 60)}h ago`;
	return `${Math.round(minutes / 1440)} days ago`;
}

export const day = (at: number | string) =>
	new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(at));
export const time = (at: number | string) =>
	new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }).format(new Date(at));

const SUIT: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠', joker: '★' };
const RANK: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 0: '' };
export const cardLabel = (c: { rank: number; suit: string }) => (c.suit === 'joker' ? 'Joker' : `${RANK[c.rank] ?? c.rank}${SUIT[c.suit] ?? ''}`);
export const redSuit = (c: { suit: string }) => c.suit === 'hearts' || c.suit === 'diamonds';
