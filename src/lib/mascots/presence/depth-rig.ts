import type { MotionChannels } from './types.js';

/** Authored front-surface depth relief in the existing 360px art space.
 * This is a bounded 2.5D mesh, not a complete anatomical model or a Cubism asset.
 * The limited angles keep the existing painted overlap in view. */
export const DHONI_DEPTH = {
	center: [180, 140],
	focal: 650,
	columns: 30,
	rows: 32,
	bounds: [70, 20, 220, 207],
	maxYaw: 8,
	maxPitch: 4,
	yawGain: 12,
	pitchGain: 8
} as const;

const finite = (v: number, limit: number) =>
	Number.isFinite(v) ? Math.max(-limit, Math.min(limit, v)) : 0;
const gaussian = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) =>
	Math.exp(-(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2) * 2);

/** Hair/cranium, cheek, muzzle and nose occupy distinct depths. Ears recede.
 * The nose bridge is smooth, with enough subdivisions to avoid a triangular ridge. */
export function headDepth(x: number, y: number) {
	const lateral = (x - 180) / 85;
	const cranial = -18 + 36 * Math.sqrt(Math.max(0, 1 - lateral * lateral));
	const face = gaussian(x, y, 180, 145, 90, 115);
	return (
		cranial * (0.5 + face * 0.5) +
		25 * gaussian(x, y, 180, 155, 15, 24) +
		6 * gaussian(x, y, 153, 157, 27, 32) +
		6 * gaussian(x, y, 207, 157, 27, 32) +
		5 * gaussian(x, y, 180, 179, 30, 22)
	);
}

export function depthPose(frame: Pick<MotionChannels, 'head'>) {
	return {
		yaw: finite(frame.head.x * DHONI_DEPTH.yawGain, DHONI_DEPTH.maxYaw),
		pitch: finite(frame.head.y * DHONI_DEPTH.pitchGain, DHONI_DEPTH.maxPitch)
	};
}

/** Back-project the approved neutral painting so yaw/pitch zero preserves its exact
 * registration. Rotation happens in 3D before perspective projection. */
export function projectHeadPoint(x: number, y: number, yaw: number, pitch: number) {
	const z = headDepth(x, y),
		f = DHONI_DEPTH.focal;
	const wx = ((x - DHONI_DEPTH.center[0]) * (f - z)) / f;
	const wy = ((y - DHONI_DEPTH.center[1]) * (f - z)) / f;
	const a = (finite(yaw, DHONI_DEPTH.maxYaw) * Math.PI) / 180;
	const b = (finite(pitch, DHONI_DEPTH.maxPitch) * Math.PI) / 180;
	const rx = wx * Math.cos(a) + z * Math.sin(a);
	const rz = -wx * Math.sin(a) + z * Math.cos(a);
	const ry = wy * Math.cos(b) + rz * Math.sin(b);
	const depth = -wy * Math.sin(b) + rz * Math.cos(b);
	const scale = f / (f - depth);
	return { x: DHONI_DEPTH.center[0] + rx * scale, y: DHONI_DEPTH.center[1] + ry * scale, z: depth };
}

export function createHeadMesh() {
	const { columns, rows, bounds } = DHONI_DEPTH;
	const count = (columns + 1) * (rows + 1);
	const uv = new Float32Array(count * 2);
	const source = new Float32Array(count * 2);
	const indices = new Uint16Array(columns * rows * 6);
	let at = 0;
	for (let row = 0; row <= rows; row++)
		for (let col = 0; col <= columns; col++) {
			const x = bounds[0] + (bounds[2] * col) / columns;
			const y = bounds[1] + (bounds[3] * row) / rows;
			source[at] = x;
			uv[at++] = x / 360;
			source[at] = y;
			uv[at++] = y / 360;
		}
	at = 0;
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < columns; col++) {
			const i = row * (columns + 1) + col,
				below = i + columns + 1;
			indices.set([i, below, i + 1, i + 1, below, below + 1], at);
			at += 6;
		}
	return { source, uv, indices };
}
