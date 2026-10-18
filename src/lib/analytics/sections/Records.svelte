<script lang="ts">
	/** Your records and the few achievements that come from real moments. Every one opens its evidence. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { day } from '../format.js';
	import type { Names, RecordsView } from '../types.js';

	let { filter, onOpenHand, onRecap }: { filter: Filter; onOpenHand: (id: string) => void; onRecap: (nightId: string) => void } = $props();
	let data = $state<(RecordsView & { names: Names }) | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { game: filter.game };
		data = null;
		error = '';
		fetchAnalytics<RecordsView & { names: Names }>('records', params).then((b) => (data = b)).catch((e) => (error = e.message));
	});
	const shown = (v: number | string) => (typeof v === 'number' ? v.toLocaleString('en-IN') : v);
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Looking through your history…</p>
{:else if data.empty}
	<section class="panel empty"><h2>Your records start here</h2><p class="muted">Play a few hands and your best nights, biggest pots and streaks are kept for you.</p></section>
{:else}
	<section class="panel">
		<h2>Your records</h2>
		<ul class="records-grid">
			{#each data.records as r (r.id)}
				<li>
					<h3>{r.label}</h3>
					<p class="big">{shown(r.value)} <span class="muted small">{r.unit}</span></p>
					{#if r.detail}<p class="muted tiny">{r.detail}</p>{/if}
					{#if r.at}<p class="muted tiny">{day(r.at)}</p>{/if}
					<span class="links">
						{#if r.handId}<button class="link" onclick={() => onOpenHand(r.handId ?? '')}>The hand</button>{/if}
						{#if r.nightId}<button class="link" onclick={() => onRecap(r.nightId ?? '')}>The night</button>{/if}
					</span>
				</li>
			{/each}
		</ul>
	</section>

	<section class="panel">
		<h2>Moments</h2>
		{#if data.achievements.earned.length}
			<ul class="plain">
				{#each data.achievements.earned as a (a.id)}
					<li><span><strong>{a.title}</strong><small class="muted"> {a.description}</small></span><span class="muted">{a.earnedAt ? day(a.earnedAt) : ''}</span></li>
				{/each}
			</ul>
		{:else}<p class="muted">Nothing earned yet. These come from real moments at the table, not from playing more or betting bigger.</p>{/if}
		{#if data.achievements.next.length}
			<h3>Getting close</h3>
			<ul class="plain">
				{#each data.achievements.next as a (a.id)}
					<li><span>{a.title}</span><span class="muted">{a.progress ? `${a.progress.value} of ${a.progress.target}` : ''}</span><progress max={a.progress?.target ?? 1} value={a.progress?.value ?? 0}></progress></li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.records-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.7rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.records-grid li {
		display: grid;
		gap: 0.15rem;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.8rem 0.9rem;
	}
	.links {
		display: flex;
		gap: 0.8rem;
		margin-top: 0.2rem;
	}
	progress {
		grid-column: 1 / -1;
		width: 100%;
		height: 0.35rem;
		accent-color: #e7c784;
	}
</style>
