<script lang="ts">
	/** Your nights, then a night's hands; a hand opens the detail view. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { boots, day, gameName, time, variantName } from '../format.js';
	import { track } from '#lib/analytics.js';
	import type { HandsPage, NightRow } from '../types.js';

	let { filter, onOpenHand }: { filter: Filter; onOpenHand: (id: string) => void } = $props();
	let nights = $state<NightRow[] | null>(null);
	let night = $state<string | null>(null);
	let handsPage = $state<HandsPage | null>(null);
	let page = $state(0);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		nights = null;
		fetchAnalytics<{ nights: NightRow[] }>('nights', params).then((b) => (nights = b.nights)).catch((e) => (error = e.message));
	});
	$effect(() => {
		if (!night) return void (handsPage = null);
		const params = { ...filter, night, page };
		handsPage = null;
		fetchAnalytics<HandsPage>('hands', params).then((b) => (handsPage = b)).catch((e) => (error = e.message));
	});
	function openNight(id: string) {
		night = id;
		page = 0;
		track('hand_history_opened', {});
	}
	const EXIT: Record<string, string> = { won: 'Won', lost: 'Lost at the end', fold: 'Packed', timeout: 'Timed out', 'knock-out': 'Knocked out', leave: 'Left', unfinished: 'Stopped' };
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if night}
	<button class="link back" onclick={() => (night = null)}>← All nights</button>
	{#if !handsPage}<p class="muted">Loading hands…</p>
	{:else}
		<section class="panel">
			<h2>{handsPage.total} hands</h2>
			<ul class="hand-list">
				{#each handsPage.hands as h (h.handId)}
					<li>
						<button onclick={() => onOpenHand(h.handId)}>
							<span class="muted small">{time(h.at)}</span>
							<span>{gameName(h.gameType)}{#if h.rulesVersion && h.gameType === 'teen-patti'} · {variantName(h.rulesVersion)}{/if}<small>{h.players} players{h.withBots ? ' · bots' : ''}</small></span>
							<span class="muted small">{EXIT[h.exit] ?? h.exit}</span>
							<strong class:up={(h.units ?? h.points ?? 0) > 0} class:down={(h.units ?? h.points ?? 0) < 0}>{h.units !== null ? boots(h.units) : `${h.points} pts`}</strong>
						</button>
					</li>
				{/each}
			</ul>
			{#if handsPage.total > handsPage.pageSize}
				<div class="pager">
					<button disabled={page === 0} onclick={() => page--}>Newer</button>
					<span class="muted small">Page {page + 1} of {Math.ceil(handsPage.total / handsPage.pageSize)}</span>
					<button disabled={(page + 1) * handsPage.pageSize >= handsPage.total} onclick={() => page++}>Older</button>
				</div>
			{/if}
		</section>
	{/if}
{:else if !nights}<p class="muted">Loading your nights…</p>
{:else if !nights.length}<p class="muted">No recorded nights yet.</p>
{:else}
	<section class="panel">
		<h2>Your nights</h2>
		<ul class="hand-list">
			{#each nights as n (n.nightId)}
				<li>
					<button onclick={() => openNight(n.nightId)}>
						<span>{day(n.startedAt)}<small>{time(n.startedAt)}–{time(n.endedAt)}</small></span>
						<span class="muted small">{n.hands} hands · {Object.keys(n.games).map(gameName).join(', ')}{n.withBots ? ' · bots' : ''}</span>
						<strong class:up={n.units > 0} class:down={n.units < 0}>{boots(n.units)}</strong>
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}
