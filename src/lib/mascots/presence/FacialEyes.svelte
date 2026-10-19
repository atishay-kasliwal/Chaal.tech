<script lang="ts">
	import { onMount } from 'svelte';
	import { DHONI_ART } from './personality.js';
	import { DHONI_BLINK } from './blink-art.js';
	import { DHONI_EYES, eyeAperture, facialPose } from './eye-rig.js';
	import Mouth from './Mouth.svelte';
	import type { PresenceFrame } from './types.js';
	let { onerror, onready }: { onerror: () => void; onready?: () => void } = $props();
	const uid = $props.id();
	const assets: string[] = [
		DHONI_ART.portrait,
		DHONI_EYES.clean,
		...DHONI_EYES.eyes.flatMap((eye) => [eye.irisAsset, eye.browAsset]),
		DHONI_EYES.closed
	];
	const loaded: string[] = [];
	let ready = $state(false);
	function assetLoaded(src: string) {
		if (!assets.includes(src)) return;
		if (!loaded.includes(src)) loaded.push(src);
		if (!ready && loaded.length === assets.length) {
			ready = true;
			onready?.();
		}
	}
	let root: HTMLDivElement;
	let mouth = $state<{ draw(frame: PresenceFrame): void }>();
	let pupils: SVGGElement[] = [],
		brows: SVGGElement[] = [],
		apertures: SVGPathElement[] = [];
	onMount(() => {
		pupils = [...root.querySelectorAll<SVGGElement>('.pupil')];
		brows = [...root.querySelectorAll<SVGGElement>('.brow')];
		apertures = [...root.querySelectorAll<SVGPathElement>('[data-aperture]')];
		// Cached images may finish before hydration attaches the load listeners.
		root.querySelectorAll<HTMLImageElement>('.preload').forEach((image) => {
			if (image.complete && image.naturalWidth > 0) assetLoaded(image.getAttribute('src')!);
		});
	});
	export function draw(frame: PresenceFrame) {
		mouth?.draw(frame);
		const pose = facialPose(frame);
		pupils.forEach((node) => node.setAttribute('transform', `translate(${pose.x} ${pose.y})`));
		brows.forEach((node, i) => {
			const [x, y, w, h] = DHONI_EYES.eyes[i].brow;
			node.setAttribute(
				'transform',
				`translate(0 ${pose.brows[i].y}) rotate(${pose.brows[i].rotation} ${x + w / 2} ${y + h / 2})`
			);
		});
		apertures.forEach((node) =>
			node.setAttribute(
				'd',
				eyeAperture(DHONI_EYES.eyes[Number(node.dataset.aperture)].aperture, pose.closure)
			)
		);
	}
	function crop(box: readonly number[]) {
		const [x, y, w, h] = box;
		return `background-size:${(360 / w) * 100}% ${(360 / h) * 100}%;background-position:${(x / (360 - w)) * 100}% ${(y / (360 - h)) * 100}%`;
	}
</script>

<div
	class="face"
	bind:this={root}
	style:background-image="url({DHONI_ART.portrait})"
	data-testid="facial-eyes"
	data-art-ready={ready}
>
	<div class="features" class:ready>
		{#each DHONI_EYES.cleanPatches as patch, i (i)}
			<div
				class="clean"
				style="left:{(patch.target[0] / 360) * 100}%;top:{(patch.target[1] / 360) *
					100}%;width:{(patch.target[2] / 360) * 100}%;height:{(patch.target[3] / 360) *
					100}%;{crop(patch.source)};background-image:url({DHONI_EYES.clean})"
			></div>
		{/each}
		<svg class="layers" viewBox="0 0 360 360" aria-hidden="true">
			<defs>
				{#each DHONI_EYES.eyes as eye, i (i)}
					<clipPath id="{uid}-eye-{i}"
						><path data-aperture={i} d={eyeAperture(eye.aperture, 0)} /></clipPath
					>
				{/each}
				<radialGradient id="{uid}-feather"
					><stop offset="65%" stop-color="white" /><stop
						offset="100%"
						stop-color="black"
					/></radialGradient
				>
				<mask id="{uid}-lids" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="360">
					{#each DHONI_EYES.eyes as eye, i (i)}
						<rect
							x={DHONI_BLINK.eyes[i].target[0]}
							y="123"
							width="49"
							height="31"
							fill="url(#{uid}-feather)"
						/>
						<path data-aperture={i} d={eyeAperture(eye.aperture, 0)} fill="black" />
					{/each}
				</mask>
			</defs>
			{#each DHONI_EYES.eyes as eye, i (i)}
				<g clip-path="url(#{uid}-eye-{i})">
					<g class="pupil" data-pupil={i}>
						<image
							href={eye.irisAsset}
							x={eye.iris[0]}
							y={eye.iris[1]}
							width={eye.iris[2]}
							height={eye.iris[3]}
							preserveAspectRatio="none"
						/>
					</g>
				</g>
			{/each}
			<image
				class="painted-lids"
				href={DHONI_EYES.closed}
				width="360"
				height="360"
				mask="url(#{uid}-lids)"
			/>
			{#each DHONI_EYES.eyes as eye, i (i)}
				<g class="brow" data-brow={i}>
					<image
						href={eye.browAsset}
						x={eye.brow[0]}
						y={eye.brow[1]}
						width={eye.brow[2]}
						height={eye.brow[3]}
						preserveAspectRatio="none"
					/>
				</g>
			{/each}
		</svg>
		<Mouth bind:this={mouth} />
	</div>
	{#each assets as src (src)}
		<img class="preload" {src} alt="" onload={() => assetLoaded(src)} {onerror} />
	{/each}
</div>

<style>
	.face {
		position: absolute;
		inset: 0;
		background-size: 100% 100%;
		background-position: 50% 50%;
		background-repeat: no-repeat;
		clip-path: inset(8% 0 25%);
	}
	.clean {
		position: absolute;
		background-repeat: no-repeat;
		mask-image:
			linear-gradient(to right, transparent, #000 8%, #000 92%, transparent),
			linear-gradient(transparent, #000 12%, #000 88%, transparent);
		mask-composite: intersect;
	}
	.features {
		position: absolute;
		inset: 0;
		opacity: 0;
	}
	.features.ready {
		opacity: 1;
	}
	.layers {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}
	.pupil {
		filter: brightness(0.7) saturate(0.7);
	}
	.brow {
		filter: brightness(0.65);
	}
	.preload {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
