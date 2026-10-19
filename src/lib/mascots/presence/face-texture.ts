import { DHONI_ART } from './personality.js';
import { DHONI_EYES, eyeAperture, facialPose } from './eye-rig.js';
import { DHONI_HEAD } from './head-rig.js';
import { DHONI_BLINK } from './blink-art.js';
import { DHONI_MOUTH, mouthPose } from './mouth-rig.js';
import type { PresenceFrame } from './types.js';

type Surface = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
function surface(w: number, h: number): Surface {
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Face texture canvas unavailable');
	return { canvas, ctx };
}
function fadeEdges(s: Surface, horizontal: number, vertical: number) {
	const { ctx, canvas } = s;
	ctx.globalCompositeOperation = 'destination-in';
	for (const [axis, edge] of [
		['x', horizontal],
		['y', vertical]
	] as const) {
		const gradient = ctx.createLinearGradient(
			0,
			0,
			axis === 'x' ? canvas.width : 0,
			axis === 'y' ? canvas.height : 0
		);
		gradient.addColorStop(0, 'transparent');
		gradient.addColorStop(edge, '#fff');
		gradient.addColorStop(1 - edge, '#fff');
		gradient.addColorStop(1, 'transparent');
		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.globalCompositeOperation = 'source-over';
}
async function painting(url: string) {
	const image = new Image();
	image.src = url;
	await image.decode();
	return image;
}

/** Composes the same existing paintings/geometry as the SVG fallback. No game data.
 * Texture changes are cached during stillness; breathing never uploads the head texture. */
export async function createFaceTexture() {
	const urls = [
		DHONI_ART.portrait,
		DHONI_EYES.clean,
		DHONI_EYES.closed,
		...DHONI_EYES.eyes.flatMap((e) => [e.irisAsset, e.browAsset])
	];
	const sources = await Promise.all(urls.map(painting));
	const [portrait, clean, lids] = sources;
	const painted = new Map(urls.map((url, i) => [url, sources[i]]));
	const base = surface(360, 360),
		out = surface(360, 360);
	base.ctx.drawImage(portrait, 0, 0, 360, 360);
	for (const patch of DHONI_EYES.cleanPatches) {
		const [x, y, w, h] = patch.target,
			[sx, sy, sw, sh] = patch.source;
		const part = surface(w * 4, h * 4);
		part.ctx.drawImage(clean, sx, sy, sw, sh, 0, 0, w * 4, h * 4);
		fadeEdges(part, 0.08, 0.12);
		base.ctx.drawImage(part.canvas, x, y, w, h);
	}
	const parts = DHONI_EYES.eyes.map((eye, i) => {
		const iris = surface(56, 66),
			brow = surface(172, 46);
		iris.ctx.filter = 'brightness(0.7) saturate(0.7)';
		iris.ctx.drawImage(painted.get(eye.irisAsset)!, 0, 0, 56, 66);
		brow.ctx.filter = 'brightness(0.65)';
		brow.ctx.drawImage(painted.get(eye.browAsset)!, 0, 0, 172, 46);
		const lid = surface(49 * 4, 31 * 4),
			work = surface(49 * 4, 31 * 4),
			x = DHONI_BLINK.eyes[i].target[0];
		lid.ctx.drawImage(lids, x, 123, 49, 31, 0, 0, lid.canvas.width, lid.canvas.height);
		lid.ctx.save();
		lid.ctx.scale(lid.canvas.width, lid.canvas.height);
		const gradient = lid.ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
		gradient.addColorStop(0.65, '#fff');
		gradient.addColorStop(1, 'transparent');
		lid.ctx.globalCompositeOperation = 'destination-in';
		lid.ctx.fillStyle = gradient;
		lid.ctx.fillRect(0, 0, 1, 1);
		lid.ctx.restore();
		return { iris: iris.canvas, brow: brow.canvas, lid: lid.canvas, work, x };
	});
	// Mouth artwork is optional: failed textures preserve the approved original mouth.
	let mouths: (HTMLCanvasElement | null)[] = [null, null],
		mouthVersion = 0;
	void Promise.all(
		[DHONI_MOUTH.smile, DHONI_MOUTH.composed].map(async (url) => {
			try {
				const image = await painting(url),
					part = surface(210, 102);
				part.ctx.drawImage(image, 0, 0, 210, 102);
				fadeEdges(part, 0.1, 0.18);
				return part.canvas;
			} catch {
				return null;
			}
		})
	).then((loaded) => {
		mouths = loaded;
		mouthVersion++;
	});
	let key = '';
	return {
		canvas: out.canvas,
		get mouthReady() {
			return mouths.every(Boolean);
		},
		draw(frame: PresenceFrame) {
			const next = [
				frame.eyes.x,
				frame.eyes.y,
				frame.brow,
				frame.blink,
				frame.mouth,
				mouthVersion
			].join(':');
			if (next === key) return false;
			key = next;
			const pose = facialPose(frame),
				ctx = out.ctx;
			ctx.clearRect(0, 0, 360, 360);
			ctx.drawImage(base.canvas, 0, 0);
			for (const [i, eye] of DHONI_EYES.eyes.entries()) {
				const part = parts[i],
					aperture = new Path2D(eyeAperture(eye.aperture, pose.closure));
				ctx.save();
				ctx.clip(aperture);
				ctx.drawImage(
					part.iris,
					eye.iris[0] + pose.x,
					eye.iris[1] + pose.y,
					eye.iris[2],
					eye.iris[3]
				);
				ctx.restore();
				const work = part.work;
				work.ctx.clearRect(0, 0, work.canvas.width, work.canvas.height);
				work.ctx.drawImage(part.lid, 0, 0);
				work.ctx.save();
				work.ctx.scale(4, 4);
				work.ctx.translate(-part.x, -123);
				work.ctx.globalCompositeOperation = 'destination-out';
				work.ctx.fill(aperture);
				work.ctx.restore();
				ctx.drawImage(work.canvas, part.x, 123, 49, 31);
				const [x, y, w, h] = eye.brow,
					p = pose.brows[i];
				ctx.save();
				ctx.translate(x + w / 2, y + h / 2 + p.y);
				ctx.rotate((p.rotation * Math.PI) / 180);
				ctx.drawImage(part.brow, -w / 2, -h / 2, w, h);
				ctx.restore();
			}
			if (mouths.every(Boolean)) {
				const mouth = mouthPose(frame),
					[x, y, w, h] = DHONI_MOUTH.target;
				for (const [i, alpha] of [mouth.smile, mouth.composed].entries())
					if (alpha > 0) {
						ctx.globalAlpha = alpha;
						ctx.drawImage(mouths[i]!, x, y, w, h);
					}
				ctx.globalAlpha = 1;
			}
			ctx.save();
			ctx.globalCompositeOperation = 'destination-in';
			ctx.fill(new Path2D(DHONI_HEAD.outline));
			ctx.restore();
			return true;
		}
	};
}
