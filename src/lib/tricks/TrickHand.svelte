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
		large = false,
		dealKey = '',
		after
	}: {
		cards: Card[];
		playable: (c: Card) => boolean;
		onpick: (c: Card) => void;
		trump?: string | null;
		active?: boolean;
		busy?: boolean;
		large?: boolean;
		dealKey?: string | number;
		after?: Snippet;
	} = $props();
</script>

<div
	class="hand"
	class:active
	class:large
	style:--overlaps={Math.max(0, cards.length - 1)}
	style:--mobile-overlaps={Math.max(0, Math.min(7, cards.length) - 1)}
	aria-label="Your cards"
>
	{#each cards as c, index (`${dealKey}:${c.rank}:${c.suit}`)}
		{@const ok = playable(c)}
		<button
			class="hand-card"
			class:ok
			class:trumpc={trump && c.suit === trump}
			disabled={!ok || busy}
			onclick={() => onpick(c)}
			aria-label="{c.rank} of {c.suit}{ok ? '' : ' (not playable now)'}"
			><span class="arrival" style:--delay="{index * 55}ms"
				><DeckCard rank={c.rank} suit={c.suit as Suit} class="!h-full !w-auto" /></span
			></button
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
	.arrival {
		display: block;
		height: 100%;
	}
	.large {
		--card-h: clamp(9rem, 21dvh, 13rem);
		--card-w: calc(var(--card-h) * 0.7);
		display: grid;
		grid-template-columns: repeat(var(--overlaps), minmax(0, var(--card-w))) var(--card-w);
		width: 100%;
		height: calc(var(--card-h) + 0.75rem);
		padding-top: 0.75rem;
	}
	.large .hand-card {
		width: var(--card-w);
		height: var(--card-h);
		margin-left: 0;
		text-align: left;
	}
	/* repeat(0, ...) is invalid when the hand is down to its final card. */
	.large:has(> .hand-card:only-child) {
		grid-template-columns: var(--card-w);
	}
	.large .arrival {
		animation: deliver 380ms cubic-bezier(0.2, 0.7, 0.25, 1) var(--delay) both;
	}
	@keyframes deliver {
		from {
			opacity: 0;
			transform: translateY(-7rem) rotate(-10deg) scale(0.8);
		}
		to {
			opacity: 1;
			transform: none;
		}
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
		.large {
			--card-h: clamp(6rem, 12dvh, 7rem);
			grid-template-columns: repeat(var(--mobile-overlaps), minmax(0, var(--card-w))) var(--card-w);
			height: auto;
			gap: 0.5rem 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.large .arrival {
			animation: none;
		}
		.hand-card {
			transition: none;
		}
	}
</style>
