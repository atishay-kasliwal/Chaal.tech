<script lang="ts">
	/** How you play: rates per real chance, beside the club, and how they shift by situation. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { percent } from '../format.js';
	import { properName } from '#lib/names.js';
	import type { Contrast, Count, PatternsView } from '../types.js';

	interface Row {
		key: string;
		label: string;
		opponent: string | null;
		raise: Contrast | null;
		fold: Contrast | null;
	}

	let { filter }: { filter: Filter } = $props();
	let data = $state<PatternsView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		data = null;
		fetchAnalytics<PatternsView>('patterns', params)
			.then((b) => (data = b))
			.catch((e) => (error = e.message));
	});
	const MIN = 20;
	const rate = (x: Count) => (x.n ? x.k / x.n : null);
	const VERB: Record<string, string> = { raise: 'raise', fold: 'pack/fold' };
	/** One row per situation (or person): raise and pack side by side, biggest shifts first. */
	function group(list: Contrast[], key: (s: Contrast) => string): Row[] {
		const rows: Record<string, Row> = {};
		for (const s of list.filter((x) => x.evidence !== 'insufficient')) {
			const k = key(s);
			const row: Row = rows[k] ?? {
				key: k,
				label: s.label,
				opponent: s.opponent ?? null,
				raise: null,
				fold: null
			};
			if (s.action === 'raise' || s.action === 'fold') row[s.action] = s;
			rows[k] = row;
		}
		const shift = (r: Row) => Math.max(Math.abs(r.raise?.diff ?? 0), Math.abs(r.fold?.diff ?? 0));
		return Object.values(rows).sort(
			(a, b) =>
				Number(!!(b.raise?.significant || b.fold?.significant)) -
					Number(!!(a.raise?.significant || a.fold?.significant)) || shift(b) - shift(a)
		);
	}
	const situations = $derived(
		group(
			(data?.situations ?? []).filter((s) => !s.opponent),
			(s) => s.segment
		)
	);
	const opponents = $derived(
		group(
			(data?.situations ?? []).filter((s) => s.opponent),
			(s) => s.opponent ?? ''
		)
	);
	const who = (s: string) =>
		data?.names?.[s] ? properName(data.names[s].name) : s.startsWith('bot:') ? 'a bot' : 'a friend';
	const MOVES = $derived(
		data
			? ([
					['↑', 'Raise', data.core.raise, data.club.raise],
					['→', 'Call', data.core.call, data.club.call],
					['✕', 'Pack', data.core.fold, data.club.fold],
					['👁', 'Show', data.core.show, data.club.show],
					['⏱', 'Timer', data.core.timeout, data.club.timeout]
				] as const)
			: []
	);
</script>

{#snippet shift(c: Contrast | null, verb: string)}
	{#if c}
		<span
			class="shift"
			class:sig={c.significant}
			title="{verb} {percent(c.rate)}, usually {percent(c.baseline.rate)} ({c.n} chances)"
			><span class="sv">{verb}</span><span class="trk"
				><span class="base" style:left="{(c.baseline.rate ?? 0) * 100}%"></span><span
					class="now"
					class:up={(c.rate ?? 0) > (c.baseline.rate ?? 0)}
					style:left="{(c.rate ?? 0) * 100}%"
				></span></span
			><b>{percent(c.rate)}</b></span
		>
	{:else}<span class="shift none">·</span>{/if}
{/snippet}

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<div class="st" aria-busy="true"></div>
{:else if !data.core.decisions}<div class="v-zero">
		<span aria-hidden="true">✦</span><strong>0 decisions</strong>
	</div>
{:else}
	<div class="st">
		<section class="vt moves" aria-labelledby="moves-title">
			<h2 id="moves-title">
				<span class="ic" aria-hidden="true">✦</span> Your moves
				<span class="legend"><i></i> club</span>
			</h2>
			<div class="cols">
				{#each MOVES as [icon, label, x, club] (label)}
					{@const r = rate(x)}
					<div
						class="col"
						class:v-dim={x.n < MIN}
						title="{label}: {x.k} of {x.n} chances{club !== null ? `, club ${percent(club)}` : ''}"
					>
						<b>{x.n ? percent(r) : '·'}</b>
						<div class="well">
							<span class="fill" style:height="{(r ?? 0) * 100}%"></span>
							{#if club !== null}<span class="club" style:bottom="{club * 100}%"></span>{/if}
						</div>
						<span class="m-ic" aria-hidden="true">{icon}</span>
						<span class="m-label">{label}</span>
					</div>
				{/each}
			</div>
		</section>

		<section class="vt habits" aria-label="Habits">
			{#if data.core.teenPatti.seeFirst.n}
				{@const tp = data.core.teenPatti}
				<div class="h" title="Blind bets a hand, before you look">
					<span class="h-ic" aria-hidden="true">🙈</span><strong class="v-big"
						>{tp.blindDecisionsPerHand ?? '·'}</strong
					><span>blind / 🂠</span>
				</div>
				<div class="h" title="Look at your cards straight away">
					<span class="h-ic" aria-hidden="true">👀</span><strong class="v-big"
						>{percent(rate(tp.seeFirst))}</strong
					><span>look at once</span>
				</div>
				<div class="h" title="Raise while blind, and once seen">
					<span class="h-ic" aria-hidden="true">↑</span><strong class="v-big"
						>{percent(rate(tp.blindRaise))}</strong
					><span>blind · seen {percent(rate(tp.seenRaise))}</span>
				</div>
				<div class="h" title="Shows you won when you asked">
					<span class="h-ic" aria-hidden="true">👁</span><strong class="v-big"
						>{tp.showWon.n ? `${tp.showWon.k}/${tp.showWon.n}` : '·'}</strong
					><span>shows won</span>
				</div>
			{/if}
			{#if data.core.holdem.aggressionFactor !== null}
				<div class="h" title="Hold’em: raises for every call">
					<span class="h-ic v-red" aria-hidden="true">♦</span><strong class="v-big"
						>{data.core.holdem.aggressionFactor}</strong
					><span>raise / call</span>
				</div>
			{/if}
			{#each data.styleChange
				.filter((x) => x.evidence !== 'insufficient')
				.slice(0, 2) as c (c.action)}
				<div class="h" title="Last 30 days against before: {VERB[c.action] ?? c.action}">
					<span class="h-ic" aria-hidden="true"
						>{(c.rate ?? 0) > (c.baseline.rate ?? 0) ? '↗' : '↘'}</span
					><strong class="v-big">{percent(c.rate)}</strong><span
						>{VERB[c.action] ?? c.action} · was {percent(c.baseline.rate)}</span
					>
				</div>
			{/each}
		</section>

		<section class="vt situ" aria-labelledby="situ-title">
			<h2 id="situ-title"><span class="ic" aria-hidden="true">⇄</span> When things change</h2>
			<ul class="list">
				{#each situations.slice(0, 5) as row (row.key)}
					<li>
						<span class="who" title={row.label}
							>{#if row.raise?.significant || row.fold?.significant}<span
									class="dotmark"
									aria-label="Survives the luck check">●</span
								>{/if}{row.label}</span
						>
						{@render shift(row.raise, '↑')}
						{@render shift(row.fold, '✕')}
					</li>
				{:else}<li class="v-zero">
						<span aria-hidden="true">·</span><span>Not enough yet</span>
					</li>{/each}
			</ul>
		</section>

		<section class="vt people" aria-labelledby="ppl-title">
			<h2 id="ppl-title"><span class="ic" aria-hidden="true">👥</span> With them in the hand</h2>
			<ul class="list">
				{#each opponents.slice(0, 5) as row (row.key)}
					<li>
						<span class="who"
							>{#if row.raise?.significant || row.fold?.significant}<span
									class="dotmark"
									aria-label="Survives the luck check">●</span
								>{/if}{who(row.opponent ?? '')}</span
						>
						{@render shift(row.raise, '↑')}
						{@render shift(row.fold, '✕')}
					</li>
				{:else}<li class="v-zero">
						<span aria-hidden="true">·</span><span>Not enough yet</span>
					</li>{/each}
			</ul>
		</section>
	</div>
{/if}

<style>
	.st {
		height: 100%;
		min-height: 0;
		display: grid;
		gap: 12px;
		grid-template-columns: 1fr 1.25fr 1.25fr;
		grid-template-rows: minmax(0, 0.8fr) minmax(0, 1.2fr);
		grid-template-areas:
			'moves habits habits'
			'moves situ people';
	}
	.moves {
		grid-area: moves;
	}
	.habits {
		grid-area: habits;
		flex-direction: row;
		align-items: stretch;
		gap: 10px;
	}
	.situ {
		grid-area: situ;
	}
	.people {
		grid-area: people;
	}
	.legend {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-family: system-ui, sans-serif;
		font-size: 11px;
		font-weight: 400;
		color: var(--muted);
	}
	.legend i {
		width: 12px;
		height: 2px;
		background: var(--paper);
	}
	.cols {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
	}
	.col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		min-height: 0;
	}
	.col b {
		font-family: var(--font-display);
		font-size: 15px;
	}
	.well {
		position: relative;
		flex: 1;
		width: 100%;
		max-width: 46px;
		min-height: 40px;
		border-radius: 10px;
		background: #ffffff0d;
		overflow: hidden;
	}
	.fill {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(to top, #f2dc91, #f2dc91cc);
		border-radius: 8px 8px 0 0;
	}
	.club {
		position: absolute;
		left: -2px;
		right: -2px;
		height: 2px;
		background: var(--paper);
		box-shadow: 0 0 0 1px #2c263b;
	}
	.m-ic {
		font-size: 16px;
	}
	.m-label {
		font-size: 11px;
		color: var(--muted);
	}
	.h {
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 10px 8px;
		border-radius: 14px;
		background: #ffffff07;
		text-align: center;
	}
	.h-ic {
		font-size: 22px;
	}
	.h strong {
		font-size: clamp(20px, 2.2vw, 30px);
	}
	.h > span:last-child {
		font-size: 11px;
		color: var(--muted);
	}
	.list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
		min-height: 0;
	}
	.list li {
		display: grid;
		grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
		align-items: center;
		font-size: 12px;
	}
	.who {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
	}
	.dotmark {
		color: var(--butter);
		margin-right: 4px;
	}
	.shift {
		display: grid;
		grid-template-columns: 14px 1fr 34px;
		gap: 6px;
		align-items: center;
	}
	.shift.none {
		display: block;
		color: var(--muted);
		text-align: center;
	}
	.sv {
		color: var(--muted);
	}
	.trk {
		position: relative;
		height: 8px;
		border-radius: 4px;
		background: #ffffff10;
	}
	.base {
		position: absolute;
		top: -3px;
		bottom: -3px;
		width: 2px;
		background: #ffffff70;
	}
	.now {
		position: absolute;
		top: 50%;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		translate: -50% -50%;
		background: #ee715b;
	}
	.now.up {
		background: #a9cfb5;
	}
	.shift.sig .now {
		box-shadow: 0 0 0 2px var(--butter);
	}
	.shift b {
		text-align: right;
		font-family: var(--font-display);
	}
	@media (max-width: 1000px) {
		.st {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1fr);
			grid-template-areas:
				'moves habits'
				'moves habits'
				'situ people';
		}
	}
	@media (max-width: 720px) {
		.st {
			gap: 8px;
			grid-template-columns: 1fr;
			grid-template-rows: minmax(0, 1fr) auto minmax(0, 1fr);
			grid-template-areas: 'moves' 'habits' 'situ';
		}
		.people {
			display: none;
		}
		.h {
			flex: 1 1 40%;
			padding: 6px 8px;
		}
		.h-ic {
			font-size: 16px;
		}
		.h strong {
			font-size: 18px;
		}
		.habits .h:nth-child(n + 5) {
			display: none;
		}
	}
</style>
