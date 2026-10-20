<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import type { GameGuide } from './catalog.js';
	let { game, compact = false }: { game: GameGuide; compact?: boolean } = $props();
</script>

<div class="demo" class:compact aria-label={game.example} role="img">
	<div class="deal-ring" aria-hidden="true"></div>
	<div class="fan" aria-hidden="true">
		{#each game.cards as card, index (`${game.id}-${index}`)}
			<div
				class="demo-card"
				class:wild={card.wild}
				style:--i={index}
				style:--offset={index - (game.cards.length - 1) / 2}
			>
				<DeckCard
					rank={card.rank}
					suit={card.suit as 'spades' | 'hearts' | 'diamonds' | 'clubs'}
					faceDown={game.id === 'pot-blind-1'}
					class="!h-full !w-full"
				/>
				{#if card.wild}<span class="wild-mark">★</span>{/if}
			</div>
		{/each}
	</div>
	{#if !compact}<div class="example">
			<span class="example-label">Example hand</span>
			<p>{game.example}</p>
		</div>{/if}
</div>

<style>
	.demo {
		--card-w: clamp(112px, 10vw, 142px);
		--card-h: calc(var(--card-w) * 10 / 7);
		position: relative;
		display: grid;
		place-items: center;
		gap: 30px;
		min-height: 350px;
		padding: 32px 12px 12px;
		isolation: isolate;
	}
	.fan {
		position: relative;
		width: 100%;
		height: calc(var(--card-h) + 24px);
	}
	.demo-card {
		position: absolute;
		left: calc(50% - var(--card-w) / 2);
		bottom: 0;
		width: var(--card-w);
		height: var(--card-h);
		transform: translateX(calc(var(--offset) * var(--card-w) * 0.62))
			rotate(calc(var(--offset) * 11deg));
		transform-origin: 50% 100%;
		filter: drop-shadow(0 12px 9px #0004);
		transition:
			translate 0.35s,
			filter 0.35s;
	}
	.demo-card:nth-child(2) {
		z-index: 2;
	}
	.demo-card:nth-child(3) {
		z-index: 3;
	}
	.demo-card:nth-child(4) {
		z-index: 4;
	}
	.demo:hover .demo-card {
		translate: 0 calc(var(--offset) * -3px - 5px);
		filter: drop-shadow(0 18px 12px #0005);
	}
	.deal-ring {
		position: absolute;
		inset: 16% 7% 21%;
		border: 1px solid #ffffff15;
		border-radius: 50%;
		rotate: -9deg;
		z-index: -1;
	}
	.deal-ring:after {
		content: '';
		position: absolute;
		inset: 10px;
		border: 1px dashed #ffffff12;
		border-radius: inherit;
	}
	.wild-mark {
		position: absolute;
		right: -5px;
		top: -7px;
		display: grid;
		place-items: center;
		width: 25px;
		height: 25px;
		border: 2px solid var(--surface);
		border-radius: 50%;
		background: var(--butter);
		color: var(--night);
		box-shadow: 0 2px 5px #0003;
		font-size: 14px;
	}
	.example {
		text-align: center;
		max-width: 100%;
	}
	.example-label {
		display: block;
		color: #ffffffa6;
		font-size: 10px;
		margin-bottom: 8px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	p {
		margin: 0;
		max-width: 360px;
		color: var(--paper);
		font-size: 13px;
		line-height: 1.5;
	}
	.compact {
		--card-w: 76px;
		min-height: 162px;
		padding: 20px 0 12px;
		gap: 0;
	}
	.compact .deal-ring {
		inset: 25% 4% 10%;
	}
	.compact .wild-mark {
		width: 18px;
		height: 18px;
		font-size: 10px;
	}
	@media (max-width: 600px) {
		.demo {
			--card-w: clamp(72px, 23vw, 110px);
			min-height: 280px;
			gap: 24px;
			padding-top: 24px;
		}
		.compact {
			--card-w: clamp(38px, 12vw, 52px);
			min-height: 146px;
			padding-top: 18px;
		}
		.demo-card {
			filter: drop-shadow(0 8px 6px #0003);
		}
		p {
			font-size: 12px;
		}
		.example-label {
			font-size: 9px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.demo-card {
			transition: none;
		}
		.demo:hover .demo-card {
			translate: none;
		}
	}
</style>
