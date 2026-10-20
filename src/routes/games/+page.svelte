<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { GAME_GUIDES, GAME_CATEGORIES, gameColor } from '#lib/games/catalog.js';
	import GameDemo from '#lib/games/GameDemo.svelte';
	let query = $state('');
	let category = $state<string>('All');
	let selectedId = $state('classic-1');
	let replay = $state(0);
	const filtered = $derived(
		GAME_GUIDES.filter(
			(game) =>
				(category === 'All' || game.category === category) &&
				`${game.name} ${game.category} ${game.win}`
					.toLowerCase()
					.includes(query.trim().toLowerCase())
		)
	);
	const selected = $derived(filtered.find((game) => game.id === selectedId) ?? filtered[0]);
	async function syncHash() {
		const id = window.location.hash.slice(1);
		if (GAME_GUIDES.some((game) => game.id === id)) {
			selectedId = id;
			if (!filtered.some((game) => game.id === id)) {
				category = 'All';
				query = '';
			}
			await tick();
			document.getElementById(id)?.scrollIntoView({ block: 'start' });
		}
	}
	onMount(() => {
		void syncHash();
	});
	function choose(id: string) {
		selectedId = id;
		replay = 0;
	}
	function clear() {
		query = '';
		category = 'All';
	}
</script>

<svelte:window onhashchange={syncHash} />
<svelte:head>
	<title>All Games & Rules · Chaal</title>
	<meta
		name="description"
		content="Every game on Chaal. Explore Teen Patti variants, Texas Hold’em, Blackjack and Indian Rummy with simple rules and card examples."
	/>
</svelte:head>

<div class="games-page">
	<header class="page-header">
		<a class="back" href="/">← Chaal</a>
		<div class="headline">
			<h1>The game<br />is <span>on.</span></h1>
			<div class="header-note">
				<span class="suit-mark" aria-hidden="true">♠</span>
				<p>{GAME_GUIDES.length} ways to play.<br />Find your next favourite.</p>
			</div>
		</div>
	</header>
	<section class="browse" aria-label="Find a game">
		<div class="filters" role="group" aria-label="Game category">
			{#each GAME_CATEGORIES as option (option)}<button
					class:active={category === option}
					aria-pressed={category === option}
					onclick={() => (category = option)}>{option === 'All' ? 'All games' : option}</button
				>{/each}
		</div>
		<label class="search"
			><span class="sr-only">Search games</span><input
				type="search"
				bind:value={query}
				placeholder="Find a game…"
			/></label
		>
	</section>
	<label class="mobile-picker"
		>Choose a game<select
			aria-label="Choose a game"
			value={selected?.id ?? ''}
			onchange={(event) => choose(event.currentTarget.value)}
			disabled={!filtered.length}
			>{#each filtered as game (game.id)}<option value={game.id}>{game.name}</option>{/each}</select
		></label
	>
	<div class="workspace">
		<nav class="game-list" aria-label="Choose a game">
			<p class="list-count" role="status">
				{String(filtered.length).padStart(2, '0')} GAMES & VARIANTS
			</p>
			{#each filtered as game (game.id)}
				<a
					href="#{game.id}"
					class:chosen={selected?.id === game.id}
					aria-current={selected?.id === game.id ? 'true' : undefined}
					onclick={() => choose(game.id)}
					><span class="list-number">{String(GAME_GUIDES.indexOf(game) + 1).padStart(2, '0')}</span
					><span>{game.name}</span><span class="list-arrow" aria-hidden="true">↗</span></a
				>
			{/each}
		</nav>
		{#if selected}
			<article class="game-guide" id={selected.id} aria-labelledby="game-title">
				<div class="stage" style:--poster={gameColor(selected.id)}>
					<div class="stage-top">
						<span class="category-tag"><span aria-hidden="true">♠</span> {selected.category}</span
						><span class="guide-index"
							>{String(GAME_GUIDES.indexOf(selected) + 1).padStart(2, '0')} / {GAME_GUIDES.length}</span
						>
					</div>
					<div class="stage-title">
						<h2 id="game-title">{selected.name}</h2>
						<span class="deal-tag"
							>{selected.id === 'rummy'
								? '13 cards per player'
								: selected.id === 'blackjack'
									? 'Play to 21'
									: selected.id === 'texas-holdem'
										? '2 hole cards'
										: `${selected.cards.length}-card hand`}</span
						>
					</div>
					{#key `${selected.id}-${replay}`}<GameDemo game={selected} />{/key}
					<button
						class="replay"
						onclick={() => replay++}
						aria-label="Replay {selected.name} example">↻ Deal again</button
					>
				</div>
				<div class="guide-copy">
					<p class="win">{selected.win}</p>
					<div class="rules">
						<h3>The rules</h3>
						<ol>
							{#each selected.rules as rule, index (rule)}<li>
									<span class="rule-number">{String(index + 1).padStart(2, '0')}</span>
									<p>{rule}</p>
								</li>{/each}
						</ol>
					</div>
					{#if selected.category === 'Teen Patti'}<details>
							<summary>First time playing Teen Patti? <span aria-hidden="true">+</span></summary>
							<p>
								Each hand starts with a boot contribution. Play blind, or look at your cards and
								play seen. Blind players pay half the equivalent seen stake. Chaal to stay in, raise
								the stake, or pack to fold. With two players left, a Show compares their hands. The
								variant decides which hand wins.
							</p>
							<p>
								Four-card variants explain whether the game chooses your best three or you discard
								one.
							</p>
						</details>{/if}
				</div>
			</article>
		{:else}<div class="empty">
				<h2>No games found.</h2>
				<button onclick={clear}>Show all games →</button>
			</div>{/if}
	</div>
	<footer><span>Cards out. Friends in.</span><a href="/">Back to Chaal ↗</a></footer>
</div>

<style>
	.games-page {
		background: #211c2e;
		color: #f8f2e5;
		color-scheme: dark;
		margin: 0 0 32px;
		font-family: Arial, Helvetica, sans-serif;
	}
	.page-header {
		padding: 32px clamp(20px, 5vw, 64px) 36px;
	}
	.back {
		font-size: 13px;
		font-weight: 700;
	}
	.headline {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 24px;
		margin-top: 38px;
	}
	h1 {
		font-size: clamp(72px, 11vw, 145px);
		line-height: 0.85;
		font-weight: 900;
		letter-spacing: -0.065em;
		word-spacing: 0.08em;
	}
	h1 span {
		color: #f2dc91;
	}
	.header-note {
		display: grid;
		justify-items: end;
		gap: 16px;
		padding-bottom: 6px;
	}
	.header-note p {
		font-size: 13px;
		line-height: 1.6;
		text-align: right;
	}
	.suit-mark {
		font-size: 72px;
		line-height: 1;
		transform: rotate(14deg);
	}
	.browse {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		padding: 0 clamp(20px, 5vw, 64px);
		border-block: 1px solid #f8f2e530;
	}
	.filters {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
	}
	.filters button {
		padding: 20px 0 17px;
		font-size: 12px;
		font-weight: 650;
		border-bottom: 3px solid transparent;
		cursor: pointer;
		color: #beb5c9;
	}
	.filters button.active {
		border-color: #f2dc91;
		color: #f8f2e5;
	}
	.search {
		min-width: 150px;
		max-width: 240px;
		width: 25%;
	}
	input {
		width: 100%;
		border-bottom: 1px solid #f8f2e530;
		background: transparent;
		padding: 10px 0;
		color: #f8f2e5;
		font-size: 14px;
	}
	input::placeholder {
		color: #94a08f;
		opacity: 1;
	}
	.mobile-picker {
		display: none;
	}
	.workspace {
		display: grid;
		grid-template-columns: 260px minmax(0, 1fr);
		gap: 40px;
		padding: 36px clamp(20px, 5vw, 64px) 56px;
		align-items: start;
	}
	.game-list {
		position: sticky;
		top: 20px;
		max-height: 780px;
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.list-count {
		font:
			10px ui-monospace,
			monospace;
		letter-spacing: 0.1em;
		color: #beb5c9;
		padding: 0 12px 16px;
	}
	.game-list a {
		display: grid;
		grid-template-columns: 24px 1fr 14px;
		gap: 10px;
		align-items: baseline;
		padding: 13px 12px;
		font-size: 13px;
		border-top: 1px solid #f8f2e518;
		transition: background 150ms;
	}
	.game-list a:hover {
		background: #f8f2e509;
	}
	.game-list a.chosen {
		background: #f2dc91;
		color: #211c2e;
	}
	.list-number {
		font:
			9px ui-monospace,
			monospace;
		opacity: 0.55;
	}
	.list-arrow {
		opacity: 0;
	}
	.chosen .list-arrow {
		opacity: 1;
	}
	.game-guide {
		min-width: 0;
		scroll-margin-top: 24px;
	}
	.stage {
		position: relative;
		overflow: hidden;
		background: var(--poster);
		padding: 22px 28px 16px;
		color: #efe6d3;
	}
	.stage-top {
		display: flex;
		justify-content: space-between;
		gap: 15px;
		text-transform: uppercase;
		font:
			10px ui-monospace,
			monospace;
		letter-spacing: 0.08em;
	}
	.stage h2 {
		font-size: clamp(32px, 5vw, 65px);
		line-height: 1;
		font-weight: 850;
		letter-spacing: -0.055em;
		max-width: 95%;
		margin-top: 30px;
	}
	.replay {
		display: block;
		margin-left: auto;
		font-size: 11px;
		font-weight: 650;
		padding: 10px 0;
		cursor: pointer;
	}
	.guide-copy {
		padding: 28px 0 0;
	}
	.win {
		font-size: 21px;
		line-height: 1.5;
		font-weight: 600;
		letter-spacing: -0.025em;
		margin-bottom: 28px;
	}
	.rules {
		display: grid;
		grid-template-columns: 100px 1fr;
		gap: 20px;
		border-top: 2px solid #f8f2e570;
		padding-top: 20px;
	}
	h3 {
		font-size: 12px;
		font-weight: 750;
	}
	ol {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	li {
		display: grid;
		grid-template-columns: 22px 1fr;
		gap: 16px;
		margin-bottom: 22px;
	}
	.rule-number {
		font:
			10px ui-monospace,
			monospace;
		color: #d8b977;
		padding-top: 4px;
	}
	li p {
		font-size: 14px;
		line-height: 1.75;
		color: #beb5c9;
	}
	details {
		border-top: 1px solid #f8f2e525;
		margin-top: 12px;
		padding-top: 18px;
	}
	summary {
		display: flex;
		justify-content: space-between;
		cursor: pointer;
		font-size: 12px;
		font-weight: 650;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	details p {
		font-size: 13px;
		line-height: 1.8;
		color: #beb5c9;
		margin-top: 14px;
	}
	.empty {
		padding: 60px 0;
	}
	.empty h2 {
		font-size: 28px;
		font-weight: 750;
	}
	.empty button {
		color: #f2dc91;
		margin-top: 20px;
		cursor: pointer;
	}
	footer {
		display: flex;
		justify-content: space-between;
		padding: 24px clamp(20px, 5vw, 64px);
		border-top: 1px solid #f8f2e525;
		font-size: 12px;
		font-weight: 650;
	}
	a:focus-visible,
	button:focus-visible,
	input:focus-visible,
	summary:focus-visible {
		outline: 2px solid #f2dc91;
		outline-offset: 4px;
	}
	@media (max-width: 850px) {
		.workspace {
			grid-template-columns: 190px minmax(0, 1fr);
			gap: 24px;
		}
		.filters {
			gap: 16px;
		}
		.browse {
			flex-wrap: wrap;
			padding-block: 16px;
			gap: 8px;
		}
		.filters button {
			padding: 8px 0;
		}
		.search {
			width: 100%;
			max-width: none;
		}
		.rules {
			grid-template-columns: 1fr;
			gap: 14px;
		}
	}
	@media (max-width: 600px) {
		.mobile-picker {
			display: grid;
			gap: 8px;
			margin: 20px 20px 0;
			font-size: 11px;
			font-weight: 700;
		}
		.mobile-picker select {
			width: 100%;
			padding: 12px;
			border: 1px solid #f8f2e530;
			background: #14271c;
			color: #f8f2e5;
			font-size: 16px;
		}
		.game-list {
			display: none;
		}
		.headline {
			gap: 10px;
		}
		.header-note {
			max-width: 110px;
		}
		.header-note p {
			font-size: 10px;
		}
		.suit-mark {
			font-size: 45px;
		}
		.workspace {
			grid-template-columns: minmax(0, 1fr);
			gap: 24px;
			padding-top: 20px;
		}
		.game-list {
			position: static;
			max-height: 185px;
			border-bottom: 1px solid #f8f2e530;
		}
		.game-list a {
			padding-block: 11px;
		}
		.list-count {
			padding-bottom: 10px;
		}
		.stage {
			padding: 18px;
		}
		.win {
			font-size: 19px;
		}
		.filters {
			gap: 17px;
		}
		.filters button {
			font-size: 11px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.game-list a {
			transition: none;
		}
	}

	.games-page {
		background: transparent;
	}
	.page-header {
		padding: 38px 0 44px;
	}
	.back {
		color: var(--muted);
		font-size: 12px;
	}
	.headline {
		margin-top: 24px;
	}
	h1 {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: clamp(70px, 9.5vw, 132px);
		line-height: 0.9;
	}
	.browse {
		padding-inline: 0;
	}
	.workspace {
		padding-inline: 0;
	}
	.game-list a {
		border-radius: 8px;
		transition:
			background 0.2s,
			translate 0.2s;
	}
	.game-list a:hover {
		translate: 4px 0;
		background: #ffffff08;
	}
	.game-list a.chosen {
		background: var(--butter);
		color: var(--night);
	}
	.game-list a.chosen .list-number {
		color: var(--night);
		opacity: 0.65;
	}
	.stage {
		border-radius: 16px;
	}
	.stage h2 {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: -0.04em;
	}
	footer {
		padding-inline: 0;
	}
	@media (max-width: 600px) {
		.page-header {
			padding: 30px 0;
		}
		.headline {
			margin-top: 20px;
		}
		h1 {
			font-size: 72px;
		}
		.browse {
			padding-inline: 0;
		}
		.workspace {
			padding-inline: 0;
		}
		.mobile-picker {
			margin-inline: 0;
		}
		.header-note p {
			font-size: 11px;
		}
		.header-note .suit-mark {
			font-size: 50px;
		}
	}

	.stage {
		border: 1px solid #ffffff22;
		border-radius: 20px;
		background: linear-gradient(140deg, #ffffff09, transparent 55%), var(--poster);
		padding: 26px 30px 22px;
		box-shadow: 0 6px 0 #0002;
	}
	.stage-top {
		align-items: center;
		text-transform: none;
		font-family: Arial, Helvetica, sans-serif;
		letter-spacing: 0;
		font-size: 11px;
		color: var(--paper);
	}
	.category-tag {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		border: 1px solid #ffffff35;
		border-radius: 100px;
		padding: 7px 12px;
		background: #ffffff08;
	}
	.category-tag > span {
		color: var(--butter);
		font-size: 15px;
	}
	.guide-index {
		font-variant-numeric: tabular-nums;
		color: #ffffffb3;
		font-size: 11px;
		letter-spacing: 0.05em;
	}
	.stage-title {
		margin-top: 28px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	.stage-title h2 {
		margin: 0;
		font-size: clamp(38px, 5vw, 64px);
		line-height: 0.98;
		max-width: 100%;
	}
	.deal-tag {
		font-size: 10px;
		white-space: nowrap;
		color: var(--butter);
		border: 1px solid #f2dc9140;
		border-radius: 6px;
		padding: 6px 9px;
	}
	.replay {
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid #ffffff30;
		border-radius: 100px;
		min-height: 38px;
		padding: 9px 17px;
		font-size: 11px;
		margin: 8px auto 0;
		transition:
			translate 0.2s,
			background 0.2s;
	}
	.replay:hover {
		translate: 0 -2px;
		background: #ffffff10;
	}
	@media (max-width: 600px) {
		.stage {
			padding: 20px 18px;
			border-radius: 16px;
		}
		.stage-title {
			margin-top: 24px;
			gap: 12px;
		}
		.stage-title h2 {
			font-size: 42px;
		}
		.stage-top {
			font-size: 10px;
		}
		.category-tag {
			padding: 6px 10px;
		}
		.deal-tag {
			font-size: 9px;
		}
		.guide-index {
			font-size: 10px;
		}
	}
</style>
