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
		fetchAnalytics<{ rivals: Rival[]; names: Names; board: RivalBoard }>('rivals', params)
			.then((b) => (list = b))
			.catch((e) => (error = e.message));
	});
	$effect(() => {
		if (!selected) return void (detail = null);
		const params = { ...filter, opponent: selected };
		detail = null;
		fetchAnalytics<{ rival: Rival; names: Names; page: RivalPage }>('rival', params)
			.then((b) => (detail = b))
			.catch((e) => (error = e.message));
	});
	const nameOf = (subject: string, names: Names | undefined) =>
		names?.[subject]
			? properName(names[subject].name)
			: subject.startsWith('bot:')
				? 'Bot'
				: 'A friend';
	const phrase = (r: Rival) =>
		r.verdict === 'too-few'
			? `Only ${r.hands} hands together`
			: resultsPhrase({ ...r, verdict: r.verdict });
	function open(subject: string) {
		selected = subject;
		track('analytics_rival_opened', { kind: subject.startsWith('bot:') ? 'bot' : 'person' });
	}
	const PAGE = 8;
	let page = $state(0);
	const BADGE_ICON: Record<string, string> = {
		closest: '⚔',
		'most-played': '🂠',
		longest: '☾',
		'biggest-swing': '↕',
		'recent-challenger': '✦',
		'bot-nemesis': '🤖',
		'bot-handled-best': '🛡'
	};
	const arrow = (v: string) => (v === 'ahead' ? '▲' : v === 'behind' ? '▼' : '≈');
</script>

{#snippet face(subject: string, kind: string, names: Names | undefined, size: number)}
	{#if kind === 'bot'}<span class="bot" style:--s="{size}px" aria-hidden="true">🤖</span
		>{:else}<CharacterAvatar
			playerId={subject}
			characterId={names?.[subject]?.characterId ?? undefined}
			{size}
		/>{/if}
{/snippet}

{#if error}<p class="notice" role="alert">{error}</p>
{:else if selected}
	{#if !detail}<div class="rv" aria-busy="true"></div>
	{:else}
		{@const r = detail.rival}
		{@const pg = detail.page}
		<div class="rv one">
			<section class="vt duel" aria-label={pg.headline}>
				<button class="back" onclick={() => (selected = null)} aria-label="Everyone">←</button>
				<div class="vs">
					<CharacterAvatar size={54} />
					<span class="x" aria-hidden="true">vs</span>
					{@render face(r.subject, r.kind, detail.names, 54)}
				</div>
				<strong
					class="v-big net"
					class:v-pos={r.units > 0}
					class:v-neg={r.units < 0}
					title={pg.headline}>{signed(r.units, 0)}</strong
				>
				<span class="who-name"
					>{nameOf(r.subject, detail.names)}
					<span class="arrow" aria-hidden="true">{arrow(r.verdict)}</span></span
				>
				<div class="score" title="Showdowns: you won {r.contests.won}, they won {r.contests.lost}">
					<span><b>{r.contests.won}</b> W</span><i aria-hidden="true"
						><span
							style:width="{(r.contests.won / Math.max(1, r.contests.won + r.contests.lost)) *
								100}%"
						></span></i
					><span>L <b>{r.contests.lost}</b></span>
				</div>
				{#if pg.memory}<span
						class="memo"
						title="{pg.memory.familiarity}{pg.memory.moment ? `. ${pg.memory.moment}` : ''}"
						>🧠 {pg.memory.familiarity}</span
					>{/if}
				<span class="facts"
					><span class="v-chip">🂠 {r.hands}</span><span class="v-chip">☾ {r.nights}</span
					>{#if pg.firstMet}<span class="v-chip" title="First met">⟲ {day(pg.firstMet)}</span
						>{/if}<span class="v-chip" title="Last met">◷ {ago(r.lastMet)}</span></span
				>
			</section>
			<section class="vt trend" aria-labelledby="rt-title">
				<h2 id="rt-title"><span class="ic" aria-hidden="true">↗</span> Between you</h2>
				<div class="chart"><TrendLine points={r.cumulative} label="Boots between you" /></div>
				{#if pg.recentForm.length}
					<p class="form" aria-label="Recent hands">
						{#each pg.recentForm as h (h.handId)}<button
								class="pip"
								class:up={(h.units ?? 0) > 0}
								class:down={(h.units ?? 0) < 0}
								title={h.units !== null ? boots(h.units) : ''}
								onclick={() => onOpenHand(h.handId)}
								aria-label="Hand: {h.units !== null ? boots(h.units) : 'even'}"
							></button>{/each}
					</p>
				{/if}
			</section>
			<section class="vt games" aria-labelledby="rg-title">
				<h2 id="rg-title"><span class="ic" aria-hidden="true">♠</span> By game</h2>
				<ul class="g-list">
					{#each r.byGame ?? [] as g (g.game)}
						{@const v = g.points ?? g.units}
						<li>
							<span>{gameName(g.game)}</span><span class="h">🂠 {g.hands}</span><b
								class:v-pos={v > 0}
								class:v-neg={v < 0}>{signed(v, 0)}</b
							>
						</li>
					{/each}
				</ul>
				<span class="swings">
					{#if r.biggestWin}{@const win = r.biggestWin}<button
							class="v-chip v-press"
							onclick={() => onOpenHand(win.handId)}
							title="Biggest swing your way">▲ {signed(win.units, 0)}</button
						>{/if}
					{#if r.biggestLoss}{@const loss = r.biggestLoss}<button
							class="v-chip v-press"
							onclick={() => onOpenHand(loss.handId)}
							title="Biggest swing their way">▼ {signed(loss.units, 0)}</button
						>{/if}
				</span>
			</section>
			<section class="vt nights" aria-labelledby="rn-title">
				<h2 id="rn-title"><span class="ic" aria-hidden="true">☾</span> Nights together</h2>
				<ul class="n-list">
					{#each [...r.recentNights].reverse().slice(0, 6) as n (n.nightId)}
						<li title="{day(n.at)} · {n.hands} hands">
							<span>{day(n.at)}</span><b class:v-pos={n.units > 0} class:v-neg={n.units < 0}
								>{signed(n.units, 0)}</b
							>
						</li>
					{/each}
				</ul>
				{#if pg.largestPots.length}<span class="moments"
						>{#each pg.largestPots.slice(0, 3) as p (p.handId)}<button
								class="v-chip v-press"
								onclick={() => onOpenHand(p.handId)}
								title="Largest pot together, {day(p.at)}: {p.potUnits} boots"
								>💰 {p.potUnits}</button
							>{/each}</span
					>{/if}
				{#if pg.moments.length}<span class="moments"
						>{#each pg.moments.slice(0, 4) as m (m.handId + m.at)}<button
								class="v-chip v-press"
								onclick={() => onOpenHand(m.handId)}
								title="{day(m.at)}: {m.hand ?? 'showed their hand'}">👁 {m.hand ?? day(m.at)}</button
							>{/each}</span
					>{/if}
			</section>
		</div>
	{/if}
{:else if !list}<div class="rv" aria-busy="true"></div>
{:else if !list.rivals.length}<div class="v-zero">
		<span aria-hidden="true">⚔</span><strong>0 rivals</strong>
	</div>
{:else}
	{@const titles = [
		list.board.closest,
		list.board.mostPlayed,
		list.board.longest,
		list.board.biggestSwing,
		list.board.recentChallenger,
		list.board.botNemesis,
		list.board.botHandledBest
	].filter((t) => t !== null)}
	{@const pages = Math.ceil(list.rivals.length / PAGE)}
	<div class="rv">
		{#if titles.length}
			<ul class="titles">
				{#each titles.slice(0, 4) as t (t.id)}
					<li>
						<button class="vt v-press title" onclick={() => open(t.subject)} title={t.headline}>
							<span class="t-ic" aria-hidden="true">{BADGE_ICON[t.id] ?? '♛'}</span>
							<span class="t-label">{t.label}</span>
							<strong>{nameOf(t.subject, list.names)}</strong>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
		<ul class="cards">
			{#each list.rivals.slice(page * PAGE, (page + 1) * PAGE) as r (r.subject)}
				<li>
					<button
						class="vt v-press card"
						onclick={() => open(r.subject)}
						aria-label="{nameOf(r.subject, list.names)}: {phrase(r)}"
						title={phrase(r)}
					>
						{@render face(r.subject, r.kind, list.names, 46)}
						<strong class="nm">{nameOf(r.subject, list.names)}</strong>
						<b class="v-big amt" class:v-pos={r.units > 0} class:v-neg={r.units < 0}
							>{signed(r.units, 0)}</b
						>
						<span class="meta"><span aria-hidden="true">{arrow(r.verdict)}</span> 🂠 {r.hands}</span>
					</button>
				</li>
			{/each}
		</ul>
		{#if pages > 1}
			<div class="pager">
				<button disabled={page === 0} onclick={() => page--} aria-label="Previous">←</button><span
					>{page + 1} / {pages}</span
				><button disabled={page + 1 >= pages} onclick={() => page++} aria-label="Next">→</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.rv {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.titles {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}
	.title {
		width: 100%;
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-rows: auto auto;
		column-gap: 10px;
		align-items: center;
		text-align: left;
		padding: 10px 14px;
	}
	.t-ic {
		grid-row: span 2;
		font-size: 20px;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: #f2dc911a;
	}
	.t-label {
		font-size: 11px;
		color: var(--muted);
	}
	.title strong {
		font-family: var(--font-display);
		font-size: 16px;
	}
	.cards {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		grid-auto-rows: minmax(0, 280px);
		align-content: center;
		gap: 12px;
	}
	.cards li {
		min-height: 0;
		display: flex;
	}
	.card {
		width: 100%;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.bot {
		display: grid;
		place-items: center;
		width: var(--s);
		height: var(--s);
		border-radius: 50%;
		background: #ffffff10;
		font-size: calc(var(--s) * 0.55);
	}
	.nm {
		font-size: 14px;
	}
	.amt {
		font-size: clamp(26px, 3vw, 40px);
	}
	.meta {
		font-size: 12px;
		color: var(--muted);
	}
	.pager {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 14px;
		font-size: 13px;
		color: var(--muted);
	}
	.pager button {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: #ffffff10;
		color: var(--paper);
		cursor: pointer;
	}
	.pager button:disabled {
		opacity: 0.3;
	}
	/* One rival */
	.rv.one {
		display: grid;
		grid-template-columns: 1fr 1.6fr;
		grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr);
		grid-template-areas:
			'duel trend'
			'games nights';
	}
	.duel {
		grid-area: duel;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.back {
		position: absolute;
		top: 10px;
		left: 12px;
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: #ffffff10;
		cursor: pointer;
	}
	.back:hover,
	.back:focus-visible {
		background: var(--butter);
		color: var(--night);
	}
	.vs {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.x {
		font-family: var(--font-display);
		font-weight: 800;
		color: var(--butter);
	}
	.net {
		font-size: clamp(36px, 4.4vw, 64px);
	}
	.who-name {
		font-weight: 700;
	}
	.score {
		display: flex;
		align-items: center;
		gap: 8px;
		width: min(100%, 260px);
		font-size: 12px;
		color: var(--muted);
	}
	.score b {
		color: var(--paper);
		font-size: 15px;
	}
	.score i {
		flex: 1;
		height: 8px;
		border-radius: 4px;
		background: #ee715b88;
		overflow: hidden;
	}
	.score i span {
		display: block;
		height: 100%;
		background: #a9cfb5;
	}
	.memo {
		max-width: 100%;
		font-size: 11px;
		color: var(--muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 6px;
	}
	.trend {
		grid-area: trend;
	}
	.chart {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
	}
	.chart > :global(*) {
		width: 100%;
	}
	.form {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.pip {
		width: 14px;
		height: 14px;
		border-radius: 4px;
		background: #ffffff20;
		cursor: pointer;
	}
	.pip.up {
		background: #a9cfb5;
	}
	.pip.down {
		background: #ee715b;
	}
	.games {
		grid-area: games;
	}
	.nights {
		grid-area: nights;
	}
	.g-list,
	.n-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
	}
	.g-list li {
		display: grid;
		grid-template-columns: 1fr auto 60px;
		gap: 10px;
	}
	.g-list .h {
		color: var(--muted);
	}
	.g-list b,
	.n-list b {
		text-align: right;
		font-family: var(--font-display);
	}
	.n-list {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
	}
	.n-list li {
		display: flex;
		flex-direction: column;
		padding: 6px 8px;
		border-radius: 10px;
		background: #ffffff07;
		font-size: 11px;
		color: var(--muted);
	}
	.n-list b {
		text-align: left;
		font-size: 16px;
	}
	.swings,
	.moments {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: auto;
	}
	@media (max-width: 1000px) {
		.titles {
			grid-template-columns: repeat(2, 1fr);
		}
		.cards {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (max-width: 720px) {
		.rv {
			gap: 8px;
		}
		.titles {
			gap: 8px;
		}
		.title {
			padding: 6px 10px;
		}
		.t-ic {
			width: 28px;
			height: 28px;
			font-size: 14px;
		}
		.title strong {
			font-size: 13px;
		}
		.cards {
			grid-template-columns: repeat(2, 1fr);
			gap: 8px;
		}
		.rv.one {
			grid-template-columns: 1fr;
			grid-template-rows: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 0.8fr);
			grid-template-areas: 'duel' 'trend' 'nights';
		}
		.games {
			display: none;
		}
	}
</style>
