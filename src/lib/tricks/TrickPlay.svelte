<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import type { Play, Suit } from './types.js';

	/** The cards of the current (or last) trick on the felt, each pushed toward the seat that played it. */
	let {
		plays,
		winner = null,
		placeOf
	}: {
		plays: Play[];
		winner?: string | null;
		placeOf: (id: string) => string;
	} = $props();
</script>

<div class="trick">
	{#each plays as p (p.id + p.card.rank + p.card.suit)}
		<div class="played at-{placeOf(p.id)}" class:won={winner === p.id}>
			<DeckCard rank={p.card.rank} suit={p.card.suit as Suit} class="!h-24 !w-auto" />
		</div>
	{/each}
</div>

<style>
	.trick {
		position: relative;
		width: 15rem;
		height: 12rem;
	}
	.played {
		position: absolute;
		left: 50%;
		top: 50%;
		filter: drop-shadow(0 6px 10px rgb(0 0 0 / 45%));
		animation: land 0.3s ease-out;
	}
	.at-bottom {
		translate: -50% -10%;
	}
	.at-top {
		translate: -50% -95%;
	}
	.at-left {
		translate: -125% -55%;
		rotate: -8deg;
	}
	.at-right {
		translate: 25% -55%;
		rotate: 8deg;
	}
	.at-upper-left {
		translate: -115% -85%;
		rotate: -10deg;
	}
	.at-upper-right {
		translate: 15% -85%;
		rotate: 10deg;
	}
	.won {
		filter: drop-shadow(0 0 14px #f2dc91);
	}
	@keyframes land {
		from {
			opacity: 0;
			scale: 0.9;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.played {
			animation: none;
		}
	}
	@media (max-width: 760px) {
		.trick {
			width: 12rem;
			height: 10rem;
		}
		.played :global(*) {
			height: 4.6rem !important;
		}
	}
</style>
