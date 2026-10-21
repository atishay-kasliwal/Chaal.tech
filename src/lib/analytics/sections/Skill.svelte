<script lang="ts">
	/**
	 * Skill and luck, one game at a time. Each game says how it is judged (exactly, by estimate, or by
	 * results alone) and splits what happened into the cards you were dealt and what you did with them.
	 * Nothing here is a score: every claim carries a range, and small samples say "too early".
	 */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { boots, day, gameName, percent, signed } from '../format.js';
	import type { Compare, Dimension, SkillGame, SkillView } from '../types.js';

	let { filter, onRecap }: { filter: Filter; onRecap: (nightId: string) => void } = $props();
	let data = $state<SkillView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		data = null;
		error = '';
		fetchAnalytics<SkillView>('skill', params)
			.then((b) => (data = b))
			.catch((e) => (error = e.message));
	});

	const ORDER = ['teen-patti', 'texas-holdem', 'blackjack', 'rummy'];
	const MODEL: Record<string, string> = {
		exact: 'Exact',
		estimated: 'Estimated',
		'outcome-only': 'Results only',
		unavailable: 'No model'
	};
	const unitOf = (g: SkillGame) => g.unit ?? (g.game === 'blackjack' ? 'bets' : 'boots');
	const amount = (v: number | null | undefined, unit: string) => `${signed(v, 1)} ${unit}`;
	const range = (c: Compare, unit: string) =>
		c.low === null || c.high === null
			? ''
			: ` (somewhere between ${signed(c.low, 1)} and ${signed(c.high, 1)} ${unit})`;

	function cardsLine(g: SkillGame) {
		const c = g.cards;
		if (!c) return '';
		const u = unitOf(g);
		if (c.verdict === 'insufficient') return `Too early to judge your cards: ${c.n} hands so far.`;
		if (c.verdict === 'above')
			return `Your cards ran warm: they were worth ${amount(c.actual, u)}${range(c, u)}.`;
		if (c.verdict === 'below')
			return `Your cards ran cold: they were worth ${amount(c.actual, u)}${range(c, u)}.`;
		return `Your cards were about average (${amount(c.actual, u)}).`;
	}
	function playLine(g: SkillGame) {
		const c = g.play;
		if (!c) return '';
		const u = unitOf(g);
		if (c.verdict === 'insufficient') return `Too early to judge your play: ${c.n} hands so far.`;
		if (c.verdict === 'above')
			return c.tier === 'strong'
				? `You won ${amount(c.difference, u)} more than your cards alone were worth.`
				: `You tend to win more than your cards alone are worth: ${amount(c.difference, u)}.`;
		if (c.verdict === 'below')
			return c.tier === 'strong'
				? `You won ${amount(Math.abs(c.difference ?? 0), u)} less than your cards were worth.`
				: `You tend to win a little less than your cards are worth: ${amount(c.difference, u)}.`;
		return `You won about what your cards were worth.`;
	}
	const bjLine = (g: SkillGame) => {
		const d = g.decisions;
		if (!d || !d.evaluated) return 'No decisions to check yet.';
		if (d.evidence === 'insufficient')
			return `${d.evaluated} decisions checked so far: too few to say how you play. ${d.mistakes} cost something.`;
		return `${d.evaluated} decisions checked against exact basic strategy: ${d.mistakes} cost you something, about ${d.betsLostPer100} bets lost per 100 decisions.`;
	};
	const DIRECTION: Record<string, string> = {
		better: 'Up',
		worse: 'Down',
		steady: 'Steady',
		unclear: 'Not enough yet',
		changed: 'Changed'
	};
	const VERDICT: Record<string, string> = {
		improving: 'You are playing better lately, measured without luck.',
		slipping: 'Your play has dipped lately, measured without luck.',
		mixed: 'Some things are up and some are down.',
		steady: 'Your play looks steady.',
		'not-enough': 'Not enough recent hands yet to compare with your own history.'
	};
	const dimValue = (d: Dimension, v: number | null) =>
		v === null
			? '–'
			: d.id === 'consistency'
				? `${v}`
				: d.kind === 'style' && d.id !== 'bet-sizing'
					? percent(v)
					: `${signed(v, 2)}`;

	const SUIT: Record<string, string> = {
		'teen-patti': '♠',
		'texas-holdem': '♦',
		blackjack: '♣',
		rummy: '♥'
	};
	let picked = $state<string | null>(null);
	const games = $derived(data ? ORDER.map((g) => data!.skill.games[g]).filter(Boolean) : []);
	const game = $derived(games.find((g) => g.game === picked) ?? games[0]);
	/** A value with its likely range, drawn on a scale centred on zero. */
	function bar(c: Compare | undefined, value: number | null | undefined) {
		if (!c || value == null) return null;
		const lo = c.low ?? value,
			hi = c.high ?? value;
		const m = Math.max(Math.abs(lo), Math.abs(hi), Math.abs(value), 1);
		const at = (v: number) => 50 + (v / m) * 48;
		return { lo: at(lo), hi: at(hi), v: at(value) };
	}
	const ARROW: Record<string, string> = {
		better: '↑',
		worse: '↓',
		steady: '→',
		unclear: '·',
		changed: '↕'
	};
	const LUCK: Record<string, string> = { hot: '🔥', cold: '❄', average: '≈' };
	const verdictIcon = (c: Compare | undefined) =>
		!c || c.verdict === 'insufficient'
			? '?'
			: c.verdict === 'above'
				? '▲'
				: c.verdict === 'below'
					? '▼'
					: '≈';
</script>

{#snippet meter(c: Compare | undefined, value: number | null | undefined)}
	{@const b = bar(c, value)}
	{#if b}<div class="meter" class:dim={c?.verdict === 'insufficient'} aria-hidden="true">
			<span class="z"></span><span
				class="band"
				style:left="{b.lo}%"
				style:width="{Math.max(1, b.hi - b.lo)}%"
			></span><span class="dot" class:neg={(value ?? 0) < 0} style:left="{b.v}%"></span>
		</div>{/if}
{/snippet}

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<div class="sk-grid" aria-busy="true"></div>
{:else if !game}
	<div class="zero"><span aria-hidden="true">⚖</span><strong>0 hands</strong></div>
{:else}
	{@const g = game}
	{@const u = unitOf(g)}
	<div class="sk">
		<div class="games-bar">
			<div class="seg" role="group" aria-label="Game">
				{#each games as x (x.game)}<button
						aria-pressed={x.game === g.game}
						onclick={() => (picked = x.game)}
						><span class:red={SUIT[x.game] === '♦' || SUIT[x.game] === '♥'} aria-hidden="true"
							>{SUIT[x.game]}</span
						>
						{gameName(x.game)}</button
					>{/each}
			</div>
			<span class="model" title={data.skill.method[g.model] ?? ''}>{MODEL[g.model]}</span>
			<span class="count">🂠 {g.hands}</span>
			<span
				class="how"
				title={g.limitations.join(' ')}
				aria-label="How this is worked out: {g.limitations.join(' ')}">ⓘ</span
			>
		</div>

		<div class="sk-grid" class:exact={g.model === 'exact'}>
			<!-- Cards + play = result -->
			<section class="tile split" aria-label="Cards, play and result">
				{#if g.model === 'estimated' && g.cards && g.play && g.outcome}
					{#each [['🂠', 'Cards', g.cards, g.cards.actual, cardsLine(g)], ['✋', 'You', g.play, g.play.difference, playLine(g)], ['⚑', 'Result', g.outcome, g.outcome.actual, '']] as [icon, label, c, v, line], k (label)}
						{#if k}<span class="op" aria-hidden="true">{k === 1 ? '+' : '='}</span>{/if}
						<div
							class="term"
							title={line as string}
							aria-label="{label}: {signed(v as number, 1)} {u}. {line}"
						>
							<span class="t-icon" aria-hidden="true">{icon}</span>
							<span class="t-label">{label}</span>
							<strong class:pos={(v as number) > 0} class:neg={(v as number) < 0}
								>{signed(v as number, 0)}</strong
							>
							<span class="t-verdict" aria-hidden="true">{verdictIcon(c as Compare)}</span>
							{@render meter(c as Compare, v as number)}
						</div>
					{/each}
				{:else if g.model === 'exact' && g.outcome}
					<div class="term">
						<span class="t-icon" aria-hidden="true">🎯</span><span class="t-label">Best play</span>
						<strong>{signed(g.outcome.expected, 1)}</strong>
					</div>
					<span class="op" aria-hidden="true">→</span>
					<div class="term">
						<span class="t-icon" aria-hidden="true">⚑</span><span class="t-label">You</span>
						<strong class:pos={(g.outcome.actual ?? 0) > 0} class:neg={(g.outcome.actual ?? 0) < 0}
							>{signed(g.outcome.actual, 1)}</strong
						>
					</div>
					{#if g.decisions?.evaluated}
						<span class="op" aria-hidden="true">·</span>
						<div class="term" title={bjLine(g)} aria-label={bjLine(g)}>
							<span class="t-icon" aria-hidden="true">✓</span><span class="t-label">Decisions</span>
							<strong
								>{(g.decisions.evaluated ?? 0) - (g.decisions.mistakes ?? 0)}/{g.decisions
									.evaluated}</strong
							>
							<span class="t-sub">−{g.decisions.betsLostPer100} / 100</span>
						</div>
					{/if}
				{:else if g.outcome}
					<div class="term">
						<span class="t-icon" aria-hidden="true">♛</span><span class="t-label">Wins</span>
						<strong>{g.outcome.actual}</strong><span class="t-sub"
							>of {g.outcome.expected} fair</span
						>
					</div>
				{:else}<div class="zero">
						<span aria-hidden="true">?</span><span>Not enough cards yet</span>
					</div>{/if}
			</section>

			<!-- Hands by strength / where the bets went -->
			<section class="tile strength" aria-labelledby="str-title">
				{#if g.byStrength}
					<h2 id="str-title"><span aria-hidden="true">▥</span> Hands</h2>
					<div class="cols">
						{#each ['weak', 'average', 'strong'] as band (band)}
							{@const b = g.byStrength[band as 'weak' | 'average' | 'strong']}
							<div
								class="col"
								class:dim={b.evidence === 'insufficient'}
								aria-label="{band} hands: {b.hands} dealt, stayed in {percent(b.stayRate)}, {signed(
									b.perHand,
									1
								)} {u} a hand"
							>
								<div class="ring" style:--p={b.stayRate ?? 0}>
									<span>{percent(b.stayRate)}</span>
								</div>
								<strong class:pos={(b.perHand ?? 0) > 0} class:neg={(b.perHand ?? 0) < 0}
									>{signed(b.perHand, 1)}</strong
								>
								<span class="lbl"
									>{band === 'weak' ? '▁' : band === 'average' ? '▃' : '▇'} {b.hands}</span
								>
							</div>
						{/each}
					</div>
				{:else if g.decisions?.common?.length}
					<h2 id="str-title"><span aria-hidden="true">♣</span> Where the bets went</h2>
					<ul class="costs">
						{#each g.decisions.common.slice(0, 4) as m (m.action + m.total + m.dealerUp)}
							<li>
								<span class="act"
									>{m.action === 'hit' ? 'Hit' : m.action === 'double' ? 'Double' : 'Stand'}</span
								>
								<span class="vs"
									>{m.total} <small>vs</small> {m.dealerUp === 14 ? 'A' : m.dealerUp}</span
								>
								<span class="x">{m.count}×</span><b>−{m.cost}</b>
							</li>
						{/each}
					</ul>
				{:else}
					<h2 id="str-title"><span aria-hidden="true">▥</span> By hand</h2>
					<div class="zero"><span aria-hidden="true">?</span><span>Not enough yet</span></div>
				{/if}
			</section>

			<!-- Signals: pips out of the total -->
			<section class="tile signals" aria-labelledby="sig-title">
				<h2 id="sig-title"><span aria-hidden="true">⚑</span> Signals</h2>
				{#if g.decisions?.packedStrongHands && g.decisions.playedWeakToTheEnd}
					{#each [['Strong packed', g.decisions.packedStrongHands, 'bad'], ['Weak to the end', g.decisions.playedWeakToTheEnd, 'bluff']] as [label, v, kind] (label)}
						{@const x = v as { k: number; n: number }}
						<div class="sig" aria-label="{label}: {x.k} of {x.n}">
							<span class="s-label">{label}</span>
							<span class="pips" aria-hidden="true"
								>{#each Array.from({ length: Math.min(x.n, 30) }, (_, k) => k) as k (k)}<i
										class:on={k < Math.round((x.k / x.n) * Math.min(x.n, 30))}
										class:warn={kind === 'bad'}
									></i>{/each}</span
							>
							<b>{x.k}/{x.n}</b>
						</div>
					{/each}
				{:else if g.decisions && 'foldedAbovePotOdds' in g.decisions && g.decisions.evaluated}
					<div class="sig">
						<span class="s-label">Good price, packed</span><b>{g.decisions.foldedAbovePotOdds}</b>
					</div>
					<div class="sig">
						<span class="s-label">Poor price, called</span><b>{g.decisions.continuedBelowPotOdds}</b
						>
					</div>
				{:else}<div class="zero">
						<span aria-hidden="true">·</span><span>Nothing to flag</span>
					</div>{/if}
			</section>

			<!-- Improving? -->
			<section class="tile improve" aria-labelledby="imp-title">
				<h2 id="imp-title">
					<span aria-hidden="true">↗</span> Lately vs before
					<span class="imp-v" title={VERDICT[data.improvement.verdict]}
						>{data.improvement.verdict === 'improving'
							? '▲'
							: data.improvement.verdict === 'slipping'
								? '▼'
								: data.improvement.verdict === 'not-enough'
									? '?'
									: '≈'}</span
					>
				</h2>
				<ul class="dims2">
					{#each data.improvement.dimensions.slice(0, 5) as d (d.id)}
						<li
							class:dim={d.evidence === 'insufficient'}
							title="{d.label}{d.note ? `. ${d.note}` : ''}"
						>
							<span
								class="arrow"
								class:up={d.direction === 'better'}
								class:down={d.direction === 'worse'}
								aria-label={DIRECTION[d.direction]}>{ARROW[d.direction]}</span
							>
							<span class="d-label">{d.label.split(':')[0]}</span>
							<span class="d-vals"
								>{dimValue(d, d.baseline.value)} <span aria-hidden="true">→</span>
								{dimValue(d, d.recent.value)}</span
							>
						</li>
					{/each}
				</ul>
			</section>

			<!-- Luck, night by night -->
			<section class="tile luck" aria-labelledby="luck-title">
				<h2 id="luck-title"><span aria-hidden="true">☾</span> Cards by night</h2>
				<ol class="nights">
					{#each [...data.skill.nights].reverse().slice(0, 10) as n (n.nightId)}
						<li>
							<button
								onclick={() => onRecap(n.nightId)}
								aria-label="{day(n.at)}: {n.luck === 'hot'
									? 'warm'
									: n.luck === 'cold'
										? 'cold'
										: n.luck === 'average'
											? 'average'
											: 'too few'} cards, {boots(n.units)}"
								title="{day(n.at)} · {boots(n.units)}"
								><span class="l-ic">{LUCK[n.luck] ?? '·'}</span><span
									class:pos={n.units > 0}
									class:neg={n.units < 0}>{signed(n.units, 0)}</span
								></button
							>
						</li>
					{/each}
				</ol>
			</section>
		</div>
	</div>
{/if}

<style>
	.sk {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.games-bar {
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
	.red {
		color: #f39788;
	}
	.seg button[aria-pressed='true'] .red {
		color: #b8402c;
	}
	.model,
	.count {
		padding: 5px 11px;
		border-radius: 100px;
		background: #f2dc911a;
		color: var(--butter);
		font-size: 12px;
		font-weight: 700;
	}
	.count {
		background: #ffffff10;
		color: var(--paper);
	}
	.how {
		color: var(--muted);
		cursor: help;
	}
	.sk-grid {
		flex: 1;
		min-height: 0;
		display: grid;
		gap: 12px;
		grid-template-columns: 1.2fr 1fr 1fr;
		grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr);
		grid-template-areas:
			'split split strength'
			'signals improve luck';
	}
	.tile {
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		border-radius: 18px;
		background: #2c263b;
		border: 1px solid #ffffff1a;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		font-family: var(--font-display);
		font-size: 14px !important;
		font-weight: 700 !important;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	h2 > span:first-child {
		color: var(--butter);
	}
	.pos {
		color: #a9cfb5;
	}
	.neg {
		color: #f39788;
	}
	/* Too early to tell: kept readable, drawn in the muted colour with a dashed edge. */
	.dim,
	.dim :is(strong, span, b) {
		color: var(--muted) !important;
	}
	.col.dim .ring {
		background:
			radial-gradient(closest-side, #2c263b 78%, transparent 79%),
			conic-gradient(#ffffff40 calc(var(--p) * 1turn), #ffffff14 0);
	}
	.zero {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--muted);
		height: 100%;
	}
	.zero > :first-child {
		font-size: 30px;
		color: var(--butter);
	}
	.split {
		grid-area: split;
		flex-direction: row;
		align-items: stretch;
		gap: 12px;
	}
	.term {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 6px;
		padding: 12px;
		border-radius: 14px;
		background: #ffffff07;
		position: relative;
	}
	.t-icon {
		font-size: 26px;
		line-height: 1;
	}
	.t-label {
		font-size: 12px;
		color: var(--muted);
		font-weight: 600;
	}
	.term strong {
		font-family: var(--font-display);
		font-size: clamp(30px, 3.6vw, 52px);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
	}
	.t-sub {
		font-size: 12px;
		color: var(--muted);
	}
	.t-verdict {
		position: absolute;
		top: 12px;
		right: 12px;
		font-size: 14px;
		color: var(--muted);
	}
	.op {
		align-self: center;
		font-family: var(--font-display);
		font-size: 30px;
		color: var(--butter);
		opacity: 0.8;
	}
	.meter {
		position: relative;
		height: 10px;
		border-radius: 5px;
		background: #ffffff10;
		margin-top: 4px;
	}
	.meter .z {
		position: absolute;
		left: 50%;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: #ffffff55;
	}
	.meter .band {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 5px;
		background: #f2dc9147;
	}
	.meter .dot {
		position: absolute;
		top: 50%;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		translate: -50% -50%;
		background: #a9cfb5;
		box-shadow: 0 0 0 3px #2c263b;
	}
	.meter .dot.neg {
		background: #ee715b;
	}
	.strength {
		grid-area: strength;
	}
	.cols {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		align-items: center;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}
	.ring {
		--p: 0;
		width: min(76px, 100%);
		aspect-ratio: 1;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background:
			radial-gradient(closest-side, #2c263b 78%, transparent 79%),
			conic-gradient(var(--butter) calc(var(--p) * 1turn), #ffffff14 0);
		font-size: 13px;
		font-weight: 800;
	}
	.col strong {
		font-family: var(--font-display);
		font-size: 18px;
	}
	.lbl {
		font-size: 12px;
		color: var(--muted);
	}
	.costs {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.costs li {
		display: grid;
		grid-template-columns: auto 1fr auto auto;
		gap: 10px;
		align-items: center;
		padding: 6px 10px;
		border-radius: 10px;
		background: #ffffff07;
		font-size: 13px;
	}
	.act {
		font-weight: 800;
		color: var(--butter);
	}
	.vs small,
	.x {
		color: var(--muted);
	}
	.costs b {
		color: #f39788;
	}
	.signals {
		grid-area: signals;
	}
	.sig {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px 10px;
		align-items: center;
	}
	.s-label {
		font-size: 12px;
		color: var(--muted);
	}
	.pips {
		grid-column: 1 / -1;
		grid-row: 2;
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
	}
	.pips i {
		width: 9px;
		height: 14px;
		border-radius: 3px;
		background: #ffffff14;
	}
	.pips i.on {
		background: var(--butter);
	}
	.pips i.on.warn {
		background: #ee715b;
	}
	.sig b {
		font-family: var(--font-display);
		font-size: 16px;
	}
	.improve {
		grid-area: improve;
	}
	.imp-v {
		margin-left: auto;
		color: var(--muted) !important;
	}
	.dims2 {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.dims2 li {
		display: grid;
		grid-template-columns: 22px 1fr auto;
		gap: 8px;
		align-items: center;
		font-size: 12px;
	}
	.arrow {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #ffffff10;
		font-weight: 800;
	}
	.arrow.up {
		background: #a9cfb52e;
		color: #a9cfb5;
	}
	.arrow.down {
		background: #ee715b2e;
		color: #f39788;
	}
	.d-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.d-vals {
		color: var(--muted);
		white-space: nowrap;
	}
	.luck {
		grid-area: luck;
	}
	.nights {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 6px;
		align-content: start;
	}
	.nights button {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 2px;
		border-radius: 10px;
		background: #ffffff08;
		font-size: 11px;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.2s,
			translate 0.2s;
	}
	.nights button:hover,
	.nights button:focus-visible {
		background: #f2dc911f;
		translate: 0 -2px;
	}
	.l-ic {
		font-size: 18px;
	}
	@media (max-width: 1000px) {
		.sk-grid {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr);
			grid-template-areas:
				'split split'
				'strength signals'
				'improve luck';
		}
	}
	@media (max-width: 720px) {
		.games-bar .model,
		.games-bar .count {
			display: none;
		}
		.seg button {
			padding: 0 10px;
			font-size: 12px;
		}
		.sk-grid {
			gap: 8px;
			grid-template-rows: minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.9fr);
		}
		.tile {
			padding: 10px 12px;
			border-radius: 14px;
			gap: 6px;
		}
		.split {
			gap: 6px;
		}
		.term {
			padding: 8px;
			gap: 3px;
		}
		.t-icon {
			font-size: 18px;
		}
		.term strong {
			font-size: 24px;
		}
		.op {
			font-size: 18px;
		}
		.ring {
			width: 42px;
			font-size: 10px;
		}
		.col strong {
			font-size: 13px;
		}
		.lbl {
			font-size: 10px;
		}
		.dims2 li:nth-child(n + 4) {
			display: none;
		}
		.d-vals {
			display: none;
		}
		.nights {
			grid-template-columns: repeat(4, 1fr);
		}
		.nights li:nth-child(n + 9) {
			display: none;
		}
		.pips i {
			width: 6px;
			height: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nights button {
			transition: none;
			translate: none;
		}
	}
</style>
