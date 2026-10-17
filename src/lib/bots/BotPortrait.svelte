<script lang="ts">
	import { asset } from '$app/paths';
	import { BOT_CHARACTERS } from '#lib/mascots/bots.js';
	let {
		mascotId,
		name = '',
		size = 180
	}: { mascotId?: string | null; name?: string; size?: number } = $props();
	const known = $derived(BOT_CHARACTERS.some((bot) => bot.mascotId === mascotId));
</script>

<span
	class="portrait"
	role="img"
	aria-label={name || 'Club character'}
	style:--portrait-size={`${size}px`}
	style:background-image={known
		? `url("${asset(`mascots/${mascotId}/signature/directions.webp` as Parameters<typeof asset>[0])}")`
		: undefined}
>
	{#if !known}<span aria-hidden="true">♠</span>{/if}
</span>

<style>
	.portrait {
		display: inline-grid;
		place-items: center;
		flex-shrink: 0;
		width: var(--portrait-size);
		height: var(--portrait-size);
		max-width: 100%;
		background-size: 300% 300%;
		background-position: 50% 50%;
		background-repeat: no-repeat;
	}
	.portrait span {
		color: #d9bc75;
		font-size: min(4rem, var(--portrait-size));
	}
</style>
