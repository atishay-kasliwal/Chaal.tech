<script lang="ts">
	/** Your nights, then a night's hands; a hand opens the detail view. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { boots, day, gameName, time, variantName, signed } from '../format.js';
	import { SUIT, redGame } from './meter.js';
	import { track } from '#lib/analytics.js';
	import type { HandsPage, NightRow } from '../types.js';

	let {
		filter,
		onOpenHand,
		onRecap
	}: { filter: Filter; onOpenHand: (id: string) => void; onRecap: (nightId: string) => void } =
		$props();
	let nights = $state<NightRow[] | null>(null);
	let night = $state<string | null>(null);
	let handsPage = $state<HandsPage | null>(null);
	let page = $state(0);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		nights = null;
		fetchAnalytics<{ nights: NightRow[] }>('nights', params)
			.then((b) => (nights = b.nights))
			.catch((e) => (error = e.message));
	});
	$effect(() => {
		if (!night) return void (handsPage = null);
		const params = { ...filter, night, page };
		handsPage = null;
		fetchAnalytics<HandsPage>('hands', params)
			.then((b) => (handsPage = b))
			.catch((e) => (error = e.message));
	});
	function openNight(id: string) {
		night = id;
		page = 0;
		track('hand_history_opened', {});
	}
	const EXIT: Record<string, string> = {
		won: 'Won',
		lost: 'Lost at the end',
		fold: 'Packed',
		timeout: 'Timed out',
		'knock-out': 'Knocked out',
		leave: 'Left',
		unfinished: 'Stopped'
	};
	const NIGHTS_PAGE = 12;
	let nightPage = $state(0);
	const EXIT_ICON: Record<string, string> = {
		won: '♛',
		lost: '✕',
		fold: '⤵',
		timeout: '⏱',
		'knock-out': '☠',
		leave: '⇥',
		unfinished: '·'
	};
	const amount = (h: { units: number | null; points: number | null }) => h.units ?? h.points ?? 0;
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if night}
	<div class="nt">
		<div class="bar">
			<button class="round" onclick={() => (night = null)} aria-label="All nights">←</button>
			{#if handsPage}<span class="v-chip">🂠 {handsPage.total}</span>{/if}
			<button class="v-chip v-press recap" onclick={() => onRecap(night ?? '')}>☾ Recap</button>
		</div>
		{#if !handsPage}<div class="hands grid" aria-busy="true"></div>
		{:else}
			<ul class="hands grid">
				{#each handsPage.hands as h (h.handId)}
					{@const v = amount(h)}
					<li>
						<button
							class="vt v-press hand"
							onclick={() => onOpenHand(h.handId)}
							aria-label="{time(h.at)} {gameName(h.gameType)}: {EXIT[h.exit] ??
								h.exit}, {h.units !== null ? boots(h.units) : `${h.points} points`}"
							title="{gameName(h.gameType)}{h.rulesVersion && h.gameType === 'teen-patti'
								? ` · ${variantName(h.rulesVersion)}`
								: ''} · {h.players} players{h.withBots ? ' · bots' : ''} · {EXIT[h.exit] ?? h.exit}"
						>
							<span class="h-top"
								><span class:v-red={redGame(h.gameType)} aria-hidden="true"
									>{SUIT[h.gameType] ?? '•'}</span
								><span class="t">{time(h.at)}</span><span class="exit" aria-hidden="true"
									>{EXIT_ICON[h.exit] ?? '·'}</span
								></span
							>
							<strong class="v-big" class:v-pos={v > 0} class:v-neg={v < 0}>{signed(v, 0)}</strong>
							<span class="who">👥 {h.players}{h.withBots ? ' 🤖' : ''}</span>
						</button>
					</li>
				{/each}
			</ul>
			{#if handsPage.total > handsPage.pageSize}
				<div class="pager">
					<button disabled={page === 0} onclick={() => page--} aria-label="Newer">←</button><span
						>{page + 1} / {Math.ceil(handsPage.total / handsPage.pageSize)}</span
					><button
						disabled={(page + 1) * handsPage.pageSize >= handsPage.total}
						onclick={() => page++}
						aria-label="Older">→</button
					>
				</div>
			{/if}
		{/if}
	</div>
{:else if !nights}<div class="nt" aria-busy="true"></div>
{:else if !nights.length}<div class="v-zero">
		<span aria-hidden="true">☾</span><strong>0 nights</strong>
	</div>
{:else}
	{@const pages = Math.ceil(nights.length / NIGHTS_PAGE)}
	<div class="nt">
		<ul class="grid">
			{#each nights.slice(nightPage * NIGHTS_PAGE, (nightPage + 1) * NIGHTS_PAGE) as n (n.nightId)}
				<li>
					<button
						class="vt v-press night"
						onclick={() => openNight(n.nightId)}
						aria-label="{day(n.startedAt)}: {boots(n.units)} over {n.hands} hands"
						title="{time(n.startedAt)}–{time(n.endedAt)} · {Object.keys(n.games)
							.map(gameName)
							.join(', ')}"
					>
						<span class="date">{day(n.startedAt)}</span>
						<strong class="v-big" class:v-pos={n.units > 0} class:v-neg={n.units < 0}
							>{signed(n.units, 0)}</strong
						>
						<span class="meta"
							>🂠 {n.hands}<span class="suits"
								>{#each Object.keys(n.games) as g (g)}<span class:v-red={redGame(g)}
										>{SUIT[g] ?? '•'}</span
									>{/each}</span
							>{#if n.withBots}<span aria-hidden="true">🤖</span>{/if}</span
						>
					</button>
				</li>
			{/each}
		</ul>
		{#if pages > 1}
			<div class="pager">
				<button disabled={nightPage === 0} onclick={() => nightPage--} aria-label="Newer">←</button
				><span>{nightPage + 1} / {pages}</span><button
					disabled={nightPage + 1 >= pages}
					onclick={() => nightPage++}
					aria-label="Older">→</button
				>
			</div>
		{/if}
	</div>
{/if}

<style>
	.nt {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.recap {
		margin-left: auto;
	}
	.round {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: #ffffff10;
		cursor: pointer;
	}
	.round:hover,
	.round:focus-visible {
		background: var(--butter);
		color: var(--night);
	}
	.grid {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: minmax(0, 1fr);
		gap: 12px;
	}
	.grid.hands {
		grid-template-columns: repeat(5, 1fr);
	}
	.grid li {
		min-height: 0;
		display: flex;
	}
	.night,
	.hand {
		width: 100%;
		justify-content: center;
		text-align: left;
		gap: 4px;
	}
	.date {
		font-size: 12px;
		color: var(--muted);
		font-weight: 700;
	}
	.night strong,
	.hand strong {
		font-size: clamp(22px, 2.6vw, 36px);
	}
	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
		color: var(--muted);
	}
	.suits {
		display: inline-flex;
		gap: 3px;
		color: var(--paper);
	}
	.h-top {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.t {
		font-size: 11px;
		color: var(--muted);
	}
	.exit {
		margin-left: auto;
		color: var(--butter);
	}
	.who {
		font-size: 11px;
		color: var(--muted);
	}
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 14px;
		font-size: 13px;
		color: var(--muted);
	}
	.pager button {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: #ffffff10;
		color: var(--paper);
		cursor: pointer;
	}
	.pager button:disabled {
		opacity: 0.3;
	}
	@media (max-width: 1000px) {
		.grid {
			grid-template-columns: repeat(3, 1fr);
		}
		.grid.hands {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	@media (max-width: 720px) {
		.nt {
			gap: 8px;
		}
		.grid,
		.grid.hands {
			grid-template-columns: repeat(3, 1fr);
			gap: 8px;
		}
		.night strong,
		.hand strong {
			font-size: 18px;
		}
		.meta .suits {
			display: none;
		}
	}
</style>
