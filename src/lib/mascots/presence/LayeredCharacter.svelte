<script lang="ts">
	import type { RigAssets } from './types.js';
	let { rig }: { rig: RigAssets } = $props();
</script>

<!-- Renderer for real separated artwork only. Prototype has no rig and never enters here.
     Full-canvas textures share the original registration. Eye apertures clip pupils and lids. -->
<div class="body"><img src={rig.body} alt="" /></div>
<img class="neck" src={rig.neck} alt="" />
<div class="head">
	{#if rig.hairBack}<img src={rig.hairBack} alt="" />{/if}
	<img src={rig.head} alt="" />
	{#each Object.entries(rig.eyes) as [side, eye] (side)}
		<div
			class="eye"
			data-eye={side}
			style:clip-path="inset({eye.bounds[1] * 100}% {(1 - eye.bounds[0] - eye.bounds[2]) * 100}% {(1 -
				eye.bounds[1] -
				eye.bounds[3]) *
				100}% {eye.bounds[0] * 100}%)"
		>
			<img src={eye.sclera} alt="" />
			<img
				class="pupil"
				src={eye.pupil}
				alt=""
				style:--travel-x="{eye.pupilTravel.x * 100}%"
				style:--travel-y="{eye.pupilTravel.y * 100}%"
			/>
			<img
				class="upper-lid"
				src={eye.upperLid}
				alt=""
				style:--lid-travel="{eye.upperTravel * 100}%"
			/>
			<img
				class="lower-lid"
				src={eye.lowerLid}
				alt=""
				style:--lid-travel="{eye.lowerTravel * 100}%"
			/>
		</div>
	{/each}
	<img class="brow" src={rig.browLeft} alt="" />
	<img class="brow" src={rig.browRight} alt="" />
	<img src={rig.mouth} alt="" />
	{#if rig.hairFront}<img src={rig.hairFront} alt="" />{/if}
</div>

<style>
	img,
	.head,
	.body,
	.eye {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
	}
	.body {
		transform: scaleY(var(--breath-scale, 1));
		transform-origin: 50% 74%;
	}
	.head {
		transform: translate(var(--portrait-x, 0%), var(--portrait-y, 0%))
			rotate(var(--head-roll, 0deg));
		transform-origin: 50% 69%;
	}
	.pupil {
		transform: translate(
			calc(var(--eye-x, 0) * var(--travel-x)),
			calc(var(--eye-y, 0) * var(--travel-y))
		);
	}
	.upper-lid {
		transform: translateY(calc(var(--blink, 0) * var(--lid-travel)));
	}
	.lower-lid {
		transform: translateY(calc(var(--blink, 0) * var(--lid-travel) * -1));
	}
	.brow {
		transform: translateY(calc(var(--brow, 0) * -1%));
	}
</style>
