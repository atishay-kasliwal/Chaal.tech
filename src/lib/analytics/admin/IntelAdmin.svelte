<script lang="ts">
	/** Owner analytics home: the club, its variants, its bots and the health of the data behind them. */
	import ClubIntel from './ClubIntel.svelte';
	import BotIntel from './BotIntel.svelte';
	import QualityIntel from './QualityIntel.svelte';

	const TABS = [
		['club', 'Club & variants'],
		['bots', 'Bots'],
		['quality', 'Data quality']
	] as const;
	let tab = $state<(typeof TABS)[number][0]>('club');
</script>

<div class="stats-view intel">
	<header>
		<p class="eyebrow">Owner</p>
		<h1>Club intelligence</h1>
		<p class="muted small">Built from public hand records only. No player’s cards appear anywhere here. <a href="/admin/bots">Manage characters</a> · <a href="/admin">Admin</a></p>
	</header>
	<nav class="sections" aria-label="Sections">
		{#each TABS as [id, label] (id)}<button class:on={tab === id} aria-current={tab === id ? 'page' : undefined} onclick={() => (tab = id)}>{label}</button>{/each}
	</nav>
	{#if tab === 'club'}<ClubIntel />{:else if tab === 'bots'}<BotIntel />{:else}<QualityIntel />{/if}
</div>

<style>
	.intel {
		display: grid;
		gap: 1.1rem;
		margin: 0 auto;
		max-width: 64rem;
		padding: clamp(1.2rem, 3vw, 2.5rem) 0.8rem 3rem;
		color: #f1ebdc;
	}
	h1 {
		font-family: Georgia, serif;
		font-size: clamp(2rem, 5vw, 3.2rem);
		font-weight: 400;
		letter-spacing: -0.04em;
	}
	a {
		color: #e7c784;
		text-decoration: underline;
		text-underline-offset: 3px;
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
	}
	.sections button.on {
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.intel :global(.panel) {
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgb(240 209 140 / 14%);
		border-radius: 1.2rem;
		background: #0f1a16;
		padding: clamp(1rem, 2.5vw, 1.4rem);
	}
	.intel :global(.two) {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr));
		gap: 1.4rem;
	}
	.intel :global(h2) {
		font-size: 1.15rem;
		font-weight: 650;
	}
	.intel :global(h3) {
		color: #d5b67a;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.intel :global(.eyebrow) {
		color: #d5b67a;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.intel :global(.muted) {
		color: #b1b9ae;
	}
	.intel :global(.small) {
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.intel :global(.tiny) {
		font-size: 0.7rem;
	}
	.intel :global(.row-head) {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.intel :global(.notice) {
		border-radius: 0.8rem;
		background: rgb(240 113 95 / 14%);
		padding: 0.7rem 1rem;
		color: #f3b0a5;
	}
	.intel :global(.private-note) {
		border-radius: 0.8rem;
		background: rgb(231 199 132 / 8%);
		padding: 0.6rem 0.9rem;
		color: #d5b67a;
		font-size: 0.78rem;
	}
	.intel :global(table.data-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.intel :global(table.data-table th) {
		padding: 0.35rem 0.4rem;
		color: #b1b9ae;
		font-size: 0.7rem;
		font-weight: 500;
		text-align: left;
	}
	.intel :global(table.data-table td) {
		border-top: 1px solid rgb(255 255 255 / 6%);
		padding: 0.45rem 0.4rem;
		font-variant-numeric: tabular-nums;
	}
	.intel :global(tr.dim) {
		opacity: 0.45;
	}
	.intel :global(.plain) {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.intel :global(.plain li) {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.6rem;
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.5rem 0.7rem;
		font-size: 0.85rem;
	}
</style>
