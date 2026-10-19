<script lang="ts">
	import { onMount } from 'svelte';
	import FacialEyes from './FacialEyes.svelte';
	import PerspectiveHead from './PerspectiveHead.svelte';
	import { DHONI_ART, DHONI_PRESENCE } from './personality.js';
	import { DHONI_HEAD, headPose } from './head-rig.js';
	import { DHONI_BODY, bodyPose } from './body-rig.js';
	import type { Personality, PresenceFrame } from './types.js';
	let {
		personality = DHONI_PRESENCE,
		breathing = true,
		perspective = false,
		onerror,
		onFaceError
	}: {
		personality?: Readonly<Personality>;
		breathing?: boolean;
		perspective?: boolean;
		onerror: () => void;
		onFaceError: () => void;
	} = $props();
	const uid = $props.id();
	let neckReady = $state(false);
	let faceReadyMode = $state<string | null>(null);
	let perspectiveFailed = $state(false);
	const renderMode = $derived(perspective && !perspectiveFailed ? 'depth-mesh' : 'layered');
	const ready = $derived(neckReady && faceReadyMode === renderMode);
	let neckPreload: HTMLImageElement;
	let headLayer: HTMLDivElement;
	let bodyLayer: SVGSVGElement;
	let face = $state<{ draw(frame: PresenceFrame): void }>();
	onMount(() => {
		if (neckPreload.complete && neckPreload.naturalWidth > 0) neckReady = true;
	});
	export function draw(frame: PresenceFrame) {
		const pose = headPose(frame, personality);
		const body = bodyPose({ breath: breathing ? frame.breath : 0 });
		if (bodyLayer) bodyLayer.style.transform = `scale(${body.scaleX}, ${body.scaleY})`;
		if (headLayer)
			headLayer.style.transform = `translate(${(pose.x / 360) * 100}%, ${(pose.y / 360) * 100}%) rotate(${pose.roll}deg)`;
		face?.draw({ ...frame, eyes: pose.eyes });
	}
	const [x, y, w, h] = DHONI_HEAD.neckSource;
	const neckCrop = `background-size:${(360 / w) * 100}% ${(360 / h) * 100}%;background-position:${(x / (360 - w)) * 100}% ${(y / (360 - h)) * 100}%`;
</script>

<div
	class="separated-character"
	data-testid="head-character"
	data-art-ready={ready}
	data-head-mode={renderMode}
>
	{#if !ready}<div class="original" style:background-image="url({DHONI_ART.portrait})"></div>{/if}
	<div class="parts" class:ready>
		<svg
			class="body"
			bind:this={bodyLayer}
			viewBox="0 0 360 360"
			aria-hidden="true"
			data-testid="breathing-body"
			style:transform-origin="{(DHONI_BODY.pivot[0] / 360) * 100}% {(DHONI_BODY.pivot[1] / 360) *
				100}%"
		>
			<defs>
				<mask id="{uid}-body" maskUnits="userSpaceOnUse" x="0" y="0" width="360" height="360">
					<rect width="360" height="360" fill="white" />
					<path d={DHONI_HEAD.outline} fill="black" />
				</mask>
				<clipPath id="{uid}-head" clipPathUnits="objectBoundingBox"
					><path d={DHONI_HEAD.outline} transform="scale(0.002777777778)" /></clipPath
				>
			</defs>
			<image href={DHONI_ART.portrait} width="360" height="360" mask="url(#{uid}-body)" />
		</svg>
		<div
			class="neck"
			data-testid="fixed-neck"
			style="left:{(DHONI_HEAD.neckTarget[0] / 360) * 100}%;top:{(DHONI_HEAD.neckTarget[1] / 360) *
				100}%;width:{(DHONI_HEAD.neckTarget[2] / 360) * 100}%;height:{(DHONI_HEAD.neckTarget[3] /
				360) *
				100}%;{neckCrop};background-image:url({DHONI_HEAD.neck})"
		></div>
		<div
			class="head-motion"
			bind:this={headLayer}
			style:transform-origin="{(DHONI_HEAD.pivot[0] / 360) * 100}% {(DHONI_HEAD.pivot[1] / 360) *
				100}%"
			data-testid="moving-head"
		>
			{#if perspective && !perspectiveFailed}
				<PerspectiveHead
					bind:this={face}
					onready={() => {
						if (renderMode === 'depth-mesh') faceReadyMode = 'depth-mesh';
					}}
					onerror={() => {
						faceReadyMode = null;
						perspectiveFailed = true;
					}}
				/>
			{:else}<div class="head-clip" style:clip-path="url(#{uid}-head)">
					<FacialEyes
						bind:this={face}
						onready={() => {
							if (renderMode === 'layered') faceReadyMode = 'layered';
						}}
						onerror={onFaceError}
					/>
				</div>{/if}
		</div>
	</div>
	<img
		class="preload"
		bind:this={neckPreload}
		src={DHONI_HEAD.neck}
		alt=""
		onload={() => (neckReady = true)}
		{onerror}
	/>
</div>

<style>
	.separated-character,
	.parts,
	.original,
	.body,
	.head-motion,
	.head-clip {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.separated-character {
		clip-path: inset(8% 0 25%);
	}
	.original {
		background-size: 100% 100%;
		background-position: 50% 50%;
		background-repeat: no-repeat;
	}
	.parts {
		opacity: 0;
	}
	.parts.ready {
		opacity: 1;
	}
	.body {
		pointer-events: none;
		z-index: 1;
	}
	.neck {
		position: absolute;
		background-repeat: no-repeat;
		z-index: 0;
	}
	.head-motion {
		pointer-events: none;
		z-index: 2;
	}
	.preload {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
