<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import { DECKS, type DeckId } from '#lib/decks.js';
	let deck = $state<DeckId>('diwali-taash');
	const current = $derived(DECKS.find((d) => d.id === deck)!);
	const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
	const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
</script>

<svelte:head>
	<title>{current.name} · Full deck review</title>
	<meta name="robots" content="noindex" />
</svelte:head>
<div class="deck-review" style:--deck-base={current.base}>
	<header>
		<p>PERSONAL DECK COLLECTION · 8 THEMES</p>
		<h1>{current.name}</h1>
		<label class="deck-select"
			>Choose a deck<select bind:value={deck}
				>{#each DECKS as option (option.id)}<option value={option.id}>{option.name}</option
					>{/each}</select
			></label
		>
		<p>52 faces and a reversible back for each theme.</p>
		<a href="/cards/{deck}/manifest.json" download>Download deck manifest</a>
	</header>
	<section aria-label="Signature cards" class="signature">
		<DeckCard {deck} faceDown class="hero-card" />
		<DeckCard {deck} rank="A" suit="spades" class="hero-card" />
		<DeckCard {deck} rank="K" suit="hearts" class="hero-card" />
		<DeckCard {deck} rank="Q" suit="diamonds" class="hero-card" />
		<DeckCard {deck} rank="J" suit="clubs" class="hero-card" />
	</section>
	<section aria-label="Mobile size review">
		<h2>At the table</h2>
		<p>Check corner indices and suit recognition at small sizes.</p>
		<div class="small-cards">
			{#each ['A', '10', 'J', 'Q', 'K'] as rank (rank)}<DeckCard
					{deck}
					{rank}
					suit="hearts"
					class="small-card"
				/>{/each}
		</div>
	</section>
	{#each suits as suit (suit)}
		<section aria-label={suit}>
			<h2>{suit}</h2>
			<div class="cards">
				{#each ranks as rank (rank)}<DeckCard {deck} {rank} {suit} />{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	.deck-review {
		padding: clamp(20px, 4vw, 56px);
		background: #f5eddb;
		color: #491c25;
		border-radius: 20px;
	}
	.deck-select {
		display: grid;
		gap: 0.5rem;
		max-width: 320px;
		margin: 16px 0;
		font-weight: 600;
	}
	select {
		padding: 0.7rem;
		border: 1px solid #b48a43;
		border-radius: 0.7rem;
		background: #fff8e8;
		color: #491c25;
	}
	header {
		margin-bottom: 32px;
	}
	header > p:first-child {
		letter-spacing: 0.2em;
		font-size: 11px;
		font-weight: 700;
	}
	h1 {
		font:
			500 clamp(36px, 6vw, 64px) Georgia,
			serif;
		margin: 12px 0;
	}
	h2 {
		font:
			400 28px Georgia,
			serif;
		text-transform: capitalize;
		margin-bottom: 16px;
	}
	a {
		display: inline-block;
		color: #751d27;
		text-decoration: underline;
		margin-top: 16px;
	}
	section {
		margin: 32px 0;
	}
	.signature,
	.small-cards {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}
	.signature {
		background: var(--deck-base);
		padding: 24px;
		border-radius: 16px;
	}
	.signature :global(.hero-card) {
		width: 168px;
		height: 240px;
	}
	.small-cards :global(.small-card) {
		width: 49px;
		height: 70px;
	}
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 16px;
	}
	.cards :global(.deck-card) {
		width: 100%;
		height: auto;
	}
	@media (max-width: 500px) {
		.signature {
			padding: 12px;
			gap: 10px;
		}
		.signature :global(.hero-card) {
			width: 112px;
			height: 160px;
		}
		.cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
