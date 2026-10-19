<script lang="ts">
	import { DHONI_ART } from './personality.js';
	import { DHONI_BLINK } from './blink-art.js';
	let { onerror }: { onerror: () => void } = $props();
	function crop(box: readonly number[]) {
		const [x, y, w, h] = box;
		// The supplied atlases have different resolutions: cell-space registration
		// keeps the painted lids aligned without resampling the original portrait.
		return `background-size:${(1080 / w) * 100}% ${(1080 / h) * 100}%;background-position:${((360 + x) / (1080 - w)) * 100}% ${((360 + y) / (1080 - h)) * 100}%`;
	}
</script>

<div class="face" style:background-image="url({DHONI_ART.atlas})">
	{#each DHONI_BLINK.eyes as eye, i (i)}
		<div
			class="eye"
			data-eye={i}
			style:left="{(eye.target[0] / 360) * 100}%"
			style:top="{(eye.target[1] / 360) * 100}%"
			style:width="{(eye.target[2] / 360) * 100}%"
			style:height="{(eye.target[3] / 360) * 100}%"
		>
			<div class="lid half" style="{crop(eye.half)};background-image:url({DHONI_BLINK.half})"></div>
			<div
				class="lid closed"
				style="{crop(eye.closed)};background-image:url({DHONI_BLINK.closed})"
			></div>
		</div>
	{/each}
</div>
<!-- Preload both paintings; a failed request uses the existing mascot fallback. -->
{#each [DHONI_ART.atlas, DHONI_BLINK.half, DHONI_BLINK.closed] as src (src)}
	<img class="preload" {src} alt="" {onerror} />
{/each}

<style>
	.face {
		position: absolute;
		inset: 0;
		background-size: 300% 300%;
		background-position: 50% 50%;
		background-repeat: no-repeat;
		clip-path: inset(8% 0 25%);
	}
	.eye {
		position: absolute;
		mask-image:
			radial-gradient(ellipse, #000 76%, transparent 100%),
			linear-gradient(transparent 17%, #000 23%);
		mask-composite: intersect;
	}
	.lid {
		position: absolute;
		inset: 0;
		opacity: 0;
		background-repeat: no-repeat;
	}
	:global([data-blink-stage='half']) .half,
	:global([data-blink-stage='closed']) .closed {
		opacity: 1;
	}
	.preload {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
</style>
