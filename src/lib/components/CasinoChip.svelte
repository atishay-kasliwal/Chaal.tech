<script lang="ts">
	import { asset } from '$app/paths';

	/** Use a denomination for its face value; arbitrary balances belong beside the chip. */
	let {
		denomination = 25,
		size = 64,
		decorative = false,
		class: className = ''
	}: {
		denomination?: 5 | 10 | 20 | 25 | 50 | 100 | 200 | 500 | 1000;
		/** CSS length or pixel count. */
		size?: number | string;
		decorative?: boolean;
		class?: string;
	} = $props();
</script>

<img
	class="casino-chip {className}"
	src={asset(`chips/probo-player-${denomination}.svg`)}
	alt={decorative ? '' : `PROBO PLAYER CT ${denomination} chip`}
	aria-hidden={decorative ? true : undefined}
	width="256"
	height="256"
	style:--chip-size={typeof size === 'number' ? `${size}px` : size}
	draggable="false"
/>

<style>
	.casino-chip {
		display: inline-block;
		width: var(--chip-size);
		height: var(--chip-size);
		max-width: none;
		flex-shrink: 0;
		vertical-align: middle;
		object-fit: contain;
		user-select: none;
	}
</style>
