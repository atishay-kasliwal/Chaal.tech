<script lang="ts">
	import { Layers, RotateCw, Sparkles, Trash2 } from '@lucide/svelte';
	import PlayingCard from './PlayingCard.svelte';
	let {
		user,
		stockCount,
		legalActions,
		connected,
		action
	}: {
		user: User;
		stockCount: number;
		legalActions: RoomData['legalActions'];
		connected: boolean;
		action: (
			name: 'draw-stock' | 'draw-discard' | 'discard' | 'declare',
			index?: number
		) => Promise<boolean>;
	} = $props();
	let selectedIndex = $state<number | null>(null);
	const ownCards = $derived(user.cardsInHand);
	function select(index: number) {
		selectedIndex = selectedIndex === index ? null : index;
	}
	async function act(name: 'draw-stock' | 'draw-discard' | 'discard' | 'declare') {
		if ((name === 'discard' || name === 'declare') && selectedIndex === null) return;
		const ok = await action(name, selectedIndex ?? undefined);
		if (ok) selectedIndex = null;
	}
	function cardLabel(card: Card) {
		const rank =
			({ 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' } as Record<number, string>)[card.rank] ??
			String(card.rank);
		return `${rank} of ${card.suit}`;
	}
</script>

<div class="rummy-controls mt-2 w-full max-w-full" data-testid="rummy-controls">
	<div class="mb-2 flex flex-wrap items-center justify-center gap-2">
		{#if legalActions.drawStock}<button
				class="btn btn-primary btn-xs"
				onclick={() => void act('draw-stock')}
				disabled={!connected || stockCount === 0}
				><Layers class="h-3.5 w-3.5" />Draw stock · {stockCount}</button
			>{/if}
		{#if legalActions.drawDiscard}<button
				class="btn btn-outline btn-primary btn-xs"
				onclick={() => void act('draw-discard')}
				disabled={!connected}><RotateCw class="h-3.5 w-3.5" />Take discard</button
			>{/if}
		{#if legalActions.discard}<button
				class="btn btn-secondary btn-xs"
				onclick={() => void act('discard')}
				disabled={!connected || selectedIndex === null}
				><Trash2 class="h-3.5 w-3.5" />Discard selected</button
			>{/if}
		{#if legalActions.declare}<button
				class="btn btn-success btn-xs"
				onclick={() => void act('declare')}
				disabled={!connected || selectedIndex === null}
				><Sparkles class="h-3.5 w-3.5" />Declare</button
			>{/if}
	</div>
	<div
		class="rummy-hand flex w-full gap-1 overflow-x-auto px-1 pb-1"
		aria-label="Your 13-card hand"
		data-testid="rummy-hand"
	>
		{#each ownCards as card, index (`${card.rank}-${card.suit}-${card.copy ?? 0}-${index}`)}
			<button
				type="button"
				class="rummy-hand-card shrink-0 rounded-md transition-transform {selectedIndex === index
					? 'ring-primary -translate-y-1 ring-2'
					: 'hover:-translate-y-0.5'}"
				aria-label={`${cardLabel(card)}${selectedIndex === index ? ', selected' : ''}`}
				aria-pressed={selectedIndex === index}
				onclick={() => select(index)}
			>
				<PlayingCard
					rank={card.rank}
					suit={card.suit}
					faceDown={card.rank === 0}
					class="!h-14 !w-10 sm:!h-16 sm:!w-11"
				/>
			</button>
		{/each}
	</div>
	<p class="text-base-content/50 mt-1 text-[10px]" aria-live="polite">
		{#if !legalActions.drawStock && !legalActions.drawDiscard && !legalActions.discard}
			{user.cardCount ?? ownCards.length} cards · waiting for the next turn
		{:else if legalActions.discard}
			Choose a card to discard, or select one and declare a valid hand.
		{:else}
			Draw one card from the stock or discard pile.
		{/if}
	</p>
</div>

<style>
	.rummy-controls {
		position: fixed;
		z-index: 60;
		bottom: max(0.5rem, env(safe-area-inset-bottom));
		left: 50%;
		width: min(calc(100% - 2rem), 58rem);
		transform: translateX(-50%);
		padding: 0.55rem 0.85rem 0.45rem;
		border: 1px solid rgb(229 198 134 / 28%);
		border-radius: 1rem;
		background: rgb(10 20 17 / 96%);
		box-shadow: 0 0.8rem 2.2rem rgb(0 0 0 / 55%);
		backdrop-filter: blur(16px);
	}
	.rummy-hand-card {
		min-width: 2.5rem;
	}
	@media (max-width: 639px) {
		.rummy-controls {
			bottom: max(0.35rem, env(safe-area-inset-bottom));
			width: calc(100% - 0.7rem);
			padding: 0.4rem 0.35rem 0.35rem;
			border-radius: 0.8rem;
		}
		.rummy-controls > div:first-child {
			gap: 0.3rem;
			margin-bottom: 0.35rem;
		}
		.rummy-controls :global(.btn-xs) {
			min-height: 1.75rem;
			height: 1.75rem;
			gap: 0.25rem;
			padding-inline: 0.45rem;
			font-size: 0.65rem;
		}
		.rummy-hand {
			gap: 0.05rem;
		}
		.rummy-hand-card {
			min-width: 1.9rem;
		}
		.rummy-hand-card :global(playing-card) {
			height: 3.1rem !important;
			width: 2.15rem !important;
		}
		.rummy-controls > p {
			margin-top: 0.1rem;
		}
	}
</style>
