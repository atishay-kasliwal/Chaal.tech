<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { GAME_GUIDES, GAME_CATEGORIES, gameColor } from '#lib/games/catalog.js';
	import GameDemo from '#lib/games/GameDemo.svelte';
	let query = $state('');
	let category = $state<string>('All');
	let selectedId = $state('classic-1');
	let replay = $state(0);
	const SUIT: Record<string, string> = {
		'Teen Patti': '♠',
		Poker: '♦',
		Blackjack: '♣',
		Rummy: '♥',
		Tricks: '♤'
	};
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
	const count = (c: string) =>
		c === 'All' ? GAME_GUIDES.length : GAME_GUIDES.filter((g) => g.category === c).length;
	const dealt = (id: string, cards: number) =>
		id === 'rummy'
			? '13 cards'
			: id === 'three-two-five'
				? '10 cards'
				: id === 'ten-pakad'
					? '13 cards'
					: id === 'twenty-nine'
						? '8 cards'
						: id === 'blackjack'
							? 'to 21'
							: id === 'texas-holdem'
								? '2 + 5'
								: `${cards} cards`;
	const playHref = (id: string, c: string) =>
		`/create-room${c === 'Teen Patti' ? '' : `?game=${id === 'rummy' ? 'rummy' : id}`}`;
	async function syncHash() {
		const id = window.location.hash.slice(1);
		if (GAME_GUIDES.some((game) => game.id === id)) {
			selectedId = id;
			if (!filtered.some((game) => game.id === id)) {
				category = 'All';
				query = '';
			}
			await tick();
			document.getElementById(`tile-${id}`)?.scrollIntoView({ block: 'nearest' });
		}
	}
	onMount(() => {
		void syncHash();
	});
	function choose(id: string) {
		selectedId = id;
		replay = 0;
		history.replaceState(history.state, '', `#${id}`);
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
		content="Every game on Chaal. Explore Teen Patti variants, Texas Hold’em, Blackjack, Indian Rummy, 3 2 5, 10 Pakad and 29 with simple rules and card examples."
	/>
</svelte:head>

<div class="games-room">
	<div class="bar">
		<h1>Games <span>{GAME_GUIDES.length}</span></h1>
		<div class="pills" role="group" aria-label="Game category">
			{#each GAME_CATEGORIES as option (option)}<button
					class:active={category === option}
					aria-pressed={category === option}
					onclick={() => (category = option)}
					><span aria-hidden="true">{option === 'All' ? '✦' : SUIT[option]}</span>
					{option === 'All' ? 'All' : option}<small>{count(option)}</small></button
				>{/each}
		</div>
		<label class="search"
			><span aria-hidden="true">⌕</span><span class="sr-only">Search games</span><input
				type="search"
				bind:value={query}
				placeholder="Find a game"
			/></label
		>
	</div>

	<div class="body">
		<nav class="tile shelf" aria-label="Choose a game">
			{#if filtered.length}
				<div class="grid">
					{#each filtered as game (game.id)}
						<a
							id="tile-{game.id}"
							href="#{game.id}"
							class="game"
							class:chosen={selected?.id === game.id}
							aria-current={selected?.id === game.id ? 'true' : undefined}
							style:--poster={gameColor(game.id)}
							onclick={(event) => {
								event.preventDefault();
								choose(game.id);
							}}
						>
							<span class="swatch" aria-hidden="true">{SUIT[game.category] ?? '♠'}</span>
							<strong>{game.name}</strong>
							<small>{dealt(game.id, game.cards.length)}</small>
						</a>
					{/each}
				</div>
			{:else}
				<div class="empty">
					<p>No games match.</p>
					<button onclick={clear}>Show all</button>
				</div>
			{/if}
		</nav>

		{#if selected}
			<article class="tile stage" id={selected.id} style:--poster={gameColor(selected.id)}>
				<header>
					<span class="tag"
						><span aria-hidden="true">{SUIT[selected.category] ?? '♠'}</span>
						{selected.category}</span
					>
					<span class="index"
						>{String(GAME_GUIDES.indexOf(selected) + 1).padStart(2, '0')} / {GAME_GUIDES.length}</span
					>
				</header>
				<h2>{selected.name}</h2>
				<div class="demo">
					{#key `${selected.id}-${replay}`}<GameDemo game={selected} />{/key}
				</div>
				<footer>
					<button
						class="ghost"
						onclick={() => replay++}
						aria-label="Deal another {selected.name} example">↻ Deal again</button
					>
					<a class="play" href={playHref(selected.id, selected.category)}
						><span aria-hidden="true">♠</span> Play {selected.name}</a
					>
				</footer>
			</article>

			<aside class="tile rules" aria-labelledby="rules-title">
				<p class="win"><span aria-hidden="true">🏆</span>{selected.win}</p>
				<h3 id="rules-title">How it goes</h3>
				<ol>
					{#each selected.rules as rule, index (rule)}<li>
							<span>{index + 1}</span>
							<p>{rule}</p>
						</li>{/each}
				</ol>
				{#if selected.category === 'Teen Patti'}<details>
						<summary>New to Teen Patti?</summary>
						<p>
							Everyone puts in the boot. Play blind for half price, or look and play seen. Chaal to
							stay in, raise to push, pack to fold. With two left, a Show decides it.
						</p>
					</details>{/if}
			</aside>
		{/if}
	</div>
</div>

<style>
	/* One screen, like Club and Stats: the bar, then three panels that fill the rest. */
	.games-room {
		--tile: var(--surface);
		--tile-line: #ffffff1a;
		display: flex;
		flex-direction: column;
		gap: 14px;
		height: calc(100dvh - var(--header-h, 64px));
		overflow: hidden;
		padding: 16px max(var(--gutter), calc((100vw - var(--page-max)) / 2 + var(--gutter))) 18px;
		color: var(--paper);
		background: radial-gradient(ellipse at 18% 0%, #4a3d2455, transparent 45%), var(--night);
		color-scheme: dark;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		flex: none;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.04em;
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-right: auto;
	}
	h1 span {
		font-size: 14px;
		color: var(--butter);
	}
	.pills {
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: 100px;
		background: #ffffff10;
	}
	.pills button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 700;
		color: var(--muted);
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.pills button:hover {
		color: var(--paper);
	}
	.pills button.active {
		background: var(--butter);
		color: var(--night);
	}
	.pills small {
		font-size: 11px;
		opacity: 0.6;
	}
	.search {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0 14px;
		height: 42px;
		border-radius: 100px;
		background: #ffffff10;
		color: var(--muted);
		width: 220px;
	}
	.search input {
		width: 100%;
		background: transparent;
		color: var(--paper);
		font-size: 14px;
	}
	.search input::placeholder {
		color: var(--muted);
		opacity: 1;
	}
	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(280px, 1fr) minmax(0, 2fr) minmax(250px, 0.8fr);
		gap: 14px;
	}
	.tile {
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		border-radius: 18px;
		background: var(--tile);
		border: 1px solid var(--tile-line);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* The shelf: every game as a small poster, scrolling inside its panel only. */
	.shelf {
		padding: 10px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
		gap: 8px;
		overflow-y: auto;
		scrollbar-width: thin;
		padding: 2px;
	}
	.game {
		position: relative;
		display: grid;
		align-content: end;
		gap: 2px;
		min-height: 92px;
		padding: 10px 12px;
		border-radius: 14px;
		background: linear-gradient(
			160deg,
			var(--poster) 0%,
			color-mix(in srgb, var(--poster) 55%, #000) 100%
		);
		border: 1px solid #ffffff14;
		overflow: hidden;
		transition:
			translate 0.2s,
			box-shadow 0.2s,
			outline-color 0.2s;
		outline: 2px solid transparent;
		outline-offset: 1px;
	}
	.game:hover,
	.game:focus-visible {
		translate: 0 -2px;
		box-shadow: 0 8px 18px #0006;
	}
	.game.chosen {
		outline-color: var(--butter);
	}
	.swatch {
		position: absolute;
		top: 6px;
		right: 10px;
		font-size: 34px;
		opacity: 0.22;
		line-height: 1;
	}
	.game strong {
		font-family: var(--font-display);
		font-size: 15px;
		line-height: 1.1;
		letter-spacing: -0.01em;
	}
	.game small {
		font-size: 11px;
		color: #ffffffa8;
	}
	.empty {
		display: grid;
		place-items: center;
		align-content: center;
		gap: 10px;
		height: 100%;
		color: var(--muted);
	}
	.empty button {
		padding: 8px 16px;
		border-radius: 100px;
		background: var(--butter);
		color: var(--night);
		font-weight: 700;
	}

	/* The stage: the selected game, dealt. */
	.stage {
		background: radial-gradient(ellipse at 50% 60%, #ffffff12, transparent 60%), var(--poster);
		padding: 18px 22px;
	}
	.stage header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.tag {
		display: inline-flex;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 100px;
		background: #00000030;
		font-size: 12px;
		font-weight: 700;
	}
	.index {
		font-size: 12px;
		color: #ffffffa0;
		font-variant-numeric: tabular-nums;
	}
	.stage h2 {
		font-family: var(--font-display);
		font-size: clamp(34px, 4.2vw, 64px);
		font-weight: 800;
		letter-spacing: -0.045em;
		line-height: 0.95;
	}
	.demo {
		flex: 1;
		min-height: 0;
		display: grid;
		place-items: center;
		overflow: hidden;
	}
	.stage footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
	}
	.ghost {
		padding: 10px 16px;
		border-radius: 100px;
		background: #00000030;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition: background 0.2s;
	}
	.ghost:hover {
		background: #00000055;
	}
	.play {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		border-radius: 100px;
		background: var(--butter);
		color: var(--night);
		font-weight: 800;
		font-size: 14px;
		transition:
			translate 0.2s,
			box-shadow 0.2s;
	}
	.play span {
		color: var(--red);
	}
	.play:hover,
	.play:focus-visible {
		translate: 0 -2px;
		box-shadow: 0 8px 18px #0006;
	}

	/* How to win, then the steps. */
	.rules {
		overflow-y: auto;
		scrollbar-width: thin;
	}
	.win {
		display: flex;
		gap: 10px;
		align-items: flex-start;
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 700;
		line-height: 1.25;
		letter-spacing: -0.015em;
		padding: 14px;
		border-radius: 14px;
		background: #f2dc9114;
		color: var(--butter);
	}
	h3 {
		font-family: var(--font-display);
		font-size: 15px;
		font-weight: 700;
		margin-top: 4px;
	}
	ol {
		display: grid;
		gap: 8px;
	}
	li {
		display: grid;
		grid-template-columns: 26px 1fr;
		gap: 10px;
		align-items: start;
	}
	li span {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		background: #ffffff12;
		font-size: 12px;
		font-weight: 800;
		color: var(--butter);
	}
	li p {
		font-size: 13px;
		line-height: 1.45;
		color: #e8e0f0;
	}
	details {
		margin-top: auto;
		padding: 12px 14px;
		border-radius: 14px;
		background: #ffffff0a;
		font-size: 13px;
		line-height: 1.5;
		color: var(--muted);
	}
	summary {
		cursor: pointer;
		font-weight: 700;
		color: var(--paper);
	}
	details p {
		margin-top: 8px;
	}

	/* Narrower screens: the same panels, stacked, and the page scrolls. */
	@media (max-width: 1100px) {
		.body {
			grid-template-columns: minmax(250px, 1fr) minmax(0, 1.6fr);
		}
		.rules {
			grid-column: 1 / -1;
		}
		.games-room {
			height: auto;
			overflow: visible;
		}
		.stage {
			min-height: 520px;
		}
		.shelf {
			max-height: 520px;
		}
	}
	@media (max-width: 720px) {
		.bar {
			flex-wrap: wrap;
		}
		.pills {
			order: 3;
			width: 100%;
			overflow-x: auto;
			scrollbar-width: none;
		}
		.pills button {
			flex: none;
		}
		.search {
			width: auto;
			flex: 1;
			min-width: 0;
		}
		h1 {
			margin-right: 0;
		}
		.body {
			display: flex;
			flex-direction: column;
		}
		.shelf {
			order: 2;
			max-height: none;
			padding: 8px;
		}
		.grid {
			display: flex;
			overflow-x: auto;
			overflow-y: hidden;
			scroll-snap-type: x mandatory;
		}
		.game {
			flex: none;
			width: 128px;
			min-height: 84px;
			scroll-snap-align: start;
		}
		.stage {
			order: 1;
			min-height: 440px;
		}
		.rules {
			order: 3;
			overflow: visible;
		}
	}
</style>
