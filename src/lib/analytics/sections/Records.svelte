<script lang="ts">
	/** Your records and the few achievements that come from real moments. Every one opens its evidence. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { day } from '../format.js';
	import type { Names, RecordsView } from '../types.js';

	let {
		filter,
		onOpenHand,
		onRecap
	}: { filter: Filter; onOpenHand: (id: string) => void; onRecap: (nightId: string) => void } =
		$props();
	let data = $state<(RecordsView & { names: Names }) | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { game: filter.game };
		data = null;
		error = '';
		fetchAnalytics<RecordsView & { names: Names }>('records', params)
			.then((b) => (data = b))
			.catch((e) => (error = e.message));
	});
	const shown = (v: number | string) => (typeof v === 'number' ? v.toLocaleString('en-IN') : v);
	const ICON: Record<string, string> = {
		'best-night': '☾',
		'best-night-per-hand': '⚡',
		'most-hands-night': '🂠',
		'biggest-comeback': '↺',
		'biggest-pot': '💰',
		'longest-streak': '🔥',
		'best-hand': '♛'
	};
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<div class="rc" aria-busy="true"></div>
{:else if data.empty}<div class="v-zero">
		<span aria-hidden="true">♛</span><strong>0 records</strong>
	</div>
{:else}
	<div class="rc">
		<ul class="recs">
			{#each data.records.slice(0, 8) as r (r.id)}
				<li
					class="vt rec"
					title="{r.label}{r.detail ? ` · ${r.detail}` : ''}{r.at ? ` · ${day(r.at)}` : ''}"
				>
					<span class="r-ic" aria-hidden="true">{ICON[r.id] ?? '♛'}</span>
					<strong class="v-big val">{shown(r.value)}</strong>
					<span class="unit">{r.unit}</span>
					<span class="lbl">{r.label}</span>
					<span class="links">
						{#if r.at}<span class="when">{day(r.at)}</span>{/if}
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
		<section class="vt moments" aria-labelledby="mo-title">
			<h2 id="mo-title"><span class="ic" aria-hidden="true">✦</span> Moments</h2>
			<div class="badges">
				{#each data.achievements.earned.slice(0, 6) as a (a.id)}
					<span
						class="badge earned"
						title="{a.title}: {a.description}{a.earnedAt ? ` · ${day(a.earnedAt)}` : ''}"
						><span aria-hidden="true">★</span>{a.title}</span
					>
				{/each}
				{#each data.achievements.next.slice(0, 4) as a (a.id)}
					{@const pr = a.progress ? a.progress.value / a.progress.target : 0}
					<span class="badge next" title="{a.title}: {a.description}" style:--p={pr}
						><span class="ring" aria-hidden="true"></span>{a.title}{#if a.progress}<small
								>{a.progress.value}/{a.progress.target}</small
							>{/if}</span
					>
				{/each}
				{#if !data.achievements.earned.length && !data.achievements.next.length}<span class="v-zero"
						><span aria-hidden="true">★</span><span>0 yet</span></span
					>{/if}
			</div>
		</section>
	</div>
{/if}

<style>
	.rc {
		height: 100%;
		min-height: 0;
		display: grid;
		gap: 12px;
		grid-template-rows: minmax(0, 1fr) auto;
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
	.r-ic {
		position: absolute;
		top: 12px;
		right: 14px;
		font-size: 22px;
		color: var(--butter);
	}
	.val {
		font-size: clamp(28px, 3.4vw, 48px);
	}
	.unit {
		font-size: 12px;
		color: var(--muted);
	}
	.lbl {
		font-size: 12px;
		font-weight: 700;
		line-height: 1.3;
		display: -webkit-box;
		line-clamp: 2;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.links {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-top: 4px;
	}
	.when {
		font-size: 11px;
		color: var(--muted);
		margin-right: auto;
	}
	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.badge {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 7px 12px;
		border-radius: 100px;
		background: #ffffff0d;
		font-size: 12px;
		font-weight: 700;
	}
	.badge.earned {
		background: #f2dc9124;
		color: var(--butter);
	}
	.badge small {
		color: var(--muted);
		font-weight: 600;
	}
	.ring {
		--p: 0;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background:
			radial-gradient(closest-side, #2c263b 60%, transparent 62%),
			conic-gradient(var(--butter) calc(var(--p) * 1turn), #ffffff22 0);
	}
	@media (max-width: 1000px) {
		.recs {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 720px) {
		.rc {
			gap: 8px;
		}
		.recs {
			gap: 8px;
		}
		.recs li:nth-child(n + 7) {
			display: none;
		}
		.badges .badge:nth-child(n + 5) {
			display: none;
		}
	}
</style>
