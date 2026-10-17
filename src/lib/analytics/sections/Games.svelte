<script lang="ts">
	/** Where you play, and where you play well: kept apart, and "best" only when it is clear. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { EVIDENCE_LABEL, gameName, signed, variantName, UNIT_NAMES } from '../format.js';
	import RangeRows from '../charts/RangeRows.svelte';
	import type { GamesView, GameGroup, Pick } from '../types.js';

	let { filter }: { filter: Filter } = $props();
	let data = $state<GamesView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { window: filter.window, company: filter.company };
		data = null;
		fetchAnalytics<{ games: GamesView }>('games', params).then((b) => (data = b.games)).catch((e) => (error = e.message));
	});
	const label = (pick: Pick, what: string) =>
		pick?.key ? gameName(pick.key) : pick?.reason === 'too-close' ? `No clear ${what} yet` : `Needs more hands`;
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Comparing games…</p>
{:else if !data.games.length}<p class="muted">No recorded hands yet.</p>
{:else}
	<section class="panel chips">
		<div><h3>Most played</h3><p class="big">{data.labels.mostPlayed ? gameName(data.labels.mostPlayed) : '–'}</p></div>
		<div><h3>Best results</h3><p class="big">{label(data.labels.best, 'best game')}</p></div>
		<div><h3>Toughest</h3><p class="big">{label(data.labels.worst, 'weakest game')}</p></div>
		<div><h3>Most won</h3><p class="big">{data.labels.mostProfitable ? gameName(data.labels.mostProfitable) : 'Needs more hands'}</p></div>
	</section>
	<section class="panel">
		<h2>Results by game</h2>
		<p class="muted small">Each in its own stake: Teen Patti boots, Hold’em big blinds, Blackjack bets, Rummy points.</p>
		<RangeRows
			unit="stakes a hand"
			scale="row"
			rows={data.games.map((g: GameGroup) => ({
				key: g.key,
				label: gameName(g.key),
				value: g.results.perHand,
				low: g.results.perHandLow,
				high: g.results.perHandHigh,
				detail: `${g.hands} hands · ${UNIT_NAMES[g.key]?.[1] ?? ''}`,
				dim: g.results.evidence === 'insufficient'
			}))}
		/>
	</section>
	{#if data.variants.length}
		<section class="panel">
			<h2>Teen Patti variants</h2>
			<p class="muted small">Small samples lean toward your overall Teen Patti results, so one lucky night does not make a “best variant”.</p>
			<table class="data-table">
				<thead><tr><th>Variant</th><th>Hands</th><th>Boots a hand</th><th>Wins vs fair</th><th>Evidence</th></tr></thead>
				<tbody>
					{#each data.variants as v (v.key)}
						<tr class:dim={v.results.evidence === 'insufficient'}>
							<td>{variantName(v.key)}</td>
							<td>{v.hands}</td>
							<td>{signed(v.shrunkPerHand, 2)}</td>
							<td>{v.fairShare.ratio === null ? '–' : `${v.fairShare.wins} / ${v.fairShare.expected}`}</td>
							<td class="muted">{EVIDENCE_LABEL[v.results.evidence]}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if data.labels.bestVariant.key}<p class="small">Clearly your best variant: <strong>{variantName(data.labels.bestVariant.key)}</strong>.</p>{/if}
		</section>
	{/if}
{/if}
