<script lang="ts">
	import type { Snippet } from 'svelte';
	import DeckCard from '#lib/components/DeckCard.svelte';
	import type { Card, Suit } from './types.js';

	/** Your cards in the dock: playable ones lift and take a tap; trumps carry a gold edge. */
	let {
		cards,
		playable,
		onpick,
		trump = null,
		active = false,
		busy = false,
		after
	}: {
		cards: Card[];
		playable: (c: Card) => boolean;
		onpick: (c: Card) => void;
		trump?: string | null;
		active?: boolean;
		busy?: boolean;
		after?: Snippet;
	} = $props();
</script>

<div class="hand" class:active aria-label="Your cards">
	{#each cards as c (c.rank + c.suit)}
		{@const ok = playable(c)}
		<button
			class="hand-card"
			class:ok
			class:trumpc={trump && c.suit === trump}
			disabled={!ok || busy}
			onclick={() => onpick(c)}
			aria-label="{c.rank} of {c.suit}{ok ? '' : ' (not playable now)'}"
			><DeckCard rank={c.rank} suit={c.suit as Suit} class="!h-full !w-auto" /></button
		>
	{/each}
	{@render after?.()}
</div>

<style>
	.hand {
		display: flex;
		justify-content: center;
		height: clamp(5.5rem, 13dvh, 8.5rem);
		padding-top: 0.6rem;
	}
	.hand-card {
		height: 100%;
		margin-left: -1.6rem;
		filter: brightness(0.62);
		transition:
			translate 0.2s,
			filter 0.2s;
		cursor: default;
	}
	.hand-card:first-child {
		margin-left: 0;
	}
	.hand:not(.active) .hand-card {
		filter: none;
	}
	.hand-card.ok {
		filter: none;
		cursor: pointer;
	}
	.hand-card.ok:hover,
	.hand-card.ok:focus-visible {
		translate: 0 -0.7rem;
	}
	.hand-card.trumpc {
		box-shadow: 0 -4px 0 #f2dc91;
		border-radius: 0.6rem;
	}
	@media (max-width: 760px) {
		.hand {
			flex-wrap: wrap;
			height: auto;
			gap: 0.3rem;
		}
		.hand-card {
			height: 4.6rem;
			margin-left: 0;
		}
	}
</style>
