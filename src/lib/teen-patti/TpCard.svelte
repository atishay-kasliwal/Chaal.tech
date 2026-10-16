<script lang="ts">
	import { asset } from '$app/paths';
	import { club } from '#lib/club/club.svelte.js';
	import ClassicCard from '#lib/components/ClassicCard.svelte';

	/**
	 * One card at a size the parent controls through --card-h. Faces use the
	 * Cardmeister artwork; backs are drawn here so every back matches the table.
	 */
	let {
		card,
		faceUp = false,
		flip = false,
		deal = -1,
		dim = false,
		highlight = false,
		wild = false
	}: {
		card?: { rank: number; suit: string };
		faceUp?: boolean;
		/** Animate turning over when it first renders face up. */
		flip?: boolean;
		/** Stagger index for the deal animation; -1 skips it. */
		deal?: number;
		dim?: boolean;
		highlight?: boolean;
		/** Mark this card as a joker. */
		wild?: boolean;
	} = $props();
	const showFace = $derived(faceUp && !!card && card.rank > 0);
</script>

<div
	class="tp-card"
	class:flip={flip && showFace}
	class:deal={deal >= 0}
	class:dim
	class:highlight
	class:wild={wild && showFace}
	style:--deal-delay="{Math.max(deal, 0) * 90}ms"
	data-face={showFace ? 'up' : 'down'}
>
	{#if showFace && card}
		<ClassicCard rank={card.rank} suit={card.suit} class="!h-full !w-full" />
		{#if wild}<span class="joker" title="Joker: counts as any card">★</span>{/if}
	{:else}
		<img
			class="back"
			src={asset(`cards/back-${club.settings.look.cardBack}.svg`)}
			alt=""
			aria-hidden="true"
			draggable="false"
		/>
	{/if}
</div>

<style>
	.tp-card {
		--h: var(--card-h, 5rem);
		position: relative;
		width: calc(var(--h) * 0.7);
		height: var(--h);
		flex-shrink: 0;
		border-radius: calc(var(--h) * 0.07);
		box-shadow:
			0 1px 0 rgb(255 255 255 / 6%) inset,
			0 calc(var(--h) * 0.04) calc(var(--h) * 0.12) rgb(0 0 0 / 45%);
		transition:
			transform 220ms ease,
			filter 220ms ease,
			opacity 220ms ease;
	}
	.tp-card :global(playing-card) {
		border-radius: calc(var(--h) * 0.07);
	}
	/* Card-stock finish over the face: a fine dimpled texture and a soft sheen from the lamp. */
	.tp-card[data-face='up']::after {
		position: absolute;
		inset: 0;
		z-index: 1;
		border-radius: inherit;
		background:
			linear-gradient(
				155deg,
				rgb(255 255 255 / 22%) 0%,
				transparent 38%,
				transparent 70%,
				rgb(0 0 0 / 5%) 100%
			),
			radial-gradient(circle at 50% 50%, rgb(0 0 0 / 5%) 0 0.5px, transparent 0.8px) 0 0 / 3px 3px;
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 6%);
		content: '';
		pointer-events: none;
	}
	/* A joker: a gold ring round the card and a small star on its bottom edge, clear of the
	   corner indexes so everyone can still read the card. */
	.tp-card.wild {
		box-shadow:
			0 0 0 2px #e2b862,
			0 0 calc(var(--h) * 0.18) rgb(226 184 98 / 45%),
			0 calc(var(--h) * 0.04) calc(var(--h) * 0.12) rgb(0 0 0 / 45%);
	}
	.joker {
		position: absolute;
		bottom: calc(var(--h) * -0.06);
		left: 50%;
		z-index: 2;
		display: grid;
		width: calc(var(--h) * 0.15);
		height: calc(var(--h) * 0.15);
		min-width: 0.9rem;
		min-height: 0.9rem;
		translate: -50% 0;
		place-items: center;
		border-radius: 999px;
		background: linear-gradient(150deg, #f7df9d, #c08a34);
		box-shadow: 0 1px 4px rgb(0 0 0 / 50%);
		color: #24180a;
		font-size: max(0.55rem, calc(var(--h) * 0.09));
		line-height: 1;
	}
	.tp-card.dim {
		filter: grayscale(0.85) brightness(0.55);
	}
	.tp-card.highlight {
		box-shadow:
			0 0 0 2px var(--tp-gold, #e2b862),
			0 0 calc(var(--h) * 0.25) rgb(226 184 98 / 55%);
	}
	/* Classic navy back, drawn in static/cards/back-navy.svg; the same either way up. */
	.back {
		display: block;
		width: 100%;
		height: 100%;
		max-width: none;
		border-radius: inherit;
		user-select: none;
	}
	.flip {
		animation: tp-flip 420ms cubic-bezier(0.3, 0.7, 0.3, 1) both;
	}
	.deal {
		animation: tp-deal 460ms cubic-bezier(0.2, 0.8, 0.25, 1) var(--deal-delay) both;
	}
	@keyframes tp-flip {
		from {
			transform: perspective(600px) rotateY(90deg);
		}
		to {
			transform: perspective(600px) rotateY(0);
		}
	}
	@keyframes tp-deal {
		from {
			opacity: 0;
			transform: translateY(-40%) scale(0.6) rotate(-8deg);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.flip,
		.deal {
			animation: none;
		}
	}
</style>
