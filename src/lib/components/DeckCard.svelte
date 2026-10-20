<script lang="ts">
	import { asset } from '$app/paths';
	import { DECKS, type DeckId } from '#lib/decks.js';
	let {
		deck = 'diwali-taash',
		rank = 'A',
		suit = 'spades',
		faceDown = false,
		class: className = ''
	}: {
		deck?: DeckId;
		rank?: string | number;
		suit?: 'spades' | 'hearts' | 'diamonds' | 'clubs';
		faceDown?: boolean;
		class?: string;
	} = $props();
	const normalizedRank = $derived(
		({ 1: 'a', 11: 'j', 12: 'q', 13: 'k', 14: 'a' } as Record<string, string>)[String(rank)] ??
			String(rank).toLowerCase()
	);
	const validRank = $derived(
		['a', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k'].includes(normalizedRank)
	);
</script>

{#if faceDown || validRank}
	<img
		class="deck-card {className}"
		src={faceDown
			? asset(`cards/${deck}/back.svg` as Parameters<typeof asset>[0])
			: asset(`cards/${deck}/${suit}-${normalizedRank}.svg` as Parameters<typeof asset>[0])}
		alt={faceDown
			? `Face-down ${DECKS.find((d) => d.id === deck)?.name ?? 'themed'} card`
			: `${normalizedRank.toUpperCase()} of ${suit}`}
		width="280"
		height="400"
		draggable="false"
	/>
{:else}
	<span class="deck-card invalid {className}" role="img" aria-label="Unknown card">?</span>
{/if}

<style>
	.deck-card {
		display: block;
		width: 140px;
		height: 200px;
		aspect-ratio: 7 / 10;
		object-fit: contain;
		flex-shrink: 0;
		border-radius: 6%;
		box-shadow:
			0 1px 0 #fff9 inset,
			0 0 0 1px #211c2e16,
			0 3px 4px #0002;
		user-select: none;
	}
	.invalid {
		display: grid;
		place-items: center;
		background: #fff8e8;
		color: #751d27;
		border: 1px solid #b48a43;
	}
</style>
