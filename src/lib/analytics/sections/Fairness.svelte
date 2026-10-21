<script lang="ts">
	/**
	 * The fairness center: is the deal consistent with a fair shuffle, and was each deck sealed before
	 * anyone played. It says plainly what can and cannot be shown, and never makes ordinary short-term
	 * unevenness look suspicious.
	 */
	import { fetchAnalytics, type Filter } from '../api.js';

	import type { FairnessView } from '../types.js';

	let { filter }: { filter: Filter } = $props();
	let data = $state<FairnessView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		data = null;
		error = '';
		fetchAnalytics<FairnessView>('fairness', params)
			.then((b) => (data = b))
			.catch((e) => (error = e.message));
	});
	const RANKS: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
	const SUITS: Record<string, string> = {
		hearts: '♥ Hearts',
		diamonds: '♦ Diamonds',
		clubs: '♣ Clubs',
		spades: '♠ Spades'
	};
	const RANK_TOP = $derived(
		Math.max(1, ...(data?.you.ranks ?? []).map((r) => Math.max(r.count, r.high)))
	);
	const SUIT_TOP = $derived(
		Math.max(1, ...(data?.you.suits ?? []).map((r) => Math.max(r.count, r.high)))
	);
	const GLYPH: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
	const verdictText = $derived(
		!data
			? ''
			: data.you.verdict === 'insufficient'
				? `Not enough cards yet to judge: ${data.you.sample.cards} dealt to you.`
				: data.you.verdict === 'fair'
					? `Your ${data.you.sample.cards} cards look like a fair shuffle. ${data.you.outsideBand} of 17 bars outside the usual band; about one in twenty always is.`
					: `Your ${data.you.sample.cards} cards look unusual for a fair deck. Tell the club owner.`
	);
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<section class="vt fair" aria-busy="true"></section>
{:else}
	<section class="vt fair" aria-labelledby="fair-title">
		<h2 id="fair-title">
			<span class="ic" aria-hidden="true">⚖</span> Fair deck?
			<span
				class="badge"
				class:ok={data.you.verdict === 'fair'}
				class:warn={data.you.verdict === 'unusual'}
				title={verdictText}
				aria-label={verdictText}
				>{data.you.verdict === 'fair' ? '✓' : data.you.verdict === 'unusual' ? '⚠' : '?'}</span
			>
			<span class="sample">🂠 {data.you.sample.cards}</span>
		</h2>
		{#if data.you.verdict !== 'insufficient'}
			<div class="hist" role="img" aria-label="Cards dealt to you by rank, against a fair deck">
				{#each data.you.ranks as r (r.rank)}
					<div class="col" title="{RANKS[r.rank] ?? r.rank}: {r.count} (fair {r.expected})">
						<span
							class="band"
							style:bottom="{(r.low / RANK_TOP) * 100}%"
							style:height="{((r.high - r.low) / RANK_TOP) * 100}%"
						></span>
						<span class="bar" class:out={!r.within} style:height="{(r.count / RANK_TOP) * 100}%"
						></span>
						<span class="r">{RANKS[r.rank] ?? r.rank}</span>
					</div>
				{/each}
				<span class="gap" aria-hidden="true"></span>
				{#each data.you.suits as x (x.suit)}
					<div class="col suit" title="{GLYPH[x.suit]}: {x.count} (fair {x.expected})">
						<span
							class="band"
							style:bottom="{(x.low / SUIT_TOP) * 100}%"
							style:height="{((x.high - x.low) / SUIT_TOP) * 100}%"
						></span>
						<span class="bar" class:out={!x.within} style:height="{(x.count / SUIT_TOP) * 100}%"
						></span>
						<span class="r" class:v-red={x.suit === 'hearts' || x.suit === 'diamonds'}
							>{GLYPH[x.suit]}</span
						>
					</div>
				{/each}
			</div>
		{:else}<div class="v-zero">
				<span aria-hidden="true">?</span><span>🂠 {data.you.sample.cards}</span>
			</div>{/if}
		{#if data.integrity && data.integrity.hands}
			{@const n = data.integrity.hands}
			<ul class="seal" aria-label="Deck checks">
				<li title="Deck sealed before dealing">
					<span aria-hidden="true">🔒</span><b>{data.integrity.sealedBeforeDealing}/{n}</b><span
						class="sr">sealed before dealing</span
					>
				</li>
				<li title="Cut by a player, not the server">
					<span aria-hidden="true">✂</span><b>{data.integrity.cutByAPlayer}/{n}</b><span class="sr"
						>cut by a player</span
					>
				</li>
				<li title="Replayed exactly from its record">
					<span aria-hidden="true">↺</span><b>{data.integrity.replayVerified}/{n}</b><span
						class="sr">replayed exactly</span
					>
				</li>
			</ul>
		{/if}
	</section>
{/if}

<style>
	.fair {
		height: 100%;
	}
	.badge {
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: #ffffff14;
		font-size: 13px;
	}
	.badge.ok {
		background: #a9cfb52e;
		color: #a9cfb5;
	}
	.badge.warn {
		background: #ee715b2e;
		color: #f39788;
	}
	.sample {
		margin-left: auto;
		font-size: 12px;
		color: var(--muted);
		font-family: system-ui, sans-serif;
	}
	.hist {
		flex: 1;
		min-height: 60px;
		display: flex;
		align-items: stretch;
		gap: 3px;
		padding-bottom: 18px;
	}
	.col {
		position: relative;
		flex: 1;
		min-width: 0;
	}
	.band {
		position: absolute;
		left: 0;
		right: 0;
		background: #f2dc9124;
		border-radius: 3px;
	}
	.bar {
		position: absolute;
		left: 25%;
		right: 25%;
		bottom: 0;
		border-radius: 3px 3px 0 0;
		background: #a9cfb5;
	}
	.bar.out {
		background: #ee715b;
	}
	.r {
		position: absolute;
		bottom: -18px;
		left: 0;
		right: 0;
		text-align: center;
		font-size: 10px;
		color: var(--muted);
		font-weight: 700;
	}
	.gap {
		width: 8px;
	}
	.seal {
		display: flex;
		gap: 8px;
	}
	.seal li {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 6px;
		border-radius: 10px;
		background: #ffffff08;
		font-size: 12px;
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
</style>
