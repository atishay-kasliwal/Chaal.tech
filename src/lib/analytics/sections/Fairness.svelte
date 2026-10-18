<script lang="ts">
	/**
	 * The fairness center: is the deal consistent with a fair shuffle, and was each deck sealed before
	 * anyone played. It says plainly what can and cannot be shown, and never makes ordinary short-term
	 * unevenness look suspicious.
	 */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { cardLabel, plural } from '../format.js';
	import ShareBars from '../charts/ShareBars.svelte';
	import type { FairnessView } from '../types.js';

	let { filter }: { filter: Filter } = $props();
	let data = $state<FairnessView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		data = null;
		error = '';
		fetchAnalytics<FairnessView>('fairness', params).then((b) => (data = b)).catch((e) => (error = e.message));
	});
	const RANKS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
	const SUITS: Record<string, string> = { hearts: '♥ Hearts', diamonds: '♦ Diamonds', clubs: '♣ Clubs', spades: '♠ Spades' };
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Checking the deck…</p>
{:else}
	<section class="panel fairness">
		<h2>Is the deck fair?</h2>
		<p class="verdict" class:warn={data.you.verdict === 'unusual'}>
			{data.you.verdict === 'insufficient'
				? `Not enough cards yet to judge: ${data.you.sample.cards} dealt to you so far. Short runs always look uneven.`
				: data.you.verdict === 'fair'
					? `Your ${data.you.sample.cards} cards look like a fair shuffle.`
					: `Your ${data.you.sample.cards} cards look unusual for a fair deck, even after allowing for checking many things at once. Tell the club owner.`}
		</p>
		{#if data.you.verdict !== 'insufficient'}
			<p class="muted small">
				{data.you.outsideBand} of 17 bars sit outside the usual band. About one in twenty always does, so {data.you.expectedOutside < 1 ? 'one' : 'a couple'} would be normal.
			</p>
			<div class="two">
				<ShareBars bars={data.you.ranks.map((r) => ({ key: String(r.rank), label: RANKS[r.rank] ?? String(r.rank), value: r.count, expected: r.expected, text: `${r.count}`, dim: r.within }))} expectedLabel="fair deck" />
				<div>
					<ShareBars bars={data.you.suits.map((s) => ({ key: s.suit, label: SUITS[s.suit], value: s.count, expected: s.expected, text: `${s.count}`, dim: s.within }))} expectedLabel="fair deck" />
					{#if data.you.mostDealt.length}
						<p class="muted small">Dealt to you most: {data.you.mostDealt.map((c) => `${cardLabel(c)} (${c.count}, about ${c.expected} expected)`).join(', ')}. Ordinary variation.</p>
					{/if}
				</div>
			</div>
			{#if data.you.convergence.length > 1}
				{@const last = data.you.convergence.at(-1)}
				<p class="muted small">The gap between your busiest rank and an even split shrinks as you are dealt more cards, as it should: {data.you.convergence.map((c) => `${Math.round(c.deviation * 100)}% at ${c.cards} cards`).join(', ')}{#if last}; a fair deck would typically show about {Math.round(last.typical * 100)}% by now{/if}.</p>
			{/if}
		{/if}
	</section>

	{#if data.integrity && data.integrity.hands}
		<section class="panel">
			<h2>Was each deck sealed first?</h2>
			<ul class="plain">
				<li><span>Deck sealed before dealing</span><strong>{data.integrity.sealedBeforeDealing} of {data.integrity.hands}</strong><span></span></li>
				<li><span>Cut by a player, not the server</span><strong>{data.integrity.cutByAPlayer} of {data.integrity.hands}</strong><span></span></li>
				<li><span>Replayed exactly from its record</span><strong>{data.integrity.replayVerified} of {data.integrity.hands}</strong><span></span></li>
			</ul>
		</section>
	{/if}

	{#if data.club}
		<section class="panel">
			<h2>Across the whole club</h2>
			<p class="muted small">{plural(data.club.cards, 'card')} dealt. {data.club.note}</p>
			<div class="two">
				<ShareBars bars={data.club.ranks.map((r) => ({ key: String(r.rank), label: RANKS[r.rank] ?? String(r.rank), value: r.count, expected: r.expected, text: `${r.count}` }))} expectedLabel="fair deck" />
				<ShareBars bars={data.club.suits.map((s) => ({ key: s.suit, label: SUITS[s.suit], value: s.count, expected: s.expected, text: `${s.count}` }))} expectedLabel="fair deck" />
			</div>
		</section>
	{/if}

	<section class="panel">
		<h2>What this can and cannot show</h2>
		<ul class="notes">{#each data.explain.what as t (t)}<li>{t}</li>{/each}</ul>
		<h3>It cannot</h3>
		<ul class="notes">{#each data.explain.cannot as t (t)}<li>{t}</li>{/each}</ul>
		<p class="muted small">{data.explain.howToRead}</p>
	</section>
{/if}

<style>
	.verdict {
		font-size: 1.05rem;
	}
	.verdict.warn {
		color: #f4d68c;
	}
	.notes {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding-left: 1.1rem;
		color: #d6d9cd;
		font-size: 0.85rem;
		line-height: 1.45;
	}
</style>
