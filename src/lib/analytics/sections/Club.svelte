<script lang="ts">
	/** The club's own story: celebratory records and a light timeline. Nothing here ranks or shames anyone. */
	import { fetchAnalytics } from '../api.js';
	import { day } from '../format.js';
	import type { ClubRecordsView, TimelineView } from '../types.js';

	let {
		onOpenHand,
		onRecap
	}: { onOpenHand: (id: string) => void; onRecap: (nightId: string) => void } = $props();
	let records = $state<ClubRecordsView | null>(null);
	let timeline = $state<TimelineView | null>(null);
	let error = $state('');
	$effect(() => {
		fetchAnalytics<ClubRecordsView>('club', {})
			.then((b) => (records = b))
			.catch((e) => (error = e.message));
		fetchAnalytics<TimelineView>('timeline', {})
			.then((b) => (timeline = b))
			.catch(() => (timeline = { empty: true, events: [] }));
	});
	let tPage = $state(0);
	const T_PAGE = 6;
	const TYPE_ICON: Record<string, string> = {
		record: '♛',
		milestone: '★',
		night: '☾',
		first: '✦',
		hand: '🂠'
	};
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !records}<div class="cl" aria-busy="true"></div>
{:else if records.empty}<div class="v-zero">
		<span aria-hidden="true">👥</span><strong>Starts tonight</strong>
	</div>
{:else}
	<div class="cl">
		<ul class="recs">
			{#each records.records.slice(0, 8) as r (r.id)}
				<li
					class="vt rec"
					title="{r.label}{r.holder ? ` · ${r.holder}` : ''}{r.at ? ` · ${day(r.at)}` : ''}"
				>
					<strong class="v-big val"
						>{typeof r.value === 'number' ? r.value.toLocaleString('en-IN') : r.value}</strong
					>
					<span class="unit">{r.unit}</span>
					<span class="lbl">{r.label}</span>
					<span class="links">
						{#if r.holder}<span class="holder">♛ {r.holder}</span>{/if}
						{#if r.handId}<button
								class="v-chip v-press"
								onclick={() => onOpenHand(r.handId ?? '')}
								aria-label="The hand: {r.label}">🂠</button
							>{/if}
						{#if r.nightId}<button
								class="v-chip v-press"
								onclick={() => onRecap(r.nightId ?? '')}
								aria-label="The night: {r.label}">☾</button
							>{/if}
					</span>
				</li>
			{/each}
		</ul>
		{#if timeline && !timeline.empty}
			{@const pages = Math.ceil(timeline.events.length / T_PAGE)}
			<section class="vt line" aria-labelledby="tl-title">
				<h2 id="tl-title">
					<span class="ic" aria-hidden="true">◷</span> Timeline
					{#if pages > 1}<span class="tp"
							><button disabled={tPage === 0} onclick={() => tPage--} aria-label="Newer">←</button
							><button disabled={tPage + 1 >= pages} onclick={() => tPage++} aria-label="Older"
								>→</button
							></span
						>{/if}
				</h2>
				<ol class="events">
					{#each timeline.events.slice(tPage * T_PAGE, (tPage + 1) * T_PAGE) as e (e.id)}
						<li>
							<span class="e-ic" aria-hidden="true">{TYPE_ICON[e.type] ?? '•'}</span>
							<time>{day(e.at)}</time>
							<span class="e-text">{e.text}</span>
							{#if e.handId}<button
									class="v-chip v-press"
									onclick={() => onOpenHand(e.handId ?? '')}
									aria-label="See the hand">🂠</button
								>{/if}
						</li>
					{/each}
				</ol>
			</section>
		{/if}
	</div>
{/if}

<style>
	.cl {
		height: 100%;
		min-height: 0;
		display: grid;
		gap: 12px;
		grid-template-rows: minmax(0, 1fr) minmax(0, 0.9fr);
	}
	.recs {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: minmax(0, 1fr);
		gap: 12px;
		min-height: 0;
	}
	.rec {
		justify-content: center;
		gap: 4px;
	}
	.val {
		font-size: clamp(26px, 3vw, 42px);
	}
	.unit {
		font-size: 12px;
		color: var(--muted);
	}
	.lbl {
		font-size: 12px;
		font-weight: 700;
	}
	.links {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.holder {
		font-size: 12px;
		color: var(--butter);
		margin-right: auto;
	}
	.tp {
		margin-left: auto;
		display: flex;
		gap: 6px;
	}
	.tp button {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: #ffffff10;
		cursor: pointer;
	}
	.tp button:disabled {
		opacity: 0.3;
	}
	.events {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		min-height: 0;
	}
	.events li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		grid-template-rows: auto auto;
		column-gap: 8px;
		align-items: center;
		padding: 8px 10px;
		border-radius: 12px;
		background: #ffffff07;
	}
	.e-ic {
		grid-row: span 2;
		font-size: 18px;
		color: var(--butter);
	}
	.events time {
		font-size: 11px;
		color: var(--muted);
	}
	.e-text {
		grid-column: 2;
		font-size: 12px;
		line-height: 1.3;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.events li > button {
		grid-row: 1 / span 2;
		grid-column: 3;
	}
	@media (max-width: 1000px) {
		.recs {
			grid-template-columns: repeat(2, 1fr);
		}
		.events {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 720px) {
		.cl,
		.recs {
			gap: 8px;
		}
		.recs li:nth-child(n + 5) {
			display: none;
		}
		.events {
			grid-template-columns: 1fr;
		}
		.events li:nth-child(n + 4) {
			display: none;
		}
	}
</style>
