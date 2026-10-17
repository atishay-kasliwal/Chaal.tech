<script lang="ts">
	import PlayingCard from '#lib/components/PlayingCard.svelte';
	import type { GameGuide } from './catalog.js';
	let { game, compact = false }: { game: GameGuide; compact?: boolean } = $props();
</script>

<div class="demo" class:compact aria-label={game.example} role="img">
	<span class="scene-number" aria-hidden="true"
		>{game.id === 'blackjack'
			? '21'
			: game.id === 'rummy'
				? '13'
				: game.id.includes('muflis')
					? '↓'
					: game.id === '999-1'
						? '999'
						: game.id === 'texas-holdem'
							? '♠'
							: game.cards.length}</span
	>
	<div class="fan" aria-hidden="true">
		{#each game.cards as card, index (`${game.id}-${index}`)}
			<div
				class="demo-card"
				class:wild={card.wild}
				style:--i={index}
				style:--offset={index - (game.cards.length - 1) / 2}
			>
				<PlayingCard
					rank={card.rank}
					suit={card.suit}
					faceDown={game.id === 'pot-blind-1'}
					class="!h-full !w-full"
				/>
				{#if card.wild}<span class="wild-mark">★</span>{/if}
			</div>
		{/each}
	</div>
	{#if !compact}<p>{game.example}</p>{/if}
</div>

<style>
	.demo {
		--card-w: 92px;
		--card-h: 132px;
		position: relative;
		display: grid;
		place-items: center;
		gap: 18px;
		min-height: 300px;
		padding: 22px 12px 16px;
		isolation: isolate;
	}
	.compact {
		--card-w: 51px;
		--card-h: 74px;
		min-height: 112px;
		padding: 18px 8px;
	}
	.scene-number {
		position: absolute;
		z-index: -1;
		top: 0;
		left: 10%;
		font:
			900 200px/1 system-ui,
			sans-serif;
		letter-spacing: -0.1em;
		opacity: 0.09;
		pointer-events: none;
	}
	.compact .scene-number {
		font-size: 115px;
		top: 15px;
	}
	.fan {
		position: relative;
		width: 100%;
		height: calc(var(--card-h) + 10px);
	}
	.demo-card {
		position: absolute;
		left: calc(50% - var(--card-w) / 2);
		bottom: 0;
		width: var(--card-w);
		height: var(--card-h);
		transform: translateX(calc(var(--offset) * var(--card-w) * 0.58))
			rotate(calc(var(--offset) * 9deg));
		transform-origin: 50% 100%;
		filter: drop-shadow(0 7px 5px #0005);
		animation: deal-in 650ms calc(var(--i) * 100ms) both;
	}
	.wild-mark {
		position: absolute;
		right: -6px;
		top: -7px;
		display: grid;
		place-items: center;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #efd08b;
		color: #34250e;
		box-shadow: 0 1px 5px #0005;
		font-size: 13px;
	}
	p {
		margin: 0;
		max-width: 300px;
		text-align: center;
		color: currentColor;
		font-size: 12px;
		line-height: 1.5;
	}
	@keyframes deal-in {
		from {
			opacity: 0;
			translate: 0 -18px;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.demo-card {
			animation: none;
		}
	}
</style>
