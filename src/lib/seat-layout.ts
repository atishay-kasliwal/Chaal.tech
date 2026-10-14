export type SeatPosition =
	'bottom' | 'top' | 'left' | 'right' | 'upper-left' | 'upper-right' | 'lower-left' | 'lower-right';
const positions: SeatPosition[][] = [
	[],
	['bottom'],
	['bottom', 'top'],
	['bottom', 'upper-left', 'upper-right'],
	['bottom', 'left', 'top', 'right'],
	['bottom', 'lower-left', 'upper-left', 'upper-right', 'lower-right'],
	['bottom', 'lower-left', 'upper-left', 'top', 'upper-right', 'lower-right']
];

// Rotate presentation only. Server seats, player IDs and turn indices are never changed.
export function arrangeSeats<T extends { id: string; seatNumber: number }>(
	players: readonly T[],
	selfId: string
) {
	if (players.length > 6) throw new RangeError('The table supports up to six seats');
	const ordered = [...players].sort((a, b) => a.seatNumber - b.seatNumber);
	const own = Math.max(
		0,
		ordered.findIndex((player) => player.id === selfId)
	);
	const rotated = [...ordered.slice(own), ...ordered.slice(0, own)];
	return rotated.map((user, index) => ({ user, position: positions[players.length][index] }));
}
