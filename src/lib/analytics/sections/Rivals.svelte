<script lang="ts">
	/** You against each person (or bot) you have sat with: results only, in honest words. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { ago, boots, day, gameName, resultsPhrase, signed } from '../format.js';
	import { properName } from '#lib/names.js';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import TrendLine from '../charts/TrendLine.svelte';
	import { track } from '#lib/analytics.js';
	import type { Names, Rival, RivalBoard, RivalPage } from '../types.js';

	let { filter, onOpenHand }: { filter: Filter; onOpenHand: (id: string) => void } = $props();
	let list = $state<{ rivals: Rival[]; names: Names; board: RivalBoard } | null>(null);
	let detail = $state<{ rival: Rival; names: Names; page: RivalPage } | null>(null);
	let selected = $state<string | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { ...filter };
		list = null;
		fetchAnalytics<{ rivals: Rival[]; names: Names; board: RivalBoard }>('rivals', params).then((b) => (list = b)).catch((e) => (error = e.message));
	});
	$effect(() => {
		if (!selected) return void (detail = null);
		const params = { ...filter, opponent: selected };
		detail = null;
		fetchAnalytics<{ rival: Rival; names: Names; page: RivalPage }>('rival', params).then((b) => (detail = b)).catch((e) => (error = e.message));
	});
	const nameOf = (subject: string, names: Names | undefined) =>
		names?.[subject] ? properName(names[subject].name) : subject.startsWith('bot:') ? 'Bot' : 'A friend';
	const phrase = (r: Rival) => (r.verdict === 'too-few' ? `Only ${r.hands} hands together` : resultsPhrase({ ...r, verdict: r.verdict }));
	function open(subject: string) {
		selected = subject;
		track('analytics_rival_opened', { kind: subject.startsWith('bot:') ? 'bot' : 'person' });
	}
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if selected}
	<button class="link back" onclick={() => (selected = null)}>← Everyone</button>
	{#if !detail}<p class="muted">Loading your rivalry…</p>
	{:else}
		{@const r = detail.rival}
		{@const pg = detail.page}
		<section class="panel headline">
			<p class="eyebrow">You against {nameOf(r.subject, detail.names)} · {r.hands} hands · {r.nights} nights{#if pg.firstMet} · since {day(pg.firstMet)}{/if} · last met {ago(r.lastMet)}</p>
			<h2 class:up={r.verdict === 'ahead'} class:down={r.verdict === 'behind'}>{pg.headline}</h2>
			{#if pg.memory}<p class="private-note">{pg.memory.familiarity}{pg.memory.moment ? `. ${pg.memory.moment}` : ''}</p>{/if}
			<p class="muted small">
				{boots(r.units)} between you{#if r.points}, {signed(r.points, 0)} Rummy points{/if}. Showdowns: you won {r.contests.won}, they won {r.contests.lost}{#if r.contests.split}, {r.contests.split} split{/if}.
				Wins against each fair share: you {r.fair.you ?? '–'}×, them {r.fair.them ?? '–'}×.
			</p>
			<TrendLine points={r.cumulative} label="Boots between you" />
		</section>
		{#if pg.largestPots.length || pg.moments.length || pg.recentForm.length}
			<section class="panel two">
				<div>
					<h2>Recent form</h2>
					<p class="form">{#each pg.recentForm as h (h.handId)}<button class="pip" class:up={(h.units ?? 0) > 0} class:down={(h.units ?? 0) < 0} title={h.units !== null ? boots(h.units) : ''} onclick={() => onOpenHand(h.handId)}>{(h.units ?? 0) > 0 ? '+' : (h.units ?? 0) < 0 ? '−' : '·'}</button>{/each}</p>
					{#if pg.largestPots.length}<h3>Largest pots together</h3>
						<ul class="plain">{#each pg.largestPots as p (p.handId)}<li><span>{day(p.at)}</span><span class="muted">{p.potUnits} boots</span><button class="link" onclick={() => onOpenHand(p.handId)}>Open</button></li>{/each}</ul>{/if}
				</div>
				<div>
					<h2>Moments</h2>
					{#if pg.moments.length}<ul class="plain">{#each pg.moments as m (m.handId + m.at)}<li><span>{day(m.at)}</span><span class="muted">{m.hand ?? 'Showed their hand'}</span><button class="link" onclick={() => onOpenHand(m.handId)}>Open</button></li>{/each}</ul>
					{:else}<p class="muted small">Hands they showed while you were watching appear here.</p>{/if}
				</div>
			</section>
		{/if}
		<section class="panel two">
			<div>
				<h2>By game</h2>
				<table class="data-table"><thead><tr><th>Game</th><th>Hands</th><th>Between you</th></tr></thead><tbody>
					{#each r.byGame as g (g.game)}<tr><td>{gameName(g.game)}</td><td>{g.hands}</td><td>{g.points !== null ? `${signed(g.points, 0)} points` : boots(g.units)}</td></tr>{/each}
				</tbody></table>
				{#if r.biggestWin}{@const win = r.biggestWin}<p class="small">Biggest swing your way: <button class="link" onclick={() => onOpenHand(win.handId)}>{boots(r.biggestWin.units)}</button></p>{/if}
				{#if r.biggestLoss}{@const loss = r.biggestLoss}<p class="small">Biggest swing their way: <button class="link" onclick={() => onOpenHand(loss.handId)}>{boots(r.biggestLoss.units)}</button></p>{/if}
			</div>
			<div>
				<h2>Recent nights together</h2>
				<ul class="plain">
					{#each [...r.recentNights].reverse() as n (n.nightId)}<li><span>{day(n.at)}</span><span class="muted">{n.hands} hands</span><strong class:up={n.units > 0} class:down={n.units < 0}>{boots(n.units)}</strong></li>{/each}
				</ul>
			</div>
		</section>
	{/if}
{:else if !list}<p class="muted">Finding your rivals…</p>
{:else if !list.rivals.length}<p class="muted">Nobody yet. When you share a table, your first rivalry starts here.</p>
{:else}
	{@const titles = [list.board.closest, list.board.mostPlayed, list.board.longest, list.board.biggestSwing, list.board.recentChallenger, list.board.botNemesis, list.board.botHandledBest].filter((t) => t !== null)}
	{#if titles.length}
		<section class="panel">
			<h2>Your rivalries</h2>
			<ul class="titles">
				{#each titles as t (t.id)}
					<li><button onclick={() => open(t.subject)}><span class="eyebrow">{t.label}</span><strong>{t.headline}</strong><small class="muted">{t.facts.join(' · ')}</small></button></li>
				{/each}
			</ul>
		</section>
	{:else if list.board.note}<p class="muted small">{list.board.note}</p>{/if}
	<section class="panel">
		<h2>Everyone you have played</h2>
		<p class="muted small">Between you two only: chips that went from one of you to the other. Wording stays modest until there are enough hands.</p>
		<ul class="rival-list">
			{#each list.rivals as r (r.subject)}
				<li>
					<button onclick={() => open(r.subject)}>
						{#if r.kind === 'bot'}<span class="bot-badge" aria-hidden="true">🤖</span>{:else}<CharacterAvatar playerId={r.subject} characterId={list.names[r.subject]?.characterId ?? undefined} size={36} />{/if}
						<span class="who"><strong>{nameOf(r.subject, list.names)}</strong><small>{r.hands} hands · {r.nights} nights · {Object.keys(r.games).map(gameName).join(', ')}</small></span>
						<span class="phrase" class:up={r.verdict === 'ahead'} class:down={r.verdict === 'behind'}>{phrase(r)}</span>
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.titles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.titles button {
		display: grid;
		gap: 0.2rem;
		width: 100%;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.8rem 0.9rem;
		text-align: left;
	}
	.titles strong {
		font-weight: 600;
		line-height: 1.35;
	}
	.form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.pip {
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: rgb(255 255 255 / 6%);
		font-size: 0.85rem;
	}
</style>
