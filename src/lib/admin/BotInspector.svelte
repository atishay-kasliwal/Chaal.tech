<script lang="ts">
	import { club } from '#lib/club/club.svelte.js';
	import { ago, gameName, variantName } from '#lib/analytics/format.js';
	import DecisionGraph from './DecisionGraph.svelte';
	import {
		deltaChips,
		percent,
		signedDelta,
		type Decision,
		type HandsResponse,
		type InspectResponse
	} from './inspector.js';

	/**
	 * Owner decision inspector (BOT_BRAIN.md §20 Phase 6): pick a finished hand that had bots, read
	 * every bot decision in it, and follow one through its policy's graph. Traces show a bot's own
	 * hand strength and mind, so the server serves them to owners only, for finished hands only.
	 */
	let hands = $state<HandsResponse['hands']>([]);
	let graphs = $state<HandsResponse['graphs']>([]);
	let listed = $state(false);
	let error = $state('');
	let detail = $state<InspectResponse | null>(null);
	let opening = $state('');
	let picked = $state<number | null>(null);
	let browse = $state('');

	const decision = $derived<Decision | null>(
		detail && picked !== null ? (detail.decisions.find((d) => d.i === picked) ?? null) : null
	);
	const browseNodes = $derived(graphs.find((g) => g.policy === browse)?.nodes ?? []);

	async function loadHands() {
		error = '';
		try {
			const { response, body } = await club.request('/admin/bots/hands?limit=40');
			if (!response.ok) throw new Error(body.error);
			hands = body.hands;
			graphs = body.graphs;
			if (!browse) browse = graphs.find((g) => g.policy === 'tp-dna@8')?.policy ?? graphs.at(-1)?.policy ?? '';
		} catch (failure) {
			error = failure instanceof Error && failure.message ? failure.message : 'Can’t reach the club right now.';
		} finally {
			listed = true;
		}
	}
	$effect(() => {
		if (!listed) void loadHands();
	});

	async function open(id: string) {
		opening = id;
		error = '';
		try {
			const { response, body } = await club.request(`/admin/bots/inspect?hand=${encodeURIComponent(id)}`);
			if (!response.ok) throw new Error(body.error);
			detail = body;
			const first = body.decisions.find((d: Decision) => d.probs.length > 1) ?? body.decisions[0];
			picked = first ? first.i : null;
		} catch (failure) {
			error = failure instanceof Error && failure.message ? failure.message : 'Can’t open that hand.';
		} finally {
			opening = '';
		}
	}

	const handTitle = (hand: { gameType: string; rulesVersion: string | null; handNo: number | null }) =>
		[gameName(hand.gameType), hand.gameType === 'teen-patti' ? variantName(hand.rulesVersion) : '', hand.handNo ? `hand ${hand.handNo}` : '']
			.filter(Boolean)
			.join(' · ');
	const chosenP = (d: Decision) => d.probs.find((p) => p.chosen)?.p ?? null;
	const moodWords: Record<string, string> = {
		confidence: 'Confidence',
		frustration: 'Frustration',
		fear: 'Fear',
		suspicion: 'Suspicion',
		excitement: 'Excitement'
	};
</script>

<div class="bi">
	<section class="bi-panel">
		<h2>Bot decisions <small>owner only</small></h2>
		<p class="bi-note">
			Pick a finished hand to see why each bot did what it did: the odds it gave every move, the
			named pushes behind them and its mood at the time. Traces show a bot’s own hand strength,
			so they open only here and only once a hand is over.
		</p>
		{#if error}<p class="bi-alert" role="alert">{error}</p>{/if}
		{#if !listed}
			<p class="bi-note">Loading recent hands…</p>
		{:else if !hands.length}
			<p class="bi-note">No finished hands with bots yet. Play one with a bot and it shows up here.</p>
		{:else}
			<ul class="bi-hands" aria-label="Recent hands with bots">
				{#each hands as hand (hand.id)}
					<li>
						<button
							type="button"
							class:bi-on={detail?.hand.id === hand.id}
							aria-pressed={detail?.hand.id === hand.id}
							disabled={!!opening}
							onclick={() => open(hand.id)}
						>
							<span class="bi-hand-title">{handTitle(hand)}</span>
							<span class="bi-hand-seats"
								>{hand.seats
									.map((s) => (s.kind === 'bot' ? `${s.name} (bot)` : s.name))
									.join(', ')}</span
							>
							<span class="bi-hand-when"
								>{opening === hand.id ? 'Opening…' : ago(hand.completedAt)}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if detail}
		<section class="bi-panel" aria-live="polite">
			<h2>{handTitle(detail.hand)} <small>{detail.decisions.length} bot decisions</small></h2>
			{#if !detail.decisions.length}
				<p class="bi-note">No bot decisions were recorded in this hand.</p>
			{:else}
				<ol class="bi-decisions">
					{#each detail.decisions as d (d.i)}
						{@const p = chosenP(d)}
						<li>
							<button type="button" class:bi-on={picked === d.i} aria-pressed={picked === d.i} onclick={() => (picked = d.i)}>
								<span class="bi-step">#{d.i}</span>
								<span class="bi-who">{d.name}</span>
								<span class="bi-act">{d.actionLabel}{d.amount ? ` · ₹${d.amount}` : ''}</span>
								<span class="bi-prob">{p !== null && d.probs.length > 1 ? percent(p) : 'forced'}</span>
								<span class="bi-why">{d.why}</span>
							</button>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}

	{#if decision}
		<section class="bi-panel bi-detail">
			<header class="bi-detail-head">
				<p class="bi-kicker">
					Step {decision.i} · {decision.styleId ?? 'unknown style'} · {decision.policy ?? 'no policy'} · replay {decision.verified}
				</p>
				<h2>{decision.name}: {decision.actionLabel}</h2>
				<p class="bi-why-big">{decision.why}</p>
			</header>

			<div class="bi-cols">
				<div class="bi-col">
					<h3>Route through the graph</h3>
					{#if decision.graph}
						<DecisionGraph nodes={decision.graph} policy={decision.policy ?? ''} />
					{:else}
						<p class="bi-note">This bot’s policy does not run as a graph, so there is no route to draw.</p>
					{/if}
				</div>

				<div class="bi-col">
					{#if decision.probs.length}
						<h3>Odds over the moves</h3>
						<ul class="bi-bars">
							{#each decision.probs as p (p.move)}
								<li class:bi-chosen={p.chosen}>
									<span class="bi-bar-name">{p.move}{p.chosen ? ' · chosen' : ''}</span>
									<span class="bi-bar-track"><span class="bi-bar-fill" style:width="{Math.max(p.p * 100, 0.5)}%"></span></span>
									<span class="bi-bar-pct">{percent(p.p)}</span>
								</li>
							{/each}
						</ul>
					{/if}

					<h3>Situation</h3>
					<dl class="bi-facts">
						<div><dt>Table</dt><dd>{decision.situation}</dd></div>
						{#if decision.strength}
							<div>
								<dt>Hand strength</dt>
								<dd>beats one random hand {percent(decision.strength.single)}, everyone still in {percent(decision.strength.multi)}</dd>
							</div>
						{/if}
						<div><dt>Reason</dt><dd>{decision.reasonText}{decision.secondary.length ? `; also ${decision.secondary.join(', ')}` : ''}</dd></div>
						{#if decision.override}
							<div>
								<dt>Base brain</dt>
								<dd>
									would pick {decision.override.baseBest}; policy’s best {decision.override.best}{decision.override.override ? ' (personality override)' : ''}
								</dd>
							</div>
						{/if}
						{#if decision.bound}
							<div><dt>Personality weight</dt><dd>{decision.bound.lambda} (base clarity {decision.bound.clarity}){decision.bound.capped.length ? `, capped: ${decision.bound.capped.join(', ')}` : ''}</dd></div>
						{/if}
						{#if decision.resisted.length}
							<div><dt>Resisted</dt><dd>{decision.resisted.join(', ')}</dd></div>
						{/if}
					</dl>

					{#if decision.margins.length && decision.key}
						<h3>Why {decision.action} over {decision.key}</h3>
						<ul class="bi-chips">
							{#each decision.margins as m, n (n)}
								<li class:bi-up={m.m > 0} class:bi-down={m.m < 0}>{m.label} <strong>{signedDelta(m.m)}</strong></li>
							{/each}
						</ul>
					{/if}

					{#if decision.deltas.length}
						<h3>Every named push</h3>
						<ul class="bi-chips">
							{#each deltaChips(decision.deltas) as chip (chip.key)}
								<li class:bi-up={chip.v > 0} class:bi-down={chip.v < 0}>{chip.label} <strong>{signedDelta(chip.v)}</strong> to {chip.move}</li>
							{/each}
						</ul>
					{/if}

					{#if decision.mind}
						<h3>Mind</h3>
						{#if decision.mind.mood}
							<ul class="bi-meters">
								{#each Object.entries(decision.mind.mood) as [k, v] (k)}
									<li>
										<span>{moodWords[k] ?? k}</span>
										<span class="bi-bar-track"><span class="bi-bar-fill bi-mood" style:width="{Math.min(Math.max(v, 0), 1) * 100}%"></span></span>
										<span class="bi-bar-pct">{v.toFixed(2)}</span>
									</li>
								{/each}
							</ul>
						{/if}
						<p class="bi-note">
							Pressure {decision.mind.pressure}{decision.mind.facing ? ` · facing a raise from ${decision.mind.facing}` : ''}
						</p>
						{#if decision.mind.beliefs.length}
							<ul class="bi-beliefs">
								{#each decision.mind.beliefs as b, n (n)}
									<li>{b.about} · {b.stat} {percent(b.p)} <small>(n={Math.round(b.n)})</small></li>
								{/each}
							</ul>
						{/if}
					{/if}

					{#if decision.adaptive}
						<h3>Memory</h3>
						<p class="bi-note">
							Base move {decision.adaptive.baseAction ?? 'unknown'}{decision.adaptive.redirected ? ', redirected by memory' : ''}.
							{#each decision.adaptive.adaptations as a, n (n)}
								{a.reason}{a.about ? ` (${a.about})` : ''}{a.effect !== null ? ` · effect ${percent(a.effect)}` : ''}.
							{/each}
						</p>
					{/if}
				</div>
			</div>

			{#if decision.text}
				<details class="bi-raw">
					<summary>Full trace, as the command line prints it</summary>
					<pre>{decision.text}</pre>
				</details>
			{/if}
		</section>
	{/if}

	{#if graphs.length}
		<section class="bi-panel">
			<h2>Policy graphs</h2>
			<p class="bi-note">
				Each bot decision runs these nodes in order. A forced move stops early; the inspector above
				lights the route one decision took.
			</p>
			<label class="bi-pick"
				><span>Policy</span>
				<select bind:value={browse}>
					{#each graphs as g (g.policy)}<option value={g.policy}>{g.policy}</option>{/each}
				</select></label
			>
			{#if browseNodes.length}<DecisionGraph nodes={browseNodes} policy={browse} />{/if}
		</section>
	{/if}
</div>

<style>
	.bi {
		display: grid;
		gap: 20px;
		min-width: 0;
	}
	.bi-panel {
		display: grid;
		gap: 14px;
		min-width: 0;
		padding: 26px 28px;
		border: 1px solid var(--line);
		border-radius: 14px;
		background: var(--surface);
	}
	h2 {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 700;
		line-height: 1.1;
		letter-spacing: -0.035em;
		overflow-wrap: anywhere;
	}
	h2 small {
		color: var(--muted);
		font-family: inherit;
		font-size: 14px;
		font-weight: 600;
		letter-spacing: 0;
	}
	h3 {
		margin-top: 6px;
		color: var(--muted);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.bi-note {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.5;
	}
	.bi-alert {
		padding: 12px 16px;
		border-left: 3px solid var(--red);
		border-radius: 8px;
		background: #ee715b17;
		color: #f3b0a5;
		font-size: 14px;
	}

	/* Hand picker and decision list: ruled rows, the chosen one in butter. */
	.bi-hands,
	.bi-decisions {
		display: grid;
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--line);
		list-style: none;
	}
	.bi-hands {
		max-height: 340px;
		overflow-y: auto;
	}
	.bi-hands button,
	.bi-decisions button {
		display: grid;
		width: 100%;
		min-width: 0;
		padding: 12px 14px;
		border-bottom: 1px solid var(--line);
		color: var(--paper);
		text-align: left;
		transition: background 0.2s;
	}
	.bi-hands button {
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 2px 16px;
	}
	.bi-hands button:hover,
	.bi-decisions button:hover {
		background: #ffffff0a;
	}
	.bi-hands button.bi-on,
	.bi-decisions button.bi-on {
		background: #f2dc911a;
		box-shadow: inset 3px 0 0 var(--butter);
	}
	.bi-hand-title {
		font-weight: 650;
	}
	.bi-hand-seats {
		grid-column: 1;
		color: var(--muted);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.bi-hand-when {
		grid-column: 2;
		grid-row: 1 / span 2;
		align-self: center;
		color: var(--muted);
		font-size: 13px;
		white-space: nowrap;
	}
	.bi-decisions button {
		grid-template-columns: auto auto minmax(0, 1fr) auto;
		align-items: baseline;
		gap: 4px 12px;
	}
	.bi-step {
		color: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
	}
	.bi-who {
		font-weight: 700;
	}
	.bi-act {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.bi-prob {
		color: var(--butter);
		font-size: 13px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.bi-why {
		grid-column: 2 / -1;
		color: var(--muted);
		font-size: 13px;
		line-height: 1.45;
	}

	/* One decision. */
	.bi-detail-head {
		display: grid;
		gap: 8px;
	}
	.bi-kicker {
		color: var(--muted);
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.bi-why-big {
		font-size: 16px;
		line-height: 1.5;
	}
	.bi-cols {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 28px;
		align-items: start;
	}
	.bi-col {
		display: grid;
		gap: 10px;
		min-width: 0;
	}
	.bi-bars,
	.bi-meters {
		display: grid;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.bi-bars li,
	.bi-meters li {
		display: grid;
		grid-template-columns: minmax(80px, 9rem) minmax(0, 1fr) 3.2rem;
		align-items: center;
		gap: 10px;
		font-size: 13px;
	}
	.bi-bar-name {
		overflow-wrap: anywhere;
	}
	.bi-bar-track {
		height: 8px;
		border-radius: 100px;
		background: #0000003d;
		overflow: hidden;
	}
	.bi-bar-fill {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: var(--muted);
		opacity: 0.6;
	}
	.bi-chosen .bi-bar-fill {
		background: var(--butter);
		opacity: 1;
	}
	.bi-chosen .bi-bar-name {
		color: var(--butter);
		font-weight: 700;
	}
	.bi-bar-fill.bi-mood {
		background: #8fe0ad;
		opacity: 0.8;
	}
	.bi-bar-pct {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.bi-facts {
		display: grid;
		gap: 6px;
		font-size: 13px;
	}
	.bi-facts div {
		display: grid;
		grid-template-columns: minmax(90px, 9rem) minmax(0, 1fr);
		gap: 10px;
	}
	.bi-facts dt {
		color: var(--muted);
	}
	.bi-facts dd {
		overflow-wrap: anywhere;
	}
	.bi-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.bi-chips li {
		padding: 3px 10px;
		border: 1px solid var(--line);
		border-radius: 100px;
		background: #0000002e;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.bi-chips strong {
		font-variant-numeric: tabular-nums;
	}
	.bi-up strong {
		color: #8fe0ad;
	}
	.bi-down strong {
		color: #f3b0a5;
	}
	.bi-beliefs {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 13px;
	}
	.bi-beliefs small {
		color: var(--muted);
	}
	.bi-raw summary {
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
	}
	.bi-raw pre {
		max-width: 100%;
		margin-top: 10px;
		padding: 14px;
		border-radius: 10px;
		background: #0000003d;
		font-size: 12px;
		line-height: 1.5;
		overflow-x: auto;
	}
	.bi-pick {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--muted);
		font-size: 13px;
		font-weight: 600;
	}
	.bi-pick select {
		height: 40px;
		padding: 0 12px;
		border: 1px solid var(--line);
		border-radius: 10px;
		background: #0000002e;
		color: var(--paper);
	}
	button:focus-visible,
	select:focus-visible,
	summary:focus-visible {
		outline: 2px solid var(--butter);
		outline-offset: 2px;
	}

	@media (max-width: 900px) {
		.bi-cols {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	@media (max-width: 600px) {
		.bi-panel {
			padding: 20px 16px;
		}
		.bi-decisions button {
			grid-template-columns: auto minmax(0, 1fr) auto;
		}
		.bi-act {
			grid-column: 2 / -1;
			grid-row: 2;
		}
		.bi-why {
			grid-column: 1 / -1;
		}
		.bi-bars li,
		.bi-meters li {
			grid-template-columns: minmax(70px, 6.5rem) minmax(0, 1fr) 3rem;
		}
	}
</style>
