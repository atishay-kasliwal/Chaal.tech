<script lang="ts">
	/** Your own cards only: what you did with them, and, separately, whether the deck is fair. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { percent } from '../format.js';
	import ShareBars from '../charts/ShareBars.svelte';
	import RangeRows from '../charts/RangeRows.svelte';
	import Fairness from './Fairness.svelte';
	import type { CardsView, CardGroup } from '../types.js';

	let { filter }: { filter: Filter } = $props();
	let data = $state<CardsView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		data = null;
		fetchAnalytics<CardsView>('cards', params).then((b) => (data = b)).catch((e) => (error = e.message));
	});
	const NAMES: Record<string, string> = {
		trail: 'Trail', 'pure-sequence': 'Pure sequence', sequence: 'Sequence', colour: 'Colour', pair: 'Pair', 'high-card': 'High card', unknown: 'Not seen',
		strong: 'Strong', average: 'Average', weak: 'Weak', premium: 'Premium', good: 'Good', speculative: 'Speculative',
		'big-pair': 'Big pair', 'ace-king': 'Ace-King', broadway: 'Two high cards', 'suited-connector': 'Suited connectors', suited: 'Suited', connector: 'Connectors', other: 'Other',
		blackjack: 'Blackjack', soft: 'Soft hand', 'hard-17-plus': 'Hard 17+', 'hard-12-16': 'Hard 12–16', 'hard-11-or-less': 'Hard 11 or less',
		'dealer-2-to-6': 'Dealer shows 2–6', 'dealer-7-to-ace': 'Dealer shows 7–A', 'dealer-unknown': 'Dealer card unknown',
		'0': 'No jokers', '1': 'One joker', '2-or-more': 'Two or more'
	};
	const name = (k: string) => NAMES[k] ?? k;
	const ODDS: Record<string, number> = { trail: 0.0024, 'pure-sequence': 0.0022, sequence: 0.0326, colour: 0.0496, pair: 0.1694, 'high-card': 0.7439 };
	const resultRows = (groups: CardGroup[]) =>
		groups.map((g) => ({ key: g.key, label: name(g.key), value: g.perHand, low: g.perHandLow, high: g.perHandHigh, detail: `${g.hands} hands${g.packed !== null ? ` · packed ${percent(g.packed)}` : ''}`, dim: g.evidence === 'insufficient' }));
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Looking at your cards…</p>
{:else if !data.cards.hands}<p class="muted">No recorded hands yet.</p>
{:else}
	<p class="private-note">Only you can see this page’s cards. Nobody else’s hidden cards are ever used.</p>
	{#if data.cards.teenPatti}
		<section class="panel two">
			<div>
				<h2>Your Teen Patti hands</h2>
				<p class="muted small">What you held at the end of each hand. The tick is how often a fair deck deals it in Classic.</p>
				<ShareBars
					bars={data.cards.teenPatti.categories.map((c) => ({ key: c.key, label: name(c.key), value: c.share, expected: ODDS[c.key] ?? null, text: `${c.hands}` }))}
					max={1}
				/>
			</div>
			<div>
				<h2>Results by hand strength</h2>
				<RangeRows rows={resultRows(data.cards.teenPatti.tiers)} />
				<p class="muted small">{data.cards.teenPatti.note}</p>
			</div>
		</section>
	{/if}
	{#if data.cards.holdem}
		<section class="panel two">
			<div><h2>Hold’em starting hands</h2><ShareBars bars={data.cards.holdem.classes.map((c) => ({ key: c.key, label: name(c.key), value: c.share, text: `${c.hands}` }))} max={1} /></div>
			<div><h2>Results by starting hand</h2><RangeRows unit="big blinds a hand" rows={resultRows(data.cards.holdem.tiers)} /></div>
		</section>
	{/if}
	{#if data.cards.blackjack}
		<section class="panel two">
			<div><h2>Blackjack openings</h2><RangeRows unit="bets a hand" rows={resultRows(data.cards.blackjack.starts)} /></div>
			<div><h2>Against the dealer’s card</h2><RangeRows unit="bets a hand" rows={resultRows(data.cards.blackjack.byDealer)} /></div>
		</section>
	{/if}
	{#if data.cards.rummy}
		<section class="panel"><h2>Rummy: jokers dealt</h2><RangeRows unit="points a hand" rows={resultRows(data.cards.rummy.jokers)} /></section>
	{/if}

	<Fairness {filter} />
{/if}
