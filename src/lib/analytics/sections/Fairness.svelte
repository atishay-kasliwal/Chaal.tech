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
	const GLYPH: Record<string, string> = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
	let scope = $state<'you' | 'club'>('you');
	let explain = $state(false);
	/** Ranks and suits for the chosen scope; the club has no per-player bands, only a fair-deck tick. */
	const shown = $derived.by(() => {
		if (!data) return null;
		const club = scope === 'club' && data.club;
		const src = club ? data.club! : data.you;
		const ranks = src.ranks.map((r) => ({
			key: String(r.rank),
			label: RANKS[r.rank] ?? String(r.rank),
			count: r.count,
			expected: r.expected,
			low: 'low' in r ? (r.low as number) : null,
			high: 'high' in r ? (r.high as number) : null,
			within: 'within' in r ? (r.within as boolean) : true,
			red: false
		}));
		const suits = src.suits.map((x) => ({
			key: x.suit,
			label: GLYPH[x.suit],
			count: x.count,
			expected: x.expected,
			low: 'low' in x ? (x.low as number) : null,
			high: 'high' in x ? (x.high as number) : null,
			within: 'within' in x ? (x.within as boolean) : true,
			red: x.suit === 'hearts' || x.suit === 'diamonds'
		}));
		const top = (xs: { count: number; expected: number; high: number | null }[]) =>
			Math.max(1, ...xs.map((x) => Math.max(x.count, x.expected, x.high ?? 0)));
		return {
			ranks,
			suits,
			rankTop: top(ranks),
			suitTop: top(suits),
			cards: club ? data.club!.cards : data.you.sample.cards
		};
	});
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
			{#if data.club}<span class="scope" role="group" aria-label="Whose cards"
					><button aria-pressed={scope === 'you'} onclick={() => (scope = 'you')}>You</button
					><button aria-pressed={scope === 'club'} onclick={() => (scope = 'club')}>Club</button
					></span
				>{/if}
			<span class="sample">🂠 {shown?.cards}</span>
			<button
				class="why"
				aria-expanded={explain}
				onclick={() => (explain = !explain)}
				aria-label="What this can and cannot show">ⓘ</button
			>
		</h2>
		{#if explain}
			<!-- A scrollable region must take keyboard focus (WCAG scrollable-region-focusable). -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div class="explain" role="region" aria-label="What this can and cannot show" tabindex="0">
				<ul>
					{#each data.explain.what as t (t)}<li>✓ {t}</li>{/each}
				</ul>
				<ul>
					{#each data.explain.cannot as t (t)}<li>✕ {t}</li>{/each}
				</ul>
				<p>{data.explain.howToRead}</p>
				{#if scope === 'club' && data.club}<p>{data.club.note}</p>{/if}
			</div>
		{/if}
		{#if shown && (scope === 'club' || data.you.verdict !== 'insufficient')}
			<div
				class="hist"
				role="img"
				aria-label="Cards dealt {scope === 'club'
					? 'across the club'
					: 'to you'} by rank and suit, against a fair deck"
			>
				{#each shown.ranks as r (r.key)}
					<div class="col" class:suit={false} title="{r.label}: {r.count} (fair {r.expected})">
						{#if r.low !== null && r.high !== null}<span
								class="band"
								style:bottom="{(r.low / shown.rankTop) * 100}%"
								style:height="{((r.high - r.low) / shown.rankTop) * 100}%"
							></span>{/if}
						<span
							class="bar"
							class:out={!r.within}
							style:height="{(r.count / shown.rankTop) * 100}%"
						></span>
						<span class="tickline" style:bottom="{(r.expected / shown.rankTop) * 100}%"></span>
						<span class="r" class:v-red={r.red}>{r.label}</span>
					</div>
				{/each}
				<span class="gap" aria-hidden="true"></span>
				{#each shown.suits as r (r.key)}
					<div class="col" class:suit={true} title="{r.label}: {r.count} (fair {r.expected})">
						{#if r.low !== null && r.high !== null}<span
								class="band"
								style:bottom="{(r.low / shown.suitTop) * 100}%"
								style:height="{((r.high - r.low) / shown.suitTop) * 100}%"
							></span>{/if}
						<span
							class="bar"
							class:out={!r.within}
							style:height="{(r.count / shown.suitTop) * 100}%"
						></span>
						<span class="tickline" style:bottom="{(r.expected / shown.suitTop) * 100}%"></span>
						<span class="r" class:v-red={r.red}>{r.label}</span>
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
	.tickline {
		position: absolute;
		left: 12%;
		right: 12%;
		height: 2px;
		background: var(--paper);
		opacity: 0.7;
	}
	.scope {
		display: inline-flex;
		margin-left: 8px;
		padding: 2px;
		border-radius: 100px;
		background: #ffffff10;
		font-family: system-ui, sans-serif;
	}
	.scope button {
		padding: 2px 9px;
		border-radius: 100px;
		font-size: 11px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}
	.scope button[aria-pressed='true'] {
		background: var(--butter);
		color: var(--night);
	}
	.why {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		color: var(--muted);
		cursor: pointer;
	}
	.why[aria-expanded='true'],
	.why:hover {
		background: #ffffff14;
		color: var(--butter);
	}
	.explain {
		position: absolute;
		inset: 44px 10px 10px;
		z-index: 2;
		overflow: auto;
		padding: 12px 14px;
		border-radius: 12px;
		background: #211c2ef2;
		border: 1px solid var(--line);
		font-size: 12px;
		line-height: 1.45;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.explain ul {
		display: flex;
		flex-direction: column;
		gap: 3px;
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
