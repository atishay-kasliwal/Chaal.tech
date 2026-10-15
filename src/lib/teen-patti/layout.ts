/**
 * Opponent positions around the felt, as percentages of the table area.
 * The local player always sits in the dock below the felt, so these arcs run
 * clockwise from the dock: lower-left, up and over, down to lower-right —
 * the same direction the turn travels.
 */
type Point = { x: number; y: number };

const wide: Point[][] = [
	[],
	[{ x: 50, y: 0 }],
	[
		{ x: 28, y: 0 },
		{ x: 72, y: 0 }
	],
	[
		{ x: 12, y: 50 },
		{ x: 50, y: 21 },
		{ x: 88, y: 50 }
	],
	[
		{ x: 11, y: 58 },
		{ x: 30, y: 21 },
		{ x: 70, y: 21 },
		{ x: 89, y: 58 }
	],
	[
		{ x: 9, y: 64 },
		{ x: 21, y: 24 },
		{ x: 50, y: 20 },
		{ x: 79, y: 24 },
		{ x: 91, y: 64 }
	]
];

const tall: Point[][] = [
	[],
	[{ x: 50, y: 0 }],
	[
		{ x: 26, y: 0 },
		{ x: 74, y: 0 }
	],
	[
		{ x: 20, y: 46 },
		{ x: 50, y: 16 },
		{ x: 80, y: 46 }
	],
	[
		{ x: 20, y: 62 },
		{ x: 20, y: 19 },
		{ x: 80, y: 19 },
		{ x: 80, y: 62 }
	],
	[
		{ x: 19, y: 74 },
		{ x: 19, y: 41 },
		{ x: 50, y: 15 },
		{ x: 81, y: 41 },
		{ x: 81, y: 74 }
	]
];

export function opponentPoints(count: number, portrait: boolean): Point[] {
	const table = portrait ? tall : wide;
	return table[Math.min(Math.max(count, 0), table.length - 1)];
}

/** Where chips leave from / land at for the local player (bottom-centre edge of the felt). */
export const SELF_POINT: Point = { x: 50, y: 104 };
export const POT_POINT: Point = { x: 50, y: 50 };
