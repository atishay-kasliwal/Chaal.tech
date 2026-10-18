<script lang="ts">
	/**
	 * Skill and luck, one game at a time. Each game says how it is judged (exactly, by estimate, or by
	 * results alone) and splits what happened into the cards you were dealt and what you did with them.
	 * Nothing here is a score: every claim carries a range, and small samples say "too early".
	 */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { ago, boots, day, gameName, percent, plural, signed } from '../format.js';
	import RangeRows from '../charts/RangeRows.svelte';
	import type { Compare, Dimension, SkillGame, SkillView } from '../types.js';

	let { filter, onRecap }: { filter: Filter; onRecap: (nightId: string) => void } = $props();
	let data = $state<SkillView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		data = null;
		error = '';
		fetchAnalytics<SkillView>('skill', params).then((b) => (data = b)).catch((e) => (error = e.message));
	});

	const ORDER = ['teen-patti', 'texas-holdem', 'blackjack', 'rummy'];
	const MODEL: Record<string, string> = { exact: 'Exact', estimated: 'Estimated', 'outcome-only': 'Results only', unavailable: 'No model' };
	const unitOf = (g: SkillGame) => g.unit ?? (g.game === 'blackjack' ? 'bets' : 'boots');
	const amount = (v: number | null | undefined, unit: string) => `${signed(v, 1)} ${unit}`;
	const range = (c: Compare, unit: string) => (c.low === null || c.high === null ? '' : ` (somewhere between ${signed(c.low, 1)} and ${signed(c.high, 1)} ${unit})`);

	function cardsLine(g: SkillGame) {
		const c = g.cards;
		if (!c) return '';
		const u = unitOf(g);
		if (c.verdict === 'insufficient') return `Too early to judge your cards: ${c.n} hands so far.`;
		if (c.verdict === 'above') return `Your cards ran warm: they were worth ${amount(c.actual, u)}${range(c, u)}.`;
		if (c.verdict === 'below') return `Your cards ran cold: they were worth ${amount(c.actual, u)}${range(c, u)}.`;
		return `Your cards were about average (${amount(c.actual, u)}).`;
	}
	function playLine(g: SkillGame) {
		const c = g.play;
		if (!c) return '';
		const u = unitOf(g);
		if (c.verdict === 'insufficient') return `Too early to judge your play: ${c.n} hands so far.`;
		if (c.verdict === 'above') return c.tier === 'strong' ? `You won ${amount(c.difference, u)} more than your cards alone were worth.` : `You tend to win more than your cards alone are worth: ${amount(c.difference, u)}.`;
		if (c.verdict === 'below') return c.tier === 'strong' ? `You won ${amount(Math.abs(c.difference ?? 0), u)} less than your cards were worth.` : `You tend to win a little less than your cards are worth: ${amount(c.difference, u)}.`;
		return `You won about what your cards were worth.`;
	}
	const rows = (g: SkillGame) =>
		g.cards && g.play && g.outcome
			? [
					{ key: 'cards', label: 'Cards dealt', value: g.cards.actual, low: g.cards.low, high: g.cards.high, detail: 'what they were worth', dim: g.cards.verdict === 'insufficient' },
					{ key: 'play', label: 'What you did', value: g.play.difference, low: g.play.low, high: g.play.high, detail: 'beyond the cards', dim: g.play.verdict === 'insufficient' },
					{ key: 'outcome', label: 'What happened', value: g.outcome.actual, low: g.outcome.low, high: g.outcome.high, detail: 'the two together', dim: g.outcome.verdict === 'insufficient' }
				]
			: [];
	const bjLine = (g: SkillGame) => {
		const d = g.decisions;
		if (!d || !d.evaluated) return 'No decisions to check yet.';
		if (d.evidence === 'insufficient') return `${d.evaluated} decisions checked so far: too few to say how you play. ${d.mistakes} cost something.`;
		return `${d.evaluated} decisions checked against exact basic strategy: ${d.mistakes} cost you something, about ${d.betsLostPer100} bets lost per 100 decisions.`;
	};
	const DIRECTION: Record<string, string> = { better: 'Up', worse: 'Down', steady: 'Steady', unclear: 'Not enough yet', changed: 'Changed' };
	const VERDICT: Record<string, string> = {
		improving: 'You are playing better lately, measured without luck.',
		slipping: 'Your play has dipped lately, measured without luck.',
		mixed: 'Some things are up and some are down.',
		steady: 'Your play looks steady.',
		'not-enough': 'Not enough recent hands yet to compare with your own history.'
	};
	const dimValue = (d: Dimension, v: number | null) => (v === null ? '–' : d.id === 'consistency' ? `${v}` : d.kind === 'style' && d.id !== 'bet-sizing' ? percent(v) : `${signed(v, 2)}`);
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Working out your cards and your play…</p>
{:else}
	{@const games = ORDER.map((g) => data!.skill.games[g]).filter(Boolean)}
	<section class="panel">
		<h2>Skill and luck</h2>
		<p class="muted small">Winning at cards is partly the deck and partly you. For each game this page separates <strong>the cards you were dealt</strong>, <strong>what you did with them</strong>, and <strong>what happened</strong>. You can play well and lose, or play badly and win; it takes a lot of hands to tell. There is no single skill score.</p>
	</section>

	{#if !games.length}
		<section class="panel empty"><h2>Nothing to measure yet</h2><p class="muted">Play a few hands and your cards and your play start to separate here.</p></section>
	{/if}

	{#each games as g (g.game)}
		<section class="panel">
			<div class="row-head">
				<h2>{gameName(g.game)}</h2>
				<span class="tag" title={data.skill.method[g.model] ?? ''}>{MODEL[g.model]}</span>
			</div>
			<p class="muted tiny">{plural(g.hands, 'hand')}{#if g.boots} · {boots(g.boots.total)} in total{/if}</p>

			{#if g.model === 'estimated' && g.cards && g.play && g.outcome}
				<p>{cardsLine(g)}</p>
				<p>{playLine(g)}</p>
				<RangeRows unit={unitOf(g)} scale="row" rows={rows(g)} />
				{#if g.byStrength}
					<h3>What you did with weak and strong hands</h3>
					<table class="data-table">
						<thead><tr><th>Hand</th><th>Dealt</th><th>Stayed in</th><th>{unitOf(g)} a hand</th></tr></thead>
						<tbody>
							{#each ['weak', 'average', 'strong'] as band (band)}
								{@const b = g.byStrength[band as 'weak' | 'average' | 'strong']}
								<tr class:dim={b.evidence === 'insufficient'}><td>{band === 'weak' ? 'Weak' : band === 'strong' ? 'Strong' : 'Average'}</td><td>{b.hands}</td><td>{percent(b.stayRate)}</td><td>{signed(b.perHand, 2)}</td></tr>
							{/each}
						</tbody>
					</table>
				{/if}
				{#if g.decisions?.packedStrongHands && g.decisions.playedWeakToTheEnd}
					<p class="muted small">
						Packed {g.decisions.packedStrongHands.k} of {g.decisions.packedStrongHands.n} strong hands; stayed to the end with {g.decisions.playedWeakToTheEnd.k} of {g.decisions.playedWeakToTheEnd.n} weak ones.
						Signals to look at, not mistakes: a bluff is sometimes the right play.
					</p>
				{/if}
				{#if g.decisions && 'foldedAbovePotOdds' in g.decisions && g.decisions.evaluated}
					<p class="muted small">Heads-up before the flop, {g.decisions.evaluated} decisions checked against pot odds: {g.decisions.foldedAbovePotOdds} packs of a hand that was getting a good price, {g.decisions.continuedBelowPotOdds} calls at a poor one. A rough guide only.</p>
				{/if}
			{:else if g.model === 'exact' && g.outcome}
				<p>
					{#if g.outcome.verdict === 'insufficient'}Too early to judge your results: {g.outcome.n} hands so far.
					{:else}Your hands were worth {amount(g.outcome.expected, 'bets')} played best; you finished {amount(g.outcome.actual, 'bets')}.{/if}
				</p>
				<p>{bjLine(g)}</p>
				{#if g.decisions?.common?.length}
					<h3>Where the bets went</h3>
					<ul class="plain">
						{#each g.decisions.common as m (m.action + m.total + m.dealerUp)}
							<li><span>{m.action === 'hit' ? 'Hit' : m.action === 'double' ? 'Double' : 'Stand'} on {m.total} against a {m.dealerUp === 14 ? 'dealer ace' : `dealer ${m.dealerUp}`}</span><span class="muted">{m.count}×</span><strong>−{m.cost}</strong></li>
						{/each}
					</ul>
				{/if}
			{:else if g.model === 'outcome-only' && g.outcome}
				<p>{#if g.outcome.verdict === 'insufficient'}Too early to say: {g.outcome.n} hands.{:else}You won {g.outcome.actual} against {g.outcome.expected} expected from a fair share.{/if}</p>
				<p class="muted small">Rummy is judged on results alone: no cards-versus-play split is offered because none can be defended.</p>
			{:else}
				<p class="muted">Not enough of your own cards are recorded for this game yet.</p>
			{/if}

			<details>
				<summary>How this is worked out</summary>
				<ul class="notes">{#each g.limitations as l (l)}<li>{l}</li>{/each}</ul>
			</details>
		</section>
	{/each}

	<section class="panel">
		<div class="row-head"><h2>Are you improving?</h2><span class="muted tiny">Your last {data.improvement.window.days} days against your own earlier play</span></div>
		<p class="lead">{VERDICT[data.improvement.verdict]}</p>
		{#if data.improvement.luckNote}<p class="private-note">{data.improvement.luckNote}</p>{/if}
		<ul class="dims">
			{#each data.improvement.dimensions as d (d.id)}
				<li class:dim={d.evidence === 'insufficient'}>
					<span><strong>{d.label}</strong>{#if d.note}<small>{d.note}</small>{/if}</span>
					<span class="pair"><span>{dimValue(d, d.recent.value)}</span><small>lately ({d.recent.n})</small></span>
					<span class="pair"><span>{dimValue(d, d.baseline.value)}</span><small>before ({d.baseline.n})</small></span>
					<span class="dir" class:up={d.direction === 'better'} class:down={d.direction === 'worse'}>{DIRECTION[d.direction]}</span>
				</li>
			{/each}
		</ul>
		<p class="muted tiny">Only the “skill” measures decide the headline. Results and style are shown beside them so luck is never mistaken for improvement.</p>
	</section>

	{#if data.skill.nights.length}
		<section class="panel">
			<h2>How the cards ran, night by night</h2>
			<ul class="plain">
				{#each [...data.skill.nights].reverse().slice(0, 8) as n (n.nightId)}
					<li>
						<span>{day(n.at)} <small class="muted">{ago(n.at)}</small></span>
						<span class="muted">{n.luck === 'hot' ? 'Warm cards' : n.luck === 'cold' ? 'Cold cards' : n.luck === 'average' ? 'Average cards' : 'Too few hands'}</span>
						<button class="link" onclick={() => onRecap(n.nightId)}>Recap · {boots(n.units)}</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}

<style>
	.tag {
		border-radius: 999px;
		background: rgb(231 199 132 / 14%);
		padding: 0.15rem 0.6rem;
		color: #e7c784;
		font-size: 0.7rem;
	}
	.lead {
		font-size: 1.05rem;
	}
	details {
		color: #b1b9ae;
		font-size: 0.8rem;
	}
	summary {
		cursor: pointer;
		color: #e7c784;
	}
	.notes {
		display: grid;
		gap: 0.3rem;
		margin: 0.5rem 0 0;
		padding-left: 1.1rem;
	}
	.dims {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.dims li {
		display: grid;
		grid-template-columns: 2fr 1fr 1fr auto;
		align-items: center;
		gap: 0.6rem;
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.55rem 0.7rem;
		font-size: 0.85rem;
	}
	.dims li.dim {
		opacity: 0.55;
	}
	.dims small {
		display: block;
		color: #b1b9ae;
		font-size: 0.68rem;
	}
	.pair {
		display: grid;
		font-variant-numeric: tabular-nums;
	}
	.dir {
		font-size: 0.75rem;
		color: #b1b9ae;
	}
	@media (max-width: 36rem) {
		.dims li {
			grid-template-columns: 1fr 1fr;
		}
		.dims li > span:first-child {
			grid-column: 1 / -1;
		}
	}
</style>
