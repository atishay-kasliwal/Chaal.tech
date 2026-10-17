<script lang="ts">
	/** The first screen: am I winning, is it real, how is it going, and what stands out. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { boots, day, fairPhrase, gameName, plural, resultsPhrase, signed, UNIT_NAMES } from '../format.js';
	import TrendLine from '../charts/TrendLine.svelte';
	import NightBars from '../charts/NightBars.svelte';
	import RangeRows from '../charts/RangeRows.svelte';
	import InsightCard from './InsightCard.svelte';
	import type { Insight, Overview as OverviewData } from '../types.js';

	let { filter, onOpenHand, onSection }: { filter: Filter; onOpenHand: (id: string) => void; onSection: (s: string) => void } = $props();
	let data = $state<OverviewData | null>(null);
	let insights = $state<Insight[]>([]);
	let error = $state('');

	$effect(() => {
		const params = { ...filter };
		data = null;
		error = '';
		fetchAnalytics<{ overview: OverviewData }>('overview', params).then((b) => (data = b.overview)).catch((e) => (error = e.message));
		fetchAnalytics<{ insights: Insight[] }>('insights', params).then((b) => (insights = b.insights.filter((i) => i.eligible))).catch(() => (insights = []));
	});
</script>

{#if error}
	<p class="notice" role="alert">{error}</p>
{:else if !data}
	<p class="muted">Counting your hands…</p>
{:else if !data.hands}
	<section class="panel empty">
		<h2>No recorded hands yet</h2>
		<p class="muted">Play a few hands with friends and your stats start here. Every hand from now on is kept.</p>
	</section>
{:else}
	{@const r = data.results}
	{@const fair = data.fairShare}
	<section class="panel headline">
		<p class="eyebrow">{data.hands} hands · {data.nights} {data.nights === 1 ? 'night' : 'nights'} · {Object.keys(data.games).map(gameName).join(', ')}</p>
		<h2 class:up={r.verdict === 'winning'} class:down={r.verdict === 'losing'}>{resultsPhrase(r)}</h2>
		<p class="muted">
			{boots(r.units)} in total{#if data.rummy} · Rummy {signed(data.rummy.units, 0)} points{/if}. Results are in boots (a
			Hold’em big blind, a Blackjack bet), so stakes compare fairly.
		</p>
		<div class="duo">
			<div>
				<h3>Boots a hand</h3>
				<RangeRows rows={[{ key: 'all', label: 'All your hands', value: r.perHand, low: r.perHandLow, high: r.perHandHigh, detail: `${r.hands} hands` }]} />
			</div>
			<div>
				<h3>Wins against your fair share</h3>
				<p class="big">{fair.wins}<span class="muted"> of {Math.round(fair.expected * 10) / 10} expected</span></p>
				<p class="muted small">{fairPhrase(fair)}. Your fair share is one win in two heads-up and one in six at a full table.</p>
			</div>
		</div>
	</section>

	{#if insights.length}
		<section class="panel">
			<div class="row-head">
				<h2>What stands out</h2>
				<span class="muted tiny">Only patterns that survive a check for luck</span>
			</div>
			<div class="insights">
				{#each insights.slice(0, 4) as insight (insight.id)}<InsightCard {insight} {onOpenHand} />{/each}
			</div>
		</section>
	{/if}

	<section class="panel two">
		<div>
			<h2>Running total</h2>
			<TrendLine points={data.cumulative} />
			{#if data.trend.verdict !== 'insufficient'}
				<p class="muted small">
					Last 30 days: {signed(data.trend.recent, 2)} a hand, before that {signed(data.trend.earlier, 2)}.
					{data.trend.verdict === 'steady' ? 'No real change.' : data.trend.verdict === 'improving' ? 'You are playing better lately.' : 'A rougher patch lately.'}
				</p>
			{/if}
		</div>
		<div>
			<h2>Recent nights</h2>
			<NightBars nights={data.recentNights} />
			<button class="link" onclick={() => onSection('history')}>All nights and hands</button>
		</div>
	</section>

	{#if r.bestNight || data.biggestPot}
		<section class="panel records">
			{#if r.bestNight}<div><h3>Best night</h3><p class="big up">{boots(r.bestNight.units)}</p><p class="muted small">{day(r.bestNight.at)} · {plural(r.bestNight.hands, 'hand')}</p></div>{/if}
			{#if r.worstNight}<div><h3>Hardest night</h3><p class="big down">{boots(r.worstNight.units)}</p><p class="muted small">{day(r.worstNight.at)} · {plural(r.worstNight.hands, 'hand')}</p></div>{/if}
			{#if data.biggestPot}{@const pot = data.biggestPot}<div><h3>Biggest pot won</h3><p class="big">{data.biggestPot.units} {UNIT_NAMES[data.biggestPot.gameType]?.[1] ?? 'boots'}</p><button class="link" onclick={() => onOpenHand(pot.handId)}>{gameName(data.biggestPot.gameType)}, {day(data.biggestPot.at)}</button></div>{/if}
		</section>
	{/if}
{/if}
