<script lang="ts">
	/** The first screen: am I winning, is it real, how is it going, and what stands out. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { day, gameName, resultsPhrase, signed, UNIT_NAMES } from '../format.js';
	import type { Insight, Overview as OverviewData } from '../types.js';

	let {
		filter,
		onOpenHand,
		onSection,
		onRecap
	}: {
		filter: Filter;
		onOpenHand: (id: string) => void;
		onSection: (s: string) => void;
		onRecap: (nightId: string) => void;
	} = $props();
	let data = $state<OverviewData | null>(null);
	let insights = $state<Insight[]>([]);
	let error = $state('');

	$effect(() => {
		const params = { ...filter };
		data = null;
		error = '';
		fetchAnalytics<{ overview: OverviewData }>('overview', params)
			.then((b) => (data = b.overview))
			.catch((e) => (error = e.message));
		// The ranked few: confident, large, and not shown to you recently.
		fetchAnalytics<{ insights: Insight[]; top?: Insight[] }>('insights', params)
			.then((b) => (insights = b.top ?? b.insights.filter((i) => i.eligible)))
			.catch(() => (insights = []));
	});

	const SUIT: Record<string, string> = {
		'teen-patti': '♠',
		'texas-holdem': '♦',
		blackjack: '♣',
		rummy: '♥'
	};
	const W = 600,
		H = 200;
	/** Running total as an area: a line above zero, the fill down to the zero line. */
	const chart = $derived.by(() => {
		const pts = data?.cumulative ?? [];
		if (pts.length < 2) return null;
		const vs = pts.map((p) => p.units);
		const lo = Math.min(0, ...vs),
			hi = Math.max(0, ...vs),
			span = hi - lo || 1;
		const x = (k: number) => (k / (pts.length - 1)) * W;
		const y = (v: number) => 8 + (1 - (v - lo) / span) * (H - 16);
		const line = pts
			.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.units).toFixed(1)}`)
			.join(' ');
		return {
			line,
			area: `${line} L${W},${y(0)} L0,${y(0)} Z`,
			zero: y(0),
			last: vs.at(-1) ?? 0,
			hi,
			lo
		};
	});
	const nightTop = $derived(
		Math.max(1, ...(data?.recentNights ?? []).map((n) => Math.abs(n.units)))
	);
	/** Per hand estimate as a bar on a scale centred on zero. */
	const range = $derived.by(() => {
		const r = data?.results;
		if (!r || r.perHandLow == null || r.perHandHigh == null) return null;
		const m = Math.max(Math.abs(r.perHandLow), Math.abs(r.perHandHigh), 1);
		const pos = (v: number) => 50 + (v / m) * 50;
		return { low: pos(r.perHandLow), high: pos(r.perHandHigh), mid: pos(r.perHand ?? 0) };
	});
	const ICON: Record<string, string> = {
		pattern: '◈',
		'opponent-pattern': '⚔',
		trend: '↗',
		record: '♛'
	};
</script>

{#if error}
	<p class="notice" role="alert">{error}</p>
{:else if !data}
	<div class="dash" aria-busy="true">
		{#each Array.from({ length: 6 }, (_, k) => k) as k (k)}<div class="tile ghost"></div>{/each}
	</div>
{:else if !data.hands}
	<div class="zero">
		<span aria-hidden="true">🂠</span>
		<strong>0 hands</strong>
		<p>Play with friends and this fills up.</p>
	</div>
{:else}
	{@const r = data.results}
	{@const fair = data.fairShare}
	{@const up = r.units > 0}
	{@const max = Math.max(fair.wins, fair.expected) * 1.5 || 1}
	{@const ratio = fair.ratio ?? 1}
	<div class="dash">
		<!-- The result: one number, a verdict arrow, and where the truth probably lies. -->
		<section class="tile result" aria-label="Your result: {resultsPhrase(r)}">
			<div
				class="verdict"
				class:up={r.verdict === 'winning' || r.verdict === 'ahead'}
				class:down={r.verdict === 'losing' || r.verdict === 'behind'}
			>
				{r.verdict === 'winning' || r.verdict === 'ahead'
					? '▲'
					: r.verdict === 'losing' || r.verdict === 'behind'
						? '▼'
						: '≈'}
			</div>
			<strong class="hero" class:pos={up} class:neg={r.units < 0}>{signed(r.units, 0)}</strong>
			<span class="unit">boots</span>
			{#if range}
				<div
					class="range"
					role="img"
					aria-label="Per hand {signed(r.perHand, 1)}, likely between {signed(
						r.perHandLow,
						0
					)} and {signed(r.perHandHigh, 0)}"
				>
					<span class="zero-line"></span>
					<span class="band" style:left="{range.low}%" style:width="{range.high - range.low}%"
					></span>
					<span class="dot" style:left="{range.mid}%"></span>
				</div>
				<span class="range-cap"
					><span>{signed(r.perHandLow, 0)}</span><b>{signed(r.perHand, 1)} / 🂠</b><span
						>{signed(r.perHandHigh, 0)}</span
					></span
				>
			{/if}
			<ul class="games" aria-label="Hands by game">
				{#each Object.entries(data.games) as [g, n] (g)}<li title={gameName(g)}>
						<span class:red={SUIT[g] === '♦' || SUIT[g] === '♥'} aria-hidden="true"
							>{SUIT[g] ?? '•'}</span
						>{n}<span class="sr">{gameName(g)}</span>
					</li>{/each}
				<li title="Nights">
					<span aria-hidden="true">☾</span>{data.nights}<span class="sr">nights</span>
				</li>
			</ul>
		</section>

		<!-- Running total -->
		<section class="tile trend" aria-labelledby="trend-title">
			<h2 id="trend-title"><span aria-hidden="true">↗</span> Running total</h2>
			{#if chart}
				<svg
					viewBox="0 0 {W} {H}"
					preserveAspectRatio="none"
					role="img"
					aria-label="Running total, now {signed(chart.last, 0)} boots"
				>
					<defs>
						<linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
							<stop offset="0" stop-color="#f2dc91" stop-opacity="0.35" /><stop
								offset="1"
								stop-color="#f2dc91"
								stop-opacity="0"
							/>
						</linearGradient>
					</defs>
					<path d={chart.area} fill="url(#area)" />
					<line x1="0" x2={W} y1={chart.zero} y2={chart.zero} class="zl" />
					<path d={chart.line} class="ln" vector-effect="non-scaling-stroke" />
				</svg>
				<span class="ends"
					><span>{signed(chart.hi, 0)}</span><span>{signed(chart.lo, 0)}</span></span
				>
			{/if}
		</section>

		<!-- Fair share: a gauge, the needle at your wins, the notch at what luck alone would give. -->
		<section class="tile fair" aria-labelledby="fair-title">
			<h2 id="fair-title"><span aria-hidden="true">⚖</span> Wins vs fair share</h2>
			<div
				class="gauge"
				style:--w={Math.min(1, fair.wins / max)}
				style:--e={Math.min(1, fair.expected / max)}
				role="img"
				aria-label="{fair.wins} wins, {Math.round(fair.expected * 10) / 10} expected"
			>
				<div class="arc"></div>
				<span class="notch"></span>
				<div class="read">
					<strong>{fair.wins}</strong><span>/ {Math.round(fair.expected * 10) / 10}</span>
				</div>
			</div>
			<span class="tag" class:up={ratio > 1.05} class:down={ratio < 0.95}>×{ratio.toFixed(2)}</span>
		</section>

		<!-- Recent nights -->
		<section class="tile nights" aria-labelledby="nights-title">
			<h2 id="nights-title"><span aria-hidden="true">☾</span> Nights</h2>
			<ol class="bars">
				{#each data.recentNights as night (night.nightId)}
					<li>
						<button
							onclick={() => onRecap(night.nightId)}
							aria-label="{day(night.at)}: {signed(night.units, 0)} boots over {night.hands} hands"
							title="{day(night.at)} · {signed(night.units, 0)}"
						>
							<span class="half top"
								>{#if night.units > 0}<i style:height="{(night.units / nightTop) * 100}%"
									></i>{/if}</span
							>
							<span class="half bottom"
								>{#if night.units < 0}<i
										class="neg"
										style:height="{(-night.units / nightTop) * 100}%"
									></i>{/if}</span
							>
						</button>
					</li>
				{/each}
			</ol>
			<button class="more" onclick={() => onSection('history')} aria-label="All nights">⤢</button>
		</section>

		<!-- Records -->
		<section class="tile records" aria-label="Records">
			{#if r.bestNight}<div class="rec">
					<span class="ic up" aria-hidden="true">▲</span><strong class="pos"
						>{signed(r.bestNight.units, 0)}</strong
					><span>{day(r.bestNight.at)}</span>
				</div>{/if}
			{#if r.worstNight}<div class="rec">
					<span class="ic down" aria-hidden="true">▼</span><strong class="neg"
						>{signed(r.worstNight.units, 0)}</strong
					><span>{day(r.worstNight.at)}</span>
				</div>{/if}
			{#if data.biggestPot}{@const pot = data.biggestPot}<button
					class="rec"
					onclick={() => onOpenHand(pot.handId)}
					aria-label="Biggest pot: {pot.units} {UNIT_NAMES[pot.gameType]?.[1] ??
						'boots'}, {gameName(pot.gameType)}"
					><span class="ic" aria-hidden="true">💰</span><strong>{pot.units}</strong><span
						>{SUIT[pot.gameType] ?? ''} {day(pot.at)}</span
					></button
				>{/if}
		</section>

		<!-- What stands out: the engine's top findings, each with a glyph. -->
		<section class="tile stand" aria-labelledby="stand-title">
			<h2 id="stand-title"><span aria-hidden="true">✦</span> Stands out</h2>
			{#if insights.length}
				<ul>
					{#each insights.slice(0, 2) as insight (insight.id)}
						<li>
							<span class="glyph" aria-hidden="true">{ICON[insight.type] ?? '◈'}</span>
							{#if insight.value != null && insight.baseline != null}<span class="vs"
									><b>{Math.round(insight.value * 100)}%</b><small
										>vs {Math.round(insight.baseline * 100)}%</small
									></span
								>{/if}
							<p>{insight.text}</p>
						</li>
					{/each}
				</ul>
			{:else}<div class="calm">
					<span aria-hidden="true">≈</span><span>Nothing unusual</span>
				</div>{/if}
		</section>
	</div>
{/if}

<style>
	.dash {
		height: 100%;
		min-height: 0;
		display: grid;
		gap: 12px;
		grid-template-columns: 1.1fr 1.5fr 1fr;
		grid-template-rows: repeat(2, minmax(0, 1fr));
		grid-template-areas:
			'result trend fair'
			'nights records stand';
	}
	.tile {
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		position: relative;
		border-radius: 18px;
		background: #2c263b;
		border: 1px solid #ffffff1a;
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.ghost {
		background: linear-gradient(90deg, #2c263b, #342d45, #2c263b);
	}
	h2 {
		font-family: var(--font-display);
		font-size: 14px !important;
		font-weight: 700 !important;
		display: flex;
		gap: 7px;
		align-items: center;
	}
	h2 > span {
		color: var(--butter);
	}
	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
	}
	.pos {
		color: #a9cfb5;
	}
	.neg {
		color: #f39788;
	}
	.red {
		color: #f39788;
	}
	.result {
		grid-area: result;
		justify-content: center;
	}
	.verdict {
		position: absolute;
		top: 14px;
		right: 16px;
		width: 38px;
		height: 38px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: #ffffff12;
		font-size: 18px;
		color: var(--muted);
	}
	.verdict.up {
		background: #a9cfb52e;
		color: #a9cfb5;
	}
	.verdict.down {
		background: #ee715b2e;
		color: #f39788;
	}
	.hero {
		font-family: var(--font-display);
		font-size: clamp(44px, 5.4vw, 76px);
		font-weight: 800;
		letter-spacing: -0.05em;
		line-height: 0.95;
	}
	.unit {
		font-size: 12px;
		color: var(--muted);
		margin-top: -4px;
	}
	.range {
		position: relative;
		height: 12px;
		margin-top: 8px;
		border-radius: 6px;
		background: #ffffff10;
	}
	.zero-line {
		position: absolute;
		left: 50%;
		top: -4px;
		bottom: -4px;
		width: 2px;
		background: #ffffff55;
	}
	.band {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 6px;
		background: #f2dc9155;
	}
	.dot {
		position: absolute;
		top: 50%;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		translate: -50% -50%;
		background: var(--butter);
		box-shadow: 0 0 0 3px #2c263b;
	}
	.range-cap {
		display: flex;
		justify-content: space-between;
		font-size: 11px;
		color: var(--muted);
	}
	.range-cap b {
		color: var(--paper);
	}
	.games {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 6px;
	}
	.games li {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 10px;
		border-radius: 100px;
		background: #ffffff0f;
		font-size: 13px;
		font-weight: 700;
	}
	.trend {
		grid-area: trend;
	}
	.trend svg {
		flex: 1;
		min-height: 0;
		width: 100%;
	}
	.ln {
		fill: none;
		stroke: var(--butter);
		stroke-width: 2.5;
		stroke-linejoin: round;
	}
	.zl {
		stroke: #ffffff33;
		stroke-dasharray: 4 6;
		vector-effect: non-scaling-stroke;
	}
	.ends {
		position: absolute;
		right: 16px;
		top: 14px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		font-size: 11px;
		color: var(--muted);
	}
	.fair {
		grid-area: fair;
		align-items: center;
	}
	.gauge {
		position: relative;
		flex: 1;
		min-height: 0;
		width: 100%;
		max-width: 240px;
		display: grid;
		place-items: end center;
		container-type: inline-size;
	}
	.arc {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		aspect-ratio: 2;
		max-height: 100%;
		margin: auto;
		border-radius: 999px 999px 0 0;
		background:
			radial-gradient(circle at 50% 100%, #2c263b 54%, transparent 55%),
			conic-gradient(
				from 270deg at 50% 100%,
				var(--butter) calc(var(--w) * 180deg),
				#ffffff14 0 180deg,
				transparent 0
			);
	}
	.notch {
		position: absolute;
		left: 50%;
		bottom: 0;
		width: 3px;
		/* The arc's radius; only its outer part is drawn, as a tick on the rim. */
		height: 50cqw;
		background: linear-gradient(to top, transparent 56%, var(--paper) 56%);
		transform-origin: 50% 100%;
		rotate: calc(var(--e) * 180deg - 90deg);
		border-radius: 2px;
		opacity: 0.85;
	}
	.read {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 4px;
		padding-bottom: 2px;
	}
	.read strong {
		font-family: var(--font-display);
		font-size: 34px;
		font-weight: 800;
		line-height: 1;
	}
	.read span {
		color: var(--muted);
		font-size: 14px;
	}
	.tag {
		padding: 4px 12px;
		border-radius: 100px;
		background: #ffffff12;
		font-weight: 800;
		font-size: 13px;
	}
	.tag.up {
		background: #a9cfb52e;
		color: #a9cfb5;
	}
	.tag.down {
		background: #ee715b2e;
		color: #f39788;
	}
	.nights {
		grid-area: nights;
	}
	.bars {
		flex: 1;
		min-height: 0;
		display: flex;
		gap: 4px;
	}
	.bars li {
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.bars button {
		flex: 1;
		display: flex;
		flex-direction: column;
		border-radius: 6px;
		cursor: pointer;
		transition: background 0.2s;
	}
	.bars button:hover,
	.bars button:focus-visible {
		background: #ffffff10;
	}
	.half {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		padding: 0 3px;
	}
	.half.bottom {
		justify-content: flex-start;
		border-top: 1px solid #ffffff33;
	}
	.half i {
		display: block;
		min-height: 3px;
		border-radius: 4px 4px 1px 1px;
		background: #a9cfb5;
	}
	.half i.neg {
		border-radius: 1px 1px 4px 4px;
		background: #ee715b;
	}
	.more {
		position: absolute;
		top: 10px;
		right: 12px;
		width: 30px;
		height: 30px;
		border-radius: 10px;
		color: var(--muted);
		cursor: pointer;
	}
	.more:hover,
	.more:focus-visible {
		background: #ffffff14;
		color: var(--butter);
	}
	.records {
		grid-area: records;
		flex-direction: row;
		gap: 10px;
	}
	.rec {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		border-radius: 14px;
		background: #ffffff08;
		text-align: center;
	}
	button.rec {
		cursor: pointer;
		transition:
			background 0.2s,
			translate 0.2s;
	}
	button.rec:hover,
	button.rec:focus-visible {
		background: #f2dc911f;
		translate: 0 -2px;
	}
	.rec .ic {
		font-size: 20px;
		color: var(--butter);
	}
	.rec .ic.up {
		color: #a9cfb5;
	}
	.rec .ic.down {
		color: #f39788;
	}
	.rec strong {
		font-family: var(--font-display);
		font-size: clamp(22px, 2.4vw, 32px);
		font-weight: 800;
		letter-spacing: -0.03em;
	}
	.rec > span:last-child {
		font-size: 11px;
		color: var(--muted);
	}
	.stand {
		grid-area: stand;
	}
	.stand ul {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-height: 0;
	}
	.stand li {
		display: grid;
		grid-template-columns: 30px auto 1fr;
		align-items: center;
		gap: 10px;
	}
	.glyph {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: #f2dc911f;
		color: var(--butter);
	}
	.vs {
		display: flex;
		flex-direction: column;
		line-height: 1.05;
	}
	.vs b {
		font-family: var(--font-display);
		font-size: 20px;
	}
	.vs small {
		font-size: 10px;
		color: var(--muted);
	}
	.stand p {
		font-size: 11px;
		line-height: 1.35;
		color: var(--muted);
		display: -webkit-box;
		line-clamp: 3;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.calm,
	.zero {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--muted);
	}
	.calm > span:first-child,
	.zero > span:first-child {
		font-size: 32px;
		color: var(--butter);
	}
	.zero {
		height: 100%;
	}
	.zero strong {
		font-family: var(--font-display);
		font-size: 28px;
		color: var(--paper);
	}
	@media (max-width: 1000px) {
		.dash {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: repeat(3, minmax(0, 1fr));
			grid-template-areas:
				'result fair'
				'trend trend'
				'nights records';
		}
		.stand {
			display: none;
		}
	}
	@media (max-width: 720px) {
		.dash {
			gap: 8px;
			grid-template-rows: 1.1fr 0.9fr 0.8fr;
		}
		.tile {
			padding: 10px 12px;
			border-radius: 14px;
			gap: 4px;
		}
		.hero {
			font-size: 40px;
		}
		.games li:nth-child(n + 3) {
			display: none;
		}
		.read strong {
			font-size: 24px;
		}
		.records {
			flex-direction: column;
			gap: 4px;
		}
		.rec {
			flex-direction: row;
			gap: 8px;
			padding: 0 8px;
		}
		.rec strong {
			font-size: 16px;
		}
		.rec .ic {
			font-size: 14px;
		}
		.verdict {
			width: 30px;
			height: 30px;
			font-size: 14px;
			top: 10px;
			right: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		button.rec,
		.bars button {
			transition: none;
			translate: none;
		}
	}
</style>
