/** Where a value and its likely range sit on a bar centred on zero (percentages). */
export function meter(value: number | null | undefined, low?: number | null, high?: number | null) {
	if (value === null || value === undefined) return null;
	const lo = low ?? value,
		hi = high ?? value;
	const m = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(value), 1e-9);
	const at = (v: number) => 50 + (v / m) * 48;
	return { lo: at(lo), hi: at(hi), v: at(value), neg: value < 0 };
}

/** Suit glyph for each game, used as its icon everywhere in Stats. */
export const SUIT: Record<string, string> = {
	'teen-patti': '♠',
	'texas-holdem': '♦',
	blackjack: '♣',
	rummy: '♥'
};
export const redGame = (game: string) => SUIT[game] === '♦' || SUIT[game] === '♥';
