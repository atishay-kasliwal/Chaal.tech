<script lang="ts">
	/**
	 * Your stats: progressive depth. Overview first (is it real, how is it going, what stands
	 * out), then Games, Cards (private to you), Style, Rivals and History. All numbers come from
	 * the server's analytics layer; this only lays them out.
	 */
	import { track } from '#lib/analytics.js';
	import type { Filter } from './api.js';
	import Overview from './sections/Overview.svelte';
	import Games from './sections/Games.svelte';
	import Cards from './sections/Cards.svelte';
	import StyleSection from './sections/Style.svelte';
	import Rivals from './sections/Rivals.svelte';
	import History from './sections/History.svelte';
	import HandDetail from './sections/HandDetail.svelte';
	import { onMount } from 'svelte';

	const SECTIONS = [
		['overview', 'Overview'],
		['games', 'Games'],
		['cards', 'Cards'],
		['style', 'Style'],
		['rivals', 'Rivals'],
		['history', 'History']
	] as const;
	type Section = (typeof SECTIONS)[number][0];
	const WINDOWS = [
		['all', 'All time'],
		['30d', 'Last 30 days'],
		['recent-nights', 'Last 5 nights'],
		['recent-hands', 'Last 50 hands']
	] as const;
	const GAMES = [
		['', 'All games'],
		['teen-patti', 'Teen Patti'],
		['texas-holdem', 'Hold’em'],
		['blackjack', 'Blackjack'],
		['rummy', 'Rummy']
	] as const;
	const COMPANY = [
		['all', 'Everyone'],
		['friends', 'Friends only'],
		['bots', 'With bots']
	] as const;

	let { initial = 'overview', initialHand = null }: { initial?: string; initialHand?: string | null } = $props();
	// svelte-ignore state_referenced_locally
	let section = $state<Section>(initial as Section);
	let filter = $state<Filter>({ window: 'all', company: 'all' });
	// svelte-ignore state_referenced_locally
	let openHand = $state<string | null>(initialHand);

	onMount(() => track('analytics_opened'));
	function go(next: string) {
		section = next as Section;
		track('analytics_section_viewed', { section: next });
	}
	function setFilter(key: keyof Filter, value: string) {
		filter = { ...filter, [key]: value || undefined };
		// Only the kind of filter and its fixed option go to GA, never ids or names.
		track('analytics_filter_used', { filter: key, value: value || 'all' });
	}
	function showHand(id: string) {
		openHand = id;
		track('hand_detail_opened');
	}
</script>

<div class="stats-view">
	<header>
		<div>
			<p class="eyebrow">Your game</p>
			<h1>Stats</h1>
		</div>
		<div class="filters" aria-label="Filters">
			<select aria-label="Time" value={filter.window} onchange={(e) => setFilter('window', e.currentTarget.value)}>
				{#each WINDOWS as [id, label] (id)}<option value={id}>{label}</option>{/each}
			</select>
			{#if section !== 'games'}
				<select aria-label="Game" value={filter.game ?? ''} onchange={(e) => setFilter('game', e.currentTarget.value)}>
					{#each GAMES as [id, label] (id)}<option value={id}>{label}</option>{/each}
				</select>
			{/if}
			<select aria-label="Company" value={filter.company} onchange={(e) => setFilter('company', e.currentTarget.value)}>
				{#each COMPANY as [id, label] (id)}<option value={id}>{label}</option>{/each}
			</select>
		</div>
	</header>

	<nav class="sections" aria-label="Stats sections">
		{#each SECTIONS as [id, label] (id)}
			<button class:on={section === id} aria-current={section === id ? 'page' : undefined} onclick={() => go(id)}>{label}</button>
		{/each}
	</nav>

	{#if section === 'overview'}<Overview {filter} onOpenHand={showHand} onSection={go} />
	{:else if section === 'games'}<Games {filter} />
	{:else if section === 'cards'}<Cards {filter} />
	{:else if section === 'style'}<StyleSection {filter} />
	{:else if section === 'rivals'}<Rivals {filter} onOpenHand={showHand} />
	{:else}<History {filter} onOpenHand={showHand} />{/if}

	<p class="footnote">
		Stats cover hands recorded since analytics began. They are for after the game: nothing here
		shows anyone’s hidden cards or another player’s private numbers.
	</p>
</div>
{#if openHand}<HandDetail handId={openHand} onClose={() => (openHand = null)} />{/if}

<style>
	.stats-view {
		display: grid;
		gap: 1.1rem;
		margin: 0 auto;
		max-width: 64rem;
		padding: clamp(1.2rem, 3vw, 2.5rem) 0.5rem 3rem;
		color: #f1ebdc;
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1rem;
	}
	h1 {
		font-family: Georgia, serif;
		font-size: clamp(2.2rem, 5vw, 3.6rem);
		font-weight: 400;
		letter-spacing: -0.05em;
		line-height: 1.05;
	}
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	select {
		border: 1px solid rgb(240 209 140 / 22%);
		border-radius: 999px;
		background: #0f1a16;
		padding: 0.45rem 0.8rem;
		color: #f1ebdc;
		font-size: 0.82rem;
	}
	.sections {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
		border-bottom: 1px solid rgb(240 209 140 / 12%);
		padding-bottom: 0.6rem;
	}
	.sections button {
		flex-shrink: 0;
		border-radius: 999px;
		padding: 0.45rem 0.95rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.88rem;
	}
	.sections button.on {
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.footnote {
		color: #b1b9ae;
		font-size: 0.72rem;
	}
	/* Shared by every section. */
	.stats-view :global(.panel) {
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgb(240 209 140 / 14%);
		border-radius: 1.2rem;
		background: #0f1a16;
		padding: clamp(1rem, 2.5vw, 1.4rem);
	}
	.stats-view :global(.panel.two),
	.stats-view :global(.two) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: 1.4rem;
	}
	.stats-view :global(.panel.chips),
	.stats-view :global(.panel.records) {
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
	}
	.stats-view :global(.duo) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: 1.4rem;
		margin-top: 0.4rem;
	}
	.stats-view :global(.headline h2) {
		font-family: Georgia, serif;
		font-size: clamp(1.6rem, 3.4vw, 2.4rem);
		font-weight: 400;
		letter-spacing: -0.03em;
	}
	.stats-view :global(h2) {
		font-size: 1.15rem;
		font-weight: 650;
	}
	.stats-view :global(h3) {
		margin-bottom: 0.25rem;
		color: #d5b67a;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.stats-view :global(.eyebrow) {
		color: #d5b67a;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.stats-view :global(.big) {
		font-size: 1.45rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.stats-view :global(.muted) {
		color: #b1b9ae;
	}
	.stats-view :global(.small) {
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.stats-view :global(.tiny) {
		font-size: 0.7rem;
	}
	.stats-view :global(.up) {
		color: #8fe0ad;
	}
	.stats-view :global(.down) {
		color: #f0a090;
	}
	.stats-view :global(.notice) {
		border-radius: 0.8rem;
		background: rgb(240 113 95 / 14%);
		padding: 0.7rem 1rem;
		color: #f3b0a5;
	}
	.stats-view :global(.private-note) {
		border-radius: 0.8rem;
		background: rgb(231 199 132 / 8%);
		padding: 0.6rem 0.9rem;
		color: #d5b67a;
		font-size: 0.78rem;
	}
	.stats-view :global(.link) {
		justify-self: start;
		color: #e7c784;
		font-size: 0.8rem;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.stats-view :global(.row-head) {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.stats-view :global(.insights) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
		gap: 0.75rem;
	}
	.stats-view :global(table.data-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.stats-view :global(table.data-table th) {
		padding: 0.35rem 0.4rem;
		color: #b1b9ae;
		font-size: 0.7rem;
		font-weight: 500;
		text-align: left;
	}
	.stats-view :global(table.data-table td) {
		border-top: 1px solid rgb(255 255 255 / 6%);
		padding: 0.45rem 0.4rem;
		font-variant-numeric: tabular-nums;
	}
	.stats-view :global(tr.dim) {
		opacity: 0.45;
	}
	.stats-view :global(.situations),
	.stats-view :global(.plain),
	.stats-view :global(.hand-list),
	.stats-view :global(.rival-list) {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.stats-view :global(.situations li),
	.stats-view :global(.plain li) {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1fr 1.2rem;
		align-items: center;
		gap: 0.6rem;
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.5rem 0.7rem;
		font-size: 0.85rem;
	}
	.stats-view :global(.plain li) {
		grid-template-columns: 1fr auto auto;
	}
	.stats-view :global(.situations .pair) {
		display: grid;
		font-variant-numeric: tabular-nums;
	}
	.stats-view :global(.situations .pair.shifted strong) {
		color: #f4d68c;
	}
		.stats-view :global(.situations small) {
		display: block;
		color: #b1b9ae;
		font-size: 0.68rem;
	}
	.stats-view :global(.mark) {
		color: rgb(241 235 220 / 30%);
	}
	.stats-view :global(.mark.lean) {
		color: #e7c784;
	}
	.stats-view :global(.hand-list button),
	.stats-view :global(.rival-list button) {
		display: grid;
		width: 100%;
		grid-template-columns: auto 1fr auto auto;
		align-items: center;
		gap: 0.8rem;
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.6rem 0.8rem;
		text-align: left;
	}
	.stats-view :global(.hand-list button) {
		grid-template-columns: 1.2fr 2fr auto;
	}
	.stats-view :global(.hand-list button:hover),
	.stats-view :global(.rival-list button:hover) {
		background: rgb(231 199 132 / 8%);
	}
	.stats-view :global(.hand-list small),
	.stats-view :global(.who small) {
		display: block;
		color: #b1b9ae;
		font-size: 0.7rem;
	}
	.stats-view :global(.who) {
		display: grid;
	}
	.stats-view :global(.phrase) {
		font-size: 0.82rem;
		text-align: right;
	}
	.stats-view :global(.bot-badge) {
		display: grid;
		width: 36px;
		height: 36px;
		place-items: center;
		border-radius: 50%;
		background: rgb(255 255 255 / 6%);
	}
	.stats-view :global(.pager) {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.stats-view :global(.pager button) {
		color: #e7c784;
	}
	.stats-view :global(.verdict) {
		font-size: 1.05rem;
	}
	.stats-view :global(.verdict.warn) {
		color: #f3b0a5;
	}
	.stats-view :global(.back) {
		margin-bottom: -0.4rem;
	}
	@media (max-width: 560px) {
		.stats-view :global(.situations li) {
			grid-template-columns: 1fr auto;
		}
		.stats-view :global(.hand-list button),
		.stats-view :global(.rival-list button) {
			grid-template-columns: 1fr auto;
		}
	}
	/* Hand detail sheet */
	:global(.overlay) {
		position: fixed;
		z-index: 40;
		inset: 0;
		background: rgb(0 0 0 / 55%);
	}
	:global(.sheet) {
		position: fixed;
		z-index: 41;
		inset: auto 0 0 0;
		display: grid;
		gap: 0.7rem;
		max-height: 88dvh;
		margin: 0 auto;
		max-width: 40rem;
		overflow-y: auto;
		border: 1px solid rgb(240 209 140 / 20%);
		border-radius: 1.4rem 1.4rem 0 0;
		background: #0f1a16;
		padding: 1.4rem 1.2rem 2rem;
		color: #f1ebdc;
	}
	:global(.sheet .close) {
		position: absolute;
		top: 0.6rem;
		right: 0.9rem;
		color: #e7c784;
		font-size: 1.6rem;
	}
	:global(.sheet .cards-row) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}
	:global(.sheet .card) {
		border-radius: 0.4rem;
		background: #f6f0e2;
		padding: 0.3rem 0.5rem;
		color: #1b1a17;
		font-weight: 800;
	}
	:global(.sheet .pcard.red) {
		color: #b8432f;
	}
	:global(.sheet .steps-list) {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding-left: 1.2rem;
		font-size: 0.85rem;
	}
	:global(.sheet .steps-list .auto) {
		color: #b1b9ae;
		font-style: italic;
	}
	:global(.sheet .steps-list .mine) {
		color: #f4d68c;
	}
	:global(.sheet .seats tr.you td) {
		color: #f4d68c;
	}
	:global(.sheet .muted) {
		color: #b1b9ae;
	}
	:global(.sheet .small) {
		font-size: 0.78rem;
	}
	:global(.sheet .eyebrow) {
		color: #d5b67a;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	:global(.sheet h3) {
		color: #d5b67a;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	:global(.sheet table.data-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	:global(.sheet table.data-table td),
	:global(.sheet table.data-table th) {
		padding: 0.35rem 0.4rem;
		text-align: left;
	}
	:global(.sheet .up) {
		color: #8fe0ad;
	}
	:global(.sheet .down) {
		color: #f0a090;
	}
</style>
