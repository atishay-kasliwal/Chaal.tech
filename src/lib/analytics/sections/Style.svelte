<script lang="ts">
	/** How you play: rates per real chance, beside the club, and how they shift by situation. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { percent } from '../format.js';
	import { properName } from '#lib/names.js';
	import ShareBars from '../charts/ShareBars.svelte';
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
		fetchAnalytics<PatternsView>('patterns', params).then((b) => (data = b)).catch((e) => (error = e.message));
	});
	const MIN = 20;
	const rate = (x: Count) => (x.n ? x.k / x.n : null);
	const bar = (key: string, label: string, x: Count, club: number | null) => ({
		key,
		label,
		value: rate(x),
		expected: club,
		text: x.n ? percent(rate(x)) : '–',
		detail: `${x.k} of ${x.n} chances${club !== null ? ` · club ${percent(club)}` : ''}`,
		dim: x.n < MIN
	});
	const VERB: Record<string, string> = { raise: 'raise', fold: 'pack/fold' };
	/** One row per situation (or person): raise and pack side by side, biggest shifts first. */
	function group(list: Contrast[], key: (s: Contrast) => string): Row[] {
		const rows: Record<string, Row> = {};
		for (const s of list.filter((x) => x.evidence !== 'insufficient')) {
			const k = key(s);
			const row: Row = rows[k] ?? { key: k, label: s.label, opponent: s.opponent ?? null, raise: null, fold: null };
			if (s.action === 'raise' || s.action === 'fold') row[s.action] = s;
			rows[k] = row;
		}
		const shift = (r: Row) => Math.max(Math.abs(r.raise?.diff ?? 0), Math.abs(r.fold?.diff ?? 0));
		return Object.values(rows).sort((a, b) => Number(!!(b.raise?.significant || b.fold?.significant)) - Number(!!(a.raise?.significant || a.fold?.significant)) || shift(b) - shift(a));
	}
	const situations = $derived(group((data?.situations ?? []).filter((s) => !s.opponent), (s) => s.segment));
	const opponents = $derived(group((data?.situations ?? []).filter((s) => s.opponent), (s) => s.opponent ?? ''));
	let showAll = $state(false);
	const who = (s: string) => (data?.names?.[s] ? properName(data.names[s].name) : s.startsWith('bot:') ? 'a bot' : 'a friend');
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Reading your decisions…</p>
{:else if !data.core.decisions}<p class="muted">No recorded decisions yet.</p>
{:else}
	<section class="panel">
		<h2>Your play, decision by decision</h2>
		<p class="muted small">
			Each rate counts only the turns where that move was possible: a pack only when packing was allowed.
			Timeouts and automatic moves are not counted as choices. The white tick is the club.
		</p>
		<ShareBars
			max={1}
			expectedLabel="club"
			bars={[
				bar('raise', 'Raise', data.core.raise, data.club.raise),
				bar('call', 'Call / chaal', data.core.call, data.club.call),
				bar('fold', 'Pack / fold', data.core.fold, data.club.fold),
				bar('show', 'Ask for a Show', data.core.show, data.club.show),
				bar('timeout', 'Let the timer run out', data.core.timeout, data.club.timeout)
			]}
		/>
		{#if data.core.disconnectedTimeouts}<p class="muted small">{data.core.disconnectedTimeouts} timeouts happened while you were disconnected; those are not about your play.</p>{/if}
	</section>

	{#if data.core.teenPatti.seeFirst.n}
		<section class="panel chips">
			<div><h3>Blind bets a hand</h3><p class="big">{data.core.teenPatti.blindDecisionsPerHand ?? '–'}</p><p class="muted small">before you look</p></div>
			<div><h3>Look straight away</h3><p class="big">{percent(rate(data.core.teenPatti.seeFirst))}</p><p class="muted small">of {data.core.teenPatti.seeFirst.n} hands</p></div>
			<div><h3>Raise while blind</h3><p class="big">{percent(rate(data.core.teenPatti.blindRaise))}</p><p class="muted small">seen: {percent(rate(data.core.teenPatti.seenRaise))}</p></div>
			<div><h3>Shows you won</h3><p class="big">{data.core.teenPatti.showWon.n ? `${data.core.teenPatti.showWon.k} of ${data.core.teenPatti.showWon.n}` : '–'}</p><p class="muted small">when you asked</p></div>
		</section>
	{/if}
	{#if data.core.holdem.aggressionFactor !== null}
		<section class="panel chips">
			<div><h3>Hold’em aggression</h3><p class="big">{data.core.holdem.aggressionFactor}</p><p class="muted small">raises for every call</p></div>
			<div><h3>Typical raise</h3><p class="big">{data.core.holdem.betToPot === null ? '–' : `${Math.round(data.core.holdem.betToPot * 10) / 10}× the pot`}</p><p class="muted small">middle of your raises</p></div>
		</section>
	{/if}

	{#snippet cell(c: Contrast | null, verb: string)}
		{#if c}
			<span class="pair" class:shifted={c.significant}>
				<small>{verb}</small><strong>{percent(c.rate)}</strong> <span class="muted">usually {percent(c.baseline.rate)}</span>
			</span>
		{:else}<span class="muted small">–</span>{/if}
	{/snippet}

	<section class="panel">
		<h2>When things change</h2>
		<p class="muted small">
			Your play in each situation against your usual. A gold mark means the shift survives a check
			for luck across every comparison on this page; without it, treat it as noise.
		</p>
		<ul class="situations">
			{#each showAll ? situations : situations.slice(0, 6) as row (row.key)}
				<li>
					<span>{row.label}<small>{Math.max(row.raise?.n ?? 0, row.fold?.n ?? 0)} chances</small></span>
					{@render cell(row.raise, 'raise')}
					{@render cell(row.fold, 'pack')}
					<span class="mark" class:lean={row.raise?.significant || row.fold?.significant} title={row.raise?.significant || row.fold?.significant ? 'Survives the luck check' : 'Within normal variation'}>{row.raise?.significant || row.fold?.significant ? '●' : '○'}</span>
				</li>
			{:else}
				<li class="muted">Not enough decisions in any one situation yet.</li>
			{/each}
		</ul>
		{#if situations.length > 6}<button class="link" onclick={() => (showAll = !showAll)}>{showAll ? 'Show fewer' : `Show all ${situations.length}`}</button>{/if}
	</section>

	{#if opponents.length}
		<section class="panel">
			<h2>With particular people in the hand</h2>
			<p class="muted small">How your own play shifts when someone is in the hand. Built from what happened at the table, never from anyone’s hidden cards.</p>
			<ul class="situations">
				{#each opponents as row (row.key)}
					<li>
						<span>{who(row.opponent ?? '')}<small>{Math.max(row.raise?.n ?? 0, row.fold?.n ?? 0)} chances</small></span>
						{@render cell(row.raise, 'raise')}
						{@render cell(row.fold, 'pack')}
						<span class="mark" class:lean={row.raise?.significant || row.fold?.significant}>{row.raise?.significant || row.fold?.significant ? '●' : '○'}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if data.styleChange.some((s) => s.evidence !== 'insufficient')}
		<section class="panel">
			<h2>Is your style changing?</h2>
			<ul class="situations">
				{#each data.styleChange.filter((s) => s.evidence !== 'insufficient') as s (s.action)}
					<li>
						<span>Last 30 days<small>{VERB[s.action] ?? s.action}</small></span>
						<span class="pair"><strong>{percent(s.rate)}</strong> <span class="muted">before {percent(s.baseline.rate)}</span></span>
						<span class="muted small">{s.n} chances</span>
						<span class="mark" class:lean={s.p < 0.01}>{s.p < 0.01 ? '●' : '○'}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
{/if}
