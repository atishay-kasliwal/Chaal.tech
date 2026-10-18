<script lang="ts">
	/** The club's own story: celebratory records and a light timeline. Nothing here ranks or shames anyone. */
	import { fetchAnalytics } from '../api.js';
	import { day } from '../format.js';
	import type { ClubRecordsView, TimelineView } from '../types.js';

	let { onOpenHand, onRecap }: { onOpenHand: (id: string) => void; onRecap: (nightId: string) => void } = $props();
	let records = $state<ClubRecordsView | null>(null);
	let timeline = $state<TimelineView | null>(null);
	let error = $state('');
	$effect(() => {
		fetchAnalytics<ClubRecordsView>('club', {}).then((b) => (records = b)).catch((e) => (error = e.message));
		fetchAnalytics<TimelineView>('timeline', {}).then((b) => (timeline = b)).catch(() => (timeline = { empty: true, events: [] }));
	});
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !records}<p class="muted">Gathering the club’s story…</p>
{:else if records.empty}
	<section class="panel empty"><h2>The club’s history starts tonight</h2><p class="muted">Records and milestones appear after the first night of recorded hands.</p></section>
{:else}
	<section class="panel">
		<h2>Club records</h2>
		<ul class="records-grid">
			{#each records.records as r (r.id)}
				<li>
					<h3>{r.label}</h3>
					<p class="big">{typeof r.value === 'number' ? r.value.toLocaleString('en-IN') : r.value}</p>
					<p class="muted tiny">{r.unit}{r.holder ? ` · ${r.holder}` : ''}{r.at ? ` · ${day(r.at)}` : ''}</p>
					<span class="links">
						{#if r.handId}<button class="link" onclick={() => onOpenHand(r.handId ?? '')}>The hand</button>{/if}
						{#if r.nightId}<button class="link" onclick={() => onRecap(r.nightId ?? '')}>The night</button>{/if}
					</span>
				</li>
			{/each}
		</ul>
	</section>
	{#if timeline && !timeline.empty}
		<section class="panel">
			<h2>Timeline</h2>
			<ol class="timeline">
				{#each timeline.events as e (e.id)}
					<li><time>{day(e.at)}</time><span>{e.text}</span>{#if e.handId}<button class="link" onclick={() => onOpenHand(e.handId ?? '')}>See</button>{/if}</li>
				{/each}
			</ol>
		</section>
	{/if}
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
	}
	.timeline {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0 0 0 0.2rem;
		list-style: none;
		border-left: 2px solid rgb(231 199 132 / 25%);
	}
	.timeline li {
		display: grid;
		grid-template-columns: 6.5rem 1fr auto;
		gap: 0.6rem;
		padding-left: 0.8rem;
		font-size: 0.88rem;
	}
	.timeline time {
		color: #d5b67a;
		font-size: 0.75rem;
	}
	@media (max-width: 36rem) {
		.timeline li {
			grid-template-columns: 1fr;
			gap: 0.1rem;
		}
	}
</style>
