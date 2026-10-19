<script lang="ts">
	import { onMount } from 'svelte';
	import { DHONI_MOUTH, mouthPose } from './mouth-rig.js';
	import type { PresenceFrame } from './types.js';
	const textures = [DHONI_MOUTH.smile, DHONI_MOUTH.composed];
	const loaded: string[] = [];
	let root: HTMLDivElement;
	let patches: HTMLDivElement[] = [];
	let ready = $state(false),
		failed = $state(false);
	function assetLoaded(src: string) {
		if (!loaded.includes(src)) loaded.push(src);
		if (loaded.length === textures.length && !failed) ready = true;
	}
	onMount(() => {
		patches = [...root.querySelectorAll<HTMLDivElement>('.mouth-pose')];
		root.querySelectorAll<HTMLImageElement>('.preload').forEach((image) => {
			if (image.complete && image.naturalWidth > 0) assetLoaded(image.getAttribute('src')!);
		});
	});
	export function draw(frame: PresenceFrame) {
		const pose = mouthPose(frame);
		patches.forEach((node, i) => (node.style.opacity = String(i ? pose.composed : pose.smile)));
	}
</script>

<div
	class="mouth"
	bind:this={root}
	data-testid="mouth-parts"
	data-art-ready={ready && !failed}
	data-mode={failed ? 'original-fallback' : ready ? 'painted-poses' : 'loading'}
	style:left="{(DHONI_MOUTH.target[0] / 360) * 100}%"
	style:top="{(DHONI_MOUTH.target[1] / 360) * 100}%"
	style:width="{(DHONI_MOUTH.target[2] / 360) * 100}%"
	style:height="{(DHONI_MOUTH.target[3] / 360) * 100}%"
>
	<div class="poses" class:ready={ready && !failed}>
		{#each textures as src, i (src)}
			<div
				class="mouth-pose"
				data-mouth-pose={i ? 'composed' : 'smile'}
				style:background-image="url({src})"
			></div>
		{/each}
	</div>
	{#each textures as src (src)}
		<img
			class="preload"
			{src}
			alt=""
			onload={() => assetLoaded(src)}
			onerror={() => (failed = true)}
		/>
	{/each}
</div>

<style>
	.mouth {
		position: absolute;
		pointer-events: none;
	}
	.poses,
	.mouth-pose {
		position: absolute;
		inset: 0;
		opacity: 0;
	}
	.poses.ready {
		opacity: 1;
	}
	.poses {
		mask-image:
			linear-gradient(to right, transparent, #000 10%, #000 90%, transparent),
			linear-gradient(transparent, #000 18%, #000 82%, transparent);
		mask-composite: intersect;
	}
	.mouth-pose {
		background-size: 100% 100%;
		background-repeat: no-repeat;
	}
	.preload {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
