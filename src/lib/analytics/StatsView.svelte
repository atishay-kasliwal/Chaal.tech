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
	import Skill from './sections/Skill.svelte';
	import Records from './sections/Records.svelte';
	import Club from './sections/Club.svelte';
	import NightRecap from './sections/NightRecap.svelte';
	import { onMount } from 'svelte';

	const SECTIONS = [
		['overview', 'Overview', '◎'],
		['skill', 'Skill', '⚖'],
		['games', 'Games', '♠'],
		['cards', 'Cards', '🂡'],
		['style', 'Style', '✦'],
		['rivals', 'Rivals', '⚔'],
		['records', 'Records', '♛'],
		['history', 'Nights', '☾'],
		['club', 'Club', '👥']
	] as const;
	type Section = (typeof SECTIONS)[number][0];
	/** Sections redrawn as one-screen visuals; the rest still scroll inside the stage. */
	const FITTED: string[] = ['overview', 'skill', 'games', 'cards', 'style', 'rivals', 'records'];
	const WINDOWS = [
		['all', 'All time', 'All'],
		['30d', 'Last 30 days', '30d'],
		['recent-nights', 'Last 5 nights', '5 ☾'],
		['recent-hands', 'Last 50 hands', '50 🂠']
	] as const;
	const GAMES = [
		['', 'All games', 'All'],
		['teen-patti', 'Teen Patti', '♠'],
		['texas-holdem', 'Hold’em', '♦'],
		['blackjack', 'Blackjack', '♣'],
		['rummy', 'Rummy', '♥']
	] as const;
	const COMPANY = [
		['all', 'Everyone', 'All'],
		['friends', 'Friends only', '👥'],
		['bots', 'With bots', '🤖']
	] as const;

	let {
		initial = 'overview',
		initialHand = null,
		initialRecap = null
	}: { initial?: string; initialHand?: string | null; initialRecap?: string | null } = $props();
	// svelte-ignore state_referenced_locally
	let section = $state<Section>(initial as Section);
	let filter = $state<Filter>({ window: 'all', company: 'all' });
	// svelte-ignore state_referenced_locally
	let openHand = $state<string | null>(initialHand);
	// svelte-ignore state_referenced_locally
	let recap = $state<string | null>(initialRecap);
	let moreFilters = $state(false);
	/** Phones fold the filters behind one button. */
	let filtersOpen = $state(false);
	const activeFilters = $derived(
		[
			filter.window !== 'all',
			!!filter.game,
			filter.company !== 'all',
			!!(filter.from || filter.until)
		].filter(Boolean).length
	);

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
	function showRecap(nightId: string) {
		recap = nightId;
		track('night_recap_opened');
	}
	/** A date picked in the "more filters" row, as the API's YYYY-MM-DD. */
	function setDate(key: 'from' | 'until', value: string) {
		filter = { ...filter, [key]: value || undefined };
		track('analytics_filter_used', { filter: key, value: value ? 'set' : 'all' });
	}
	function showHand(id: string) {
		openHand = id;
		track('hand_detail_opened');
	}
</script>

<div class="stats-view">
	<header class="bar">
		<h1>Your record</h1>
		<button
			class="filter-toggle"
			aria-expanded={filtersOpen}
			aria-controls="stats-filters"
			onclick={() => (filtersOpen = !filtersOpen)}
			><span aria-hidden="true">⚙</span> Filters{#if activeFilters}<b>{activeFilters}</b
				>{/if}</button
		>
		<div class="filters" id="stats-filters" class:open={filtersOpen} aria-label="Filters">
			<div class="seg" role="group" aria-label="Time">
				{#each WINDOWS as [id, label, short] (id)}<button
						aria-pressed={filter.window === id}
						title={label}
						onclick={() => setFilter('window', id)}>{short}</button
					>{/each}
			</div>
			{#if section !== 'games'}
				<div class="seg" role="group" aria-label="Game">
					{#each GAMES as [id, label, icon] (id)}<button
							aria-pressed={(filter.game ?? '') === id}
							aria-label={label}
							title={label}
							class:red={icon === '♦' || icon === '♥'}
							onclick={() => setFilter('game', id)}>{icon}</button
						>{/each}
				</div>
			{/if}
			<div class="seg" role="group" aria-label="Company">
				{#each COMPANY as [id, label, icon] (id)}<button
						aria-pressed={filter.company === id}
						aria-label={label}
						title={label}
						onclick={() => setFilter('company', id)}>{icon}</button
					>{/each}
			</div>
			<button
				class="seg-button"
				aria-expanded={moreFilters}
				aria-label="Dates"
				title="Dates"
				class:on={!!(filter.from || filter.until)}
				onclick={() => (moreFilters = !moreFilters)}>📅</button
			>
			{#if moreFilters}
				<div class="dates">
					<label
						><span aria-hidden="true">⟶</span><span class="sr">From</span><input
							type="date"
							value={filter.from ?? ''}
							onchange={(e) => setDate('from', e.currentTarget.value)}
						/></label
					>
					<label
						><span aria-hidden="true">⟵</span><span class="sr">To</span><input
							type="date"
							value={filter.until ?? ''}
							onchange={(e) => setDate('until', e.currentTarget.value)}
						/></label
					>
				</div>
			{/if}
		</div>
		<button
			class="info"
			title="Hands recorded since analytics began. No one’s hidden cards or private numbers are shown."
			aria-label="About these stats: hands recorded since analytics began. No one’s hidden cards or private numbers are shown."
			>ⓘ</button
		>
	</header>

	<div class="body">
		<nav class="rail" aria-label="Stats sections">
			{#each SECTIONS as [id, label, icon] (id)}
				<button
					class:on={section === id}
					aria-current={section === id ? 'page' : undefined}
					onclick={() => go(id)}
					><span class="icon" aria-hidden="true">{icon}</span><span class="label">{label}</span
					></button
				>
			{/each}
		</nav>
		<div class="stage" class:dash={FITTED.includes(section)}>
			{#if section === 'overview'}<Overview
					{filter}
					onOpenHand={showHand}
					onSection={go}
					onRecap={showRecap}
				/>
			{:else if section === 'skill'}<Skill {filter} onRecap={showRecap} />
			{:else if section === 'games'}<Games {filter} />
			{:else if section === 'cards'}<Cards {filter} />
			{:else if section === 'style'}<StyleSection {filter} />
			{:else if section === 'rivals'}<Rivals {filter} onOpenHand={showHand} />
			{:else if section === 'records'}<Records {filter} onOpenHand={showHand} onRecap={showRecap} />
			{:else if section === 'club'}<Club onOpenHand={showHand} onRecap={showRecap} />
			{:else}<History {filter} onOpenHand={showHand} onRecap={showRecap} />{/if}
		</div>
	</div>
</div>
{#if openHand}<HandDetail handId={openHand} onClose={() => (openHand = null)} />{/if}
{#if recap}<NightRecap
		nightId={recap === 'latest' ? null : recap}
		onClose={() => (recap = null)}
		onOpenHand={(id) => ((recap = null), showHand(id))}
	/>{/if}

<style>
	/* One screen: a bar, a rail of sections and a stage that fills the rest. */
	.stats-view {
		display: flex;
		flex-direction: column;
		gap: 12px;
		height: calc(100dvh - var(--header-h, 64px));
		overflow: hidden;
		padding: 14px max(16px, calc((100vw - 1320px) / 2)) 16px;
		color: #f8f2e5;
	}
	.bar {
		position: relative;
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
		margin-right: auto;
	}
	.filters {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: flex-end;
		position: relative;
	}
	.seg {
		display: flex;
		padding: 3px;
		border-radius: 100px;
		background: #ffffff10;
	}
	.seg button,
	.seg-button {
		min-width: 34px;
		height: 32px;
		padding: 0 11px;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.seg button.red {
		color: #f39788;
	}
	.seg button:hover,
	.seg-button:hover {
		color: var(--paper);
		background: #ffffff12;
	}
	.seg button[aria-pressed='true'],
	.seg-button.on {
		background: var(--butter);
		color: var(--night);
	}
	.seg-button {
		background: #ffffff10;
	}
	.dates {
		position: absolute;
		right: 0;
		top: calc(100% + 8px);
		z-index: 5;
		display: flex;
		gap: 10px;
		padding: 10px;
		border-radius: 14px;
		background: var(--surface);
		border: 1px solid var(--line);
		box-shadow: 0 14px 30px #0006;
	}
	.dates label {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--butter);
	}
	.dates input {
		border: 1px solid #f2dc9138;
		border-radius: 8px;
		background: var(--night);
		padding: 5px 8px;
		color: var(--paper);
		color-scheme: dark;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.info {
		display: grid;
		place-items: center;
		width: 28px;
		height: 28px;
		border-radius: 50%;
		color: var(--muted);
		cursor: help;
	}
	.filter-toggle {
		display: none;
	}
	.body {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: 92px 1fr;
		gap: 14px;
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-height: 0;
	}
	.rail button {
		flex: 1;
		max-height: 72px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 3px;
		border-radius: 14px;
		color: var(--muted);
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.rail .icon {
		font-size: 20px;
		line-height: 1;
		transition: scale 0.2s;
	}
	.rail .label {
		font-size: 11px;
		font-weight: 600;
	}
	.rail button:hover {
		background: #ffffff0d;
		color: var(--paper);
	}
	.rail button:hover .icon {
		scale: 1.12;
	}
	.rail button.on,
	.rail button.on .label,
	.rail button.on .icon {
		background: var(--butter);
		color: var(--night);
	}
	.rail .label {
		color: inherit;
	}
	.stage {
		min-height: 0;
		min-width: 0;
		overflow: auto;
		display: grid;
		align-content: start;
		gap: 12px;
		scrollbar-width: thin;
	}
	.stage.dash {
		overflow: hidden;
		align-content: stretch;
	}
	@media (max-width: 720px) {
		.stats-view {
			padding: 10px 12px 0;
			gap: 10px;
		}
		h1 {
			font-size: 20px;
		}
		.filter-toggle {
			display: flex;
			align-items: center;
			gap: 6px;
			height: 34px;
			padding: 0 14px;
			border-radius: 100px;
			background: #ffffff10;
			font-size: 13px;
			font-weight: 600;
			cursor: pointer;
		}
		.filter-toggle b {
			display: grid;
			place-items: center;
			min-width: 18px;
			height: 18px;
			border-radius: 9px;
			background: var(--butter);
			color: var(--night);
			font-size: 11px;
		}
		.filters {
			display: none;
			position: absolute;
			right: 0;
			top: calc(100% + 8px);
			z-index: 6;
			flex-direction: column;
			align-items: stretch;
			padding: 10px;
			border-radius: 16px;
			background: var(--surface);
			border: 1px solid var(--line);
			box-shadow: 0 16px 34px #0007;
		}
		.filters.open {
			display: flex;
		}
		.seg {
			justify-content: space-between;
		}
		.dates {
			position: static;
			box-shadow: none;
		}
		.body {
			grid-template-columns: 1fr;
			grid-template-rows: 1fr auto;
			gap: 8px;
		}
		.rail {
			order: 2;
			flex-direction: row;
			gap: 2px;
			margin: 0 -12px;
			padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
			background: var(--surface);
			border-top: 1px solid var(--line);
		}
		.rail button {
			min-height: 48px;
			border-radius: 12px;
		}
		.rail .icon {
			font-size: 18px;
		}
		.rail .label {
			font-size: 9px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rail .icon,
		.seg button,
		.rail button {
			transition: none;
		}
	}
	/* Visual tiles shared by the one-screen sections. */
	.stats-view :global(.vt) {
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		position: relative;
		border-radius: 18px;
		background: #2c263b;
		border: 1px solid #ffffff1a;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.stats-view :global(.vt h2) {
		font-family: var(--font-display);
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.01em;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.stats-view :global(.vt h2 > .ic) {
		color: var(--butter);
	}
	.stats-view :global(.v-pos) {
		color: #a9cfb5;
	}
	.stats-view :global(.v-neg) {
		color: #f39788;
	}
	.stats-view :global(.v-dim),
	.stats-view :global(.v-dim :is(strong, b, span)) {
		color: var(--muted) !important;
	}
	.stats-view :global(.v-big) {
		font-family: var(--font-display);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
	}
	.stats-view :global(.v-zero) {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--muted);
		height: 100%;
	}
	.stats-view :global(.v-zero > :first-child) {
		font-size: 30px;
		color: var(--butter);
	}
	.stats-view :global(.v-meter) {
		position: relative;
		height: 10px;
		border-radius: 5px;
		background: #ffffff10;
	}
	.stats-view :global(.v-meter > .z) {
		position: absolute;
		left: 50%;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: #ffffff55;
	}
	.stats-view :global(.v-meter > .band) {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 5px;
		background: #f2dc9147;
	}
	.stats-view :global(.v-meter > .dot) {
		position: absolute;
		top: 50%;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		translate: -50% -50%;
		background: #a9cfb5;
		box-shadow: 0 0 0 3px #2c263b;
	}
	.stats-view :global(.v-meter > .dot.neg) {
		background: #ee715b;
	}
	.stats-view :global(.v-chip) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border-radius: 100px;
		background: #ffffff0f;
		font-size: 12px;
		font-weight: 700;
	}
	.stats-view :global(.v-red) {
		color: #f39788;
	}
	.stats-view :global(.v-press) {
		cursor: pointer;
		transition:
			background 0.2s,
			translate 0.2s;
	}
	.stats-view :global(.v-press:hover),
	.stats-view :global(.v-press:focus-visible) {
		background: #f2dc911f;
		translate: 0 -2px;
	}
	@media (max-width: 720px) {
		.stats-view :global(.vt) {
			padding: 10px 12px;
			border-radius: 14px;
			gap: 6px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.stats-view :global(.v-press) {
			transition: none;
			translate: none;
		}
	}
	/* Shared by every section. */
	.stats-view :global(.panel) {
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgb(242 220 145 / 14%);
		border-radius: 1.2rem;
		background: #2c263b;
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
		font-family: var(--font-display);
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
		color: #d5c39b;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.stats-view :global(.eyebrow) {
		color: #d5c39b;
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
		color: #beb5c9;
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
		color: #d5c39b;
		font-size: 0.78rem;
	}
	.stats-view :global(.link) {
		justify-self: start;
		color: #f2dc91;
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
		color: #beb5c9;
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
		opacity: 1;
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
		color: #f2dc91;
	}
	.stats-view :global(.situations small) {
		display: block;
		color: #beb5c9;
		font-size: 0.68rem;
	}
	.stats-view :global(.mark) {
		color: rgb(248 242 229 / 30%);
	}
	.stats-view :global(.mark.lean) {
		color: #f2dc91;
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
		color: #beb5c9;
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
		color: #f2dc91;
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
		border: 1px solid rgb(242 220 145 / 20%);
		border-radius: 1.4rem 1.4rem 0 0;
		background: #2c263b;
		padding: 1.4rem 1.2rem 2rem;
		color: #f8f2e5;
	}
	:global(.sheet .close) {
		position: absolute;
		top: 0.6rem;
		right: 0.9rem;
		color: #f2dc91;
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
		color: #beb5c9;
		font-style: italic;
	}
	:global(.sheet .steps-list .mine) {
		color: #f2dc91;
	}
	:global(.sheet .seats tr.you td) {
		color: #f2dc91;
	}
	:global(.sheet .muted) {
		color: #beb5c9;
	}
	:global(.sheet .small) {
		font-size: 0.78rem;
	}
	:global(.sheet .eyebrow) {
		color: #d5c39b;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	:global(.sheet h3) {
		color: #d5c39b;
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

	.stats-view :global(.panel) {
		background: var(--surface);
		border-color: var(--line);
		border-radius: 16px;
		box-shadow: none;
	}
	.stats-view :global(.panel h2) {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: 23px;
		letter-spacing: -0.035em;
	}
	@media (max-width: 600px) {
		.stats-view :global(.panel h2) {
			font-size: 21px;
		}
	}
</style>
