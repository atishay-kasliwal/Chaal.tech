<script lang="ts">
	/** Your own cards only: what you did with them, and, separately, whether the deck is fair. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { percent } from '../format.js';
	import { meter } from './meter.js';
	import Fairness from './Fairness.svelte';
	import type { CardsView, CardGroup } from '../types.js';

	let { filter }: { filter: Filter } = $props();
	let data = $state<CardsView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		data = null;
		fetchAnalytics<CardsView>('cards', params)
			.then((b) => (data = b))
			.catch((e) => (error = e.message));
	});
	const NAMES: Record<string, string> = {
		trail: 'Trail',
		'pure-sequence': 'Pure sequence',
		sequence: 'Sequence',
		colour: 'Colour',
		pair: 'Pair',
		'high-card': 'High card',
		unknown: 'Not seen',
		strong: 'Strong',
		average: 'Average',
		weak: 'Weak',
		premium: 'Premium',
		good: 'Good',
		speculative: 'Speculative',
		'big-pair': 'Big pair',
		'ace-king': 'Ace-King',
		broadway: 'Two high cards',
		'suited-connector': 'Suited connectors',
		suited: 'Suited',
		connector: 'Connectors',
		other: 'Other',
		blackjack: 'Blackjack',
		soft: 'Soft hand',
		'hard-17-plus': 'Hard 17+',
		'hard-12-16': 'Hard 12–16',
		'hard-11-or-less': 'Hard 11 or less',
		'dealer-2-to-6': 'Dealer shows 2–6',
		'dealer-7-to-ace': 'Dealer shows 7–A',
		'dealer-unknown': 'Dealer card unknown',
		'0': 'No jokers',
		'1': 'One joker',
		'2-or-more': 'Two or more'
	};
	const name = (k: string) => NAMES[k] ?? k;
	const ODDS: Record<string, number> = {
		trail: 0.0024,
		'pure-sequence': 0.0022,
		sequence: 0.0326,
		colour: 0.0496,
		pair: 0.1694,
		'high-card': 0.7439
	};
	/** An example of each Teen Patti hand, so the category reads at a glance. */
	const EXAMPLE: Record<string, string> = {
		trail: 'A A A',
		'pure-sequence': 'A♥ K♥ Q♥',
		sequence: 'A K Q',
		colour: '♠ ♠ ♠',
		pair: 'K K 7',
		'high-card': 'A J 9'
	};
	const views = $derived(
		data
			? (
					[
						['teen-patti', '♠', 'Teen Patti', !!data.cards.teenPatti],
						['texas-holdem', '♦', 'Hold’em', !!data.cards.holdem],
						['blackjack', '♣', 'Blackjack', !!data.cards.blackjack],
						['rummy', '♥', 'Rummy', !!data.cards.rummy]
					] as const
				).filter((v) => v[3])
			: []
	);
	let picked = $state<string | null>(null);
	const view = $derived(views.find((v) => v[0] === picked)?.[0] ?? views[0]?.[0]);
	const shares = $derived.by(() => {
		const c = data?.cards;
		if (!c) return [];
		if (view === 'teen-patti' && c.teenPatti)
			return c.teenPatti.categories.map((g) => ({
				key: g.key,
				share: g.share ?? 0,
				hands: g.hands,
				fair: ODDS[g.key] ?? null
			}));
		if (view === 'texas-holdem' && c.holdem)
			return c.holdem.classes.map((g) => ({
				key: g.key,
				share: g.share ?? 0,
				hands: g.hands,
				fair: null
			}));
		if (view === 'blackjack' && c.blackjack)
			return c.blackjack.starts.map((g) => ({
				key: g.key,
				share: g.share ?? 0,
				hands: g.hands,
				fair: null
			}));
		if (view === 'rummy' && c.rummy)
			return c.rummy.jokers.map((g) => ({
				key: g.key,
				share: g.share ?? 0,
				hands: g.hands,
				fair: null
			}));
		return [];
	});
	const results = $derived.by((): CardGroup[] => {
		const c = data?.cards;
		if (!c) return [];
		if (view === 'teen-patti') return c.teenPatti?.tiers ?? [];
		if (view === 'texas-holdem') return c.holdem?.tiers ?? [];
		if (view === 'blackjack') return c.blackjack?.byDealer ?? [];
		return c.rummy?.jokers ?? [];
	});
	const shareTop = $derived(Math.max(0.01, ...shares.map((x) => Math.max(x.share, x.fair ?? 0))));
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<div class="cd" aria-busy="true"></div>
{:else if !data.cards.hands}<div class="v-zero">
		<span aria-hidden="true">🂡</span><strong>0 hands</strong>
	</div>
{:else}
	<div class="cd">
		<div class="top">
			<div class="seg" role="group" aria-label="Game">
				{#each views as [id, suit, label] (id)}<button
						aria-pressed={view === id}
						onclick={() => (picked = id)}
						><span class:v-red={suit === '♦' || suit === '♥'} aria-hidden="true">{suit}</span>
						{label}</button
					>{/each}
			</div>
			<span
				class="private"
				title="Only you can see this page’s cards. Nobody else’s hidden cards are ever used."
				>🔒 Only you</span
			>
		</div>
		<div class="grid">
			<section class="vt held" aria-labelledby="held-title">
				<h2 id="held-title"><span class="ic" aria-hidden="true">🂡</span> What you held</h2>
				<ul class="shares">
					{#each shares as x (x.key)}
						<li
							title="{name(x.key)}: {x.hands} hands ({percent(x.share)}){x.fair != null
								? `, fair deck ${percent(x.fair)}`
								: ''}"
						>
							<span class="s-name"
								>{#if view === 'teen-patti' && EXAMPLE[x.key]}<span class="ex" aria-hidden="true"
										>{EXAMPLE[x.key]}</span
									>{/if}{name(x.key)}</span
							>
							<span class="track"
								><i style:width="{(x.share / shareTop) * 100}%"></i>{#if x.fair != null}<span
										class="tick"
										style:left="{(x.fair / shareTop) * 100}%"
									></span>{/if}</span
							>
							<b>{x.hands}</b>
						</li>
					{/each}
				</ul>
			</section>
			<section class="vt res" aria-labelledby="res-title">
				<h2 id="res-title">
					<span class="ic" aria-hidden="true">±</span>
					{view === 'blackjack' ? 'Against the dealer' : 'Result by strength'}
				</h2>
				<ul class="rows">
					{#each results as g (g.key)}
						{@const m = meter(g.perHand, g.perHandLow, g.perHandHigh)}
						<li
							class:v-dim={g.evidence === 'insufficient'}
							title="{name(g.key)}: {g.hands} hands{g.packed !== null
								? `, packed ${percent(g.packed)}`
								: ''}"
						>
							<span class="r-name">{name(g.key)}</span>
							{#if m}<div class="v-meter" aria-hidden="true">
									<span class="z"></span><span
										class="band"
										style:left="{m.lo}%"
										style:width="{Math.max(1, m.hi - m.lo)}%"
									></span><span class="dot" class:neg={m.neg} style:left="{m.v}%"></span>
								</div>{:else}<span></span>{/if}
							<b class:v-pos={(g.perHand ?? 0) > 0} class:v-neg={(g.perHand ?? 0) < 0}
								>{g.perHand === null
									? '·'
									: (g.perHand > 0 ? '+' : '') + Math.round(g.perHand * 10) / 10}</b
							>
						</li>
					{/each}
				</ul>
			</section>
			<div class="fairness"><Fairness {filter} /></div>
		</div>
	</div>
{/if}

<style>
	.cd {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.seg {
		display: flex;
		padding: 3px;
		border-radius: 100px;
		background: #ffffff10;
	}
	.seg button {
		height: 32px;
		padding: 0 14px;
		border-radius: 100px;
		font-size: 13px;
		font-weight: 600;
		color: var(--muted);
		cursor: pointer;
	}
	.seg button[aria-pressed='true'] {
		background: var(--butter);
		color: var(--night);
	}
	.seg button[aria-pressed='true'] :global(.v-red) {
		color: #b8402c;
	}
	.private {
		padding: 5px 11px;
		border-radius: 100px;
		background: #ffffff10;
		font-size: 12px;
		font-weight: 700;
	}
	.grid {
		flex: 1;
		min-height: 0;
		display: grid;
		gap: 12px;
		grid-template-columns: 1.1fr 1fr;
		grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
		grid-template-areas:
			'held res'
			'held fair';
	}
	.held {
		grid-area: held;
	}
	.res {
		grid-area: res;
	}
	.fairness {
		grid-area: fair;
		min-height: 0;
	}
	.shares,
	.rows {
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		flex: 1;
		min-height: 0;
		gap: 6px;
	}
	.shares li {
		display: grid;
		grid-template-columns: minmax(120px, 0.9fr) 1.4fr 34px;
		gap: 10px;
		align-items: center;
	}
	.s-name {
		display: flex;
		flex-direction: column;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.15;
	}
	.ex {
		font-family: Georgia, serif;
		font-size: 15px;
		letter-spacing: 0.04em;
		color: var(--butter);
	}
	.track {
		position: relative;
		height: 14px;
		border-radius: 7px;
		background: #ffffff0d;
	}
	.track i {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		border-radius: 7px;
		background: var(--butter);
		min-width: 3px;
	}
	.tick {
		position: absolute;
		top: -4px;
		bottom: -4px;
		width: 2px;
		background: var(--paper);
		opacity: 0.8;
	}
	.shares b,
	.rows b {
		font-family: var(--font-display);
		text-align: right;
	}
	.rows li {
		display: grid;
		grid-template-columns: minmax(90px, 0.7fr) 1.5fr 52px;
		gap: 10px;
		align-items: center;
		font-size: 13px;
	}
	.r-name {
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 720px) {
		.private {
			display: none;
		}
		.seg button {
			padding: 0 9px;
			font-size: 12px;
		}
		.grid {
			gap: 8px;
			grid-template-columns: 1fr;
			grid-template-rows: minmax(0, 1.2fr) minmax(0, 0.8fr) minmax(0, 1fr);
			grid-template-areas: 'held' 'res' 'fair';
		}
		.shares li {
			grid-template-columns: 96px 1fr 28px;
			gap: 6px;
		}
		.s-name {
			font-size: 11px;
		}
		.ex {
			font-size: 12px;
		}
		.rows li {
			grid-template-columns: 74px 1fr 40px;
			font-size: 11px;
		}
	}
</style>
