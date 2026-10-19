/** Deterministic texture packing only: crop/resample approved/generated paintings.
 * No drawing, synthesis, recoloring, model API or production asset writes.
 * Usage: node scripts/presence/pack-art.mjs (requires local ffmpeg/ffprobe). */
import { spawnSync } from 'node:child_process';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DHONI_EYES } from '../../src/lib/mascots/presence/eye-rig.ts';
import { DHONI_MOUTH } from '../../src/lib/mascots/presence/mouth-rig.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dest = path.join(root, 'static/prototypes/dhoni-parts');
await mkdir(dest, { recursive: true });
const center = 'scale=1080:1080:flags=bilinear,crop=360:360:360:360';
const tasks = [
	['portrait', 'mascots/bot-ms-dhoni/signature/directions.webp', 'crop=360:360:360:360'],
	['clean', 'prototypes/dhoni-eyes/clean-v1.webp', center],
	['lids', 'prototypes/dhoni-blink/closed-v1.webp', center],
	['neck', 'prototypes/dhoni-head/neck-v1.webp', center]
];
for (const [i, side] of ['left', 'right'].entries()) {
	const eye = DHONI_EYES.eyes[i];
	for (const [feature, box, size, source] of [
		['iris', eye.irisSource, [56, 66], 'irises'],
		['brow', eye.browSource, [172, 46], 'brows']
	]) {
		const [x, y, w, h] = box;
		tasks.push([
			`${feature}-${side}`,
			`prototypes/dhoni-eyes/${source}-v1.webp`,
			`crop=${w}:${h}:${x}:${y},scale=${size.join(':')}:flags=lanczos`
		]);
	}
}
for (const pose of ['smile', 'composed']) {
	const [x, y, w, h] = DHONI_MOUTH.source;
	tasks.push([
		`mouth-${pose}`,
		`prototypes/dhoni-mouth/${pose}-v1.webp`,
		`scale=1080:1080:flags=bilinear,crop=${w}:${h}:${360 + x}:${360 + y},scale=${w * 3}:${h * 3}:flags=lanczos`
	]);
}
const files = [];
for (const [name, src, filter] of tasks) {
	const file = `${name}-v1.webp`,
		output = path.join(dest, file);
	const run = spawnSync(
		'ffmpeg',
		[
			'-y',
			'-loglevel',
			'error',
			'-i',
			path.join(root, 'static', src),
			'-vf',
			filter,
			'-c:v',
			'libwebp',
			'-lossless',
			'1',
			output
		],
		{ encoding: 'utf8' }
	);
	if (run.status !== 0) throw new Error(run.stderr || `Packing failed: ${file}`);
	const probe = spawnSync(
		'ffprobe',
		[
			'-v',
			'error',
			'-select_streams',
			'v:0',
			'-show_entries',
			'stream=width,height',
			'-of',
			'json',
			output
		],
		{ encoding: 'utf8' }
	);
	if (probe.status !== 0) throw new Error(probe.stderr);
	const { width, height } = JSON.parse(probe.stdout).streams[0];
	files.push({
		file,
		source: src,
		filter,
		bytes: (await stat(output)).size,
		width,
		height,
		decodedBytes: width * height * 4
	});
}
const result = {
	files,
	bytes: files.reduce((n, f) => n + f.bytes, 0),
	decodedBytes: files.reduce((n, f) => n + f.decodedBytes, 0)
};
await writeFile(path.join(dest, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
