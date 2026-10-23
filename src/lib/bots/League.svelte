<script lang="ts">
	import { club } from '#lib/club/club.svelte.js';
	import { CAST } from './cast.js';
	import BotPortrait from './BotPortrait.svelte';
	import type { ClubBot } from './types.js';
	import type { LeagueReport } from './league-types.js';
	import snapshot from '../../../shared/league-results.json';
	import {
		Trophy,
		ArrowUpRight,
		ArrowRight,
		ChevronDown,
		RefreshCw,
		Clock3,
		Check,
		Info
	} from '@lucide/svelte';
	let { preview = false }: { preview?: boolean } = $props();
	let reports = $state<LeagueReport[]>(snapshot.reports as LeagueReport[]);
	let bots = $state<ClubBot[]>([]);
	let selectedRun = $state('');
	let selectedBot = $state('ms-dhoni');
	let rival = $state('virat-kohli');
	let loaded = $state(false);
	let error = $state('');
	let retry = $state(0);
	let methodOpen = $state(false);
	const accents: Record<string, string> = {
		'rohit-sharma': '#8ab0ed',
		'virat-kohli': '#ed8a72',
		gg: '#b3c7a3',
		'samay-raina': '#c0a2e1',
		'ms-dhoni': '#edc76c'
	};
	const descriptions: Record<string, string> = {
		'rohit-sharma': 'The blind bet. The big swing. Rohit backs himself before he backs the cards.',
		'virat-kohli':
			'He raises the temperature, then raises again. Never mistake a quiet hand for surrender.',
		gg: 'Patient enough to wait. Stubborn enough to stay. Every chip has to earn its place.',
		'samay-raina': 'One more call. One more card. Curiosity always gets a seat at his table.',
		'ms-dhoni': 'A little patience, a little pressure. The calmest face at a very noisy table.'
	};
	const run = $derived(reports.find((r) => r.id === selectedRun) ?? reports[0]);
	const latest = $derived(!run || run.id === reports[0]?.id);
	const champion = $derived(CAST.find((c) => c.id === run?.winner));
	const leader = $derived(CAST.find((c) => c.id === run?.leader));
	const lineup = $derived(
		run ? run.standings.map((s) => CAST.find((c) => c.id === s.id)!).filter(Boolean) : [...CAST]
	);
	const selected = $derived(CAST.find((c) => c.id === selectedBot)!);
	const profile = $derived(bots.find((b) => b.botId === selectedBot || b.slug === selectedBot));
	const record = $derived(run?.standings.find((s) => s.id === selectedBot));
	const past = $derived(reports[reports.findIndex((r) => r.id === run?.id) + 1]);
	const gap = $derived(run?.gaps[selectedBot]?.[rival]);
	const dailyReports = $derived(reports.filter((r) => r.kind === 'daily'));
	const totals = $derived({
		hands: reports.reduce((n, r) => n + r.hands, 0),
		titles: dailyReports.filter((r) => r.winner).length
	});
	const fmt = (n: number, digits = 0) =>
		n.toLocaleString('en-US', { maximumFractionDigits: digits });
	const signed = (n: number, digits = 0) =>
		`${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n), digits)}`;
	const short = (n: number) =>
		n >= 1_000_000 ? `${fmt(n / 1_000_000, 2)}M` : n >= 1000 ? `${fmt(n / 1000, 1)}K` : fmt(n);
	const date = (value: string) =>
		new Intl.DateTimeFormat('en-US', {
			month: 'short',
			day: 'numeric',
			timeZone: 'America/New_York'
		}).format(new Date(value));
	const fullDate = (value: string) =>
		new Intl.DateTimeFormat('en-US', {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'America/New_York'
		}).format(new Date(value));
	const titles = (id: string) => dailyReports.filter((r) => r.winner === id).length;
	const career = (id: string) =>
		reports.reduce((n, r) => n + (r.standings.find((s) => s.id === id)?.hands ?? 0), 0);
	const movement = (id: string, index: number) => {
		const before = past?.standings.findIndex((s) => s.id === id);
		return before === undefined || before < 0 ? null : before - index;
	};
	function pickBot(id: string) {
		selectedBot = id;
		if (rival === id) rival = CAST.find((c) => c.id !== id)!.id;
	}
	function chooseRun(id: string) {
		selectedRun = id;
	}
	$effect(() => {
		if (preview) {
			loaded = true;
			return;
		}
		const token = club.token;
		void retry;
		if (!club.member || !token) return;
		let cancelled = false;
		loaded = false;
		error = '';
		void Promise.all([club.request('/bots/league'), club.request('/bots')])
			.then(([history, directory]) => {
				if (cancelled) return;
				if (!history.response.ok)
					throw new Error(history.body.error ?? 'The league could not be refreshed.');
				reports = history.body.reports;
				if (directory.response.ok) bots = directory.body.bots;
			})
			.catch((e) => {
				if (!cancelled) error = e.message;
			})
			.finally(() => {
				if (!cancelled) loaded = true;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head
	><title>The Chaal League · Five personalities. One table.</title><meta
		name="description"
		content="Follow Chaal’s five bot characters through daily Teen Patti championships, real simulation results, rivalries and the work behind their game."
	/></svelte:head
>

<div class="league" data-testid="chaal-league">
	<div class="league-inner">
		<div class="edition">
			<span><span class="edition-dot"></span> The club’s daily championship</span><span
				>Teen Patti / Classic <span class="edition-year">/ Est. 2026</span></span
			>
		</div>
		<header class="masthead">
			<h1>THE CHAAL <span>LEAGUE<span class="title-period">.</span></span></h1>
			<div class="masthead-note">
				<span class="tiny-suit" aria-hidden="true">♠</span>
				<p>Five personalities.<br />One table.<br /><strong>No easy opponents.</strong></p>
			</div>
		</header>
		<nav class="section-nav" aria-label="League sections">
			<a href="#championship">The table <ArrowRight size={14} /></a><a href="#standings"
				>Standings</a
			><a href="#players">The players</a><a href="#rivalries">Rivalries</a><a href="#history"
				>Trophy room</a
			><a href="#workshop">The workshop</a>
		</nav>
		{#if error}<div class="load-notice" role="alert">
				<span>{error} {reports.length ? 'Showing the last available results.' : ''}</span><button
					onclick={() => retry++}><RefreshCw size={14} /> Retry</button
				>
			</div>{/if}
		<section
			class="championship"
			id="championship"
			aria-labelledby="championship-title"
			aria-busy={!loaded}
		>
			<div class="match-heading">
				<span class="match-label"
					>{run
						? `${run.kind === 'daily' ? 'Daily championship' : run.kind === 'benchmark' ? 'Benchmark' : 'Exhibition'} · ${date(run.completedAt)}`
						: 'The inaugural championship'}</span
				><span class="match-status"
					>{#if run}<Check size={13} /> Final result{:else}{loaded
							? 'Awaiting first result'
							: 'Opening the league…'}{/if}</span
				>
			</div>
			<div class="headline">
				<div>
					<p class="overline">
						{!latest
							? 'From the trophy room'
							: run?.winner
								? 'The table has spoken'
								: run
									? 'Every chip counts'
									: 'A seat for every ego'}
					</p>
					<h2 id="championship-title">
						{champion
							? `${champion.name} takes`
							: leader
								? `${leader.name} leads.`
								: 'Good cards.'}<br /><span
							>{champion ? 'the table.' : leader ? 'Too close to crown.' : 'Better rivals.'}</span
						>
					</h2>
					<p class="headline-deck">
						{run
							? run.winner
								? `${short(run.hands)} shared hands. Five familiar faces. One result earned at the table.`
								: `${short(run.hands)} shared hands. ${leader?.name} finishes ahead, but the margin is too close for a title.`
							: 'They bluff. They remember. They take it personally. Meet the five characters playing for the morning trophy.'}
					</p>
				</div>
				<div class="schedule">
					<Clock3 size={17} />
					<div>
						<strong>Back at 7:00 AM</strong><span>New York time · every day</span><small
							>Last completed result shown below</small
						>
					</div>
				</div>
			</div>
			<div class="arena" aria-label="The five league competitors">
				<div class="arena-light"></div>
				<div class="table-oval">
					<div class="table-mark">
						<span>CHAAL</span><small>ONE TABLE. FIVE WAYS TO PLAY.</small><span
							class="table-suits"
							aria-hidden="true">♠ ♥ ♣ ♦</span
						>
					</div>
				</div>
				{#each lineup as c, i (c.id)}
					<button
						class="competitor spot-{i}"
						class:crowned={run?.winner === c.id}
						class:chosen={selectedBot === c.id}
						style:--player-accent={accents[c.id]}
						onclick={() => pickBot(c.id)}
						aria-pressed={selectedBot === c.id}
					>
						{#if run?.winner === c.id}<span class="winner-badge"><Trophy size={15} /> Champion</span
							>{/if}
						<span class="competitor-portrait" aria-hidden="true"
							><BotPortrait mascotId={`bot-${c.id}`} name={c.name} size={270} /></span
						><span class="nameplate"
							><span>{c.name}</span><small>{run ? `${i + 1} / 5` : c.tagline}</small></span
						>
					</button>
				{/each}
				<div class="table-caption">
					<span class="table-caption-line"></span><span
						>{run
							? 'Real engine. Simulated chips. Nothing staged.'
							: 'The same personalities you meet at your table.'}</span
					><span class="table-caption-line"></span>
				</div>
			</div>
			<div class="match-strip">
				<div>
					<span>Shared table hands</span><strong>{run ? fmt(run.hands) : 'Pending'}</strong>
				</div>
				<div>
					<span>Hands per character</span><strong>{run ? fmt(run.hands) : 'Pending'}</strong>
				</div>
				<div><span>Seat rotations</span><strong>{run ? 'All five' : '5 planned'}</strong></div>
				<div>
					<span>Competition time</span><strong
						>{run ? `${fmt(run.durationSeconds / 60, 1)} min` : 'Not yet recorded'}</strong
					>
				</div>
			</div>
		</section>
		<section id="standings" class="standings-section" aria-labelledby="standings-title">
			<div class="section-heading">
				<div>
					<p class="overline">The score settles it</p>
					<h2 id="standings-title">Chips talk.</h2>
				</div>
				<div class="section-aside">
					<span>{run ? fullDate(run.completedAt) : 'First result coming soon'}</span><button
						class="text-button"
						onclick={() => (methodOpen = !methodOpen)}
						aria-expanded={methodOpen}
						aria-controls="league-method"
						><Info size={14} /> How we score <ChevronDown size={14} /></button
					>
				</div>
			</div>
			{#if methodOpen}<div id="league-method" class="method">
					<strong>The fairest table we can deal.</strong>
					<p>
						Each 100-hand deck block is replayed through all five seat positions. Every character
						starts with 100 starting bets. Rebuys keep them playing and never count as winnings. Net
						profit decides rank; hand wins are a supporting statistic.
					</p>
					<p>
						A trophy is awarded only when the leader’s paired 95% margin stays above zero against
						every rival. Otherwise we show the leader and keep the trophy unclaimed. These are
						simulated chips, with one starting bet as the unit. Each table starts with fresh session
						memory; club-player memories are never used.
					</p>
				</div>{/if}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll wide standings.) -->
			<div class="scoreboard" role="region" aria-label="Championship standings" tabindex="0">
				<table>
					<thead
						><tr
							><th scope="col">Rank</th><th scope="col">Player</th><th scope="col"
								>Net profit <small>starting bets</small></th
							><th scope="col">Per 100 hands <small>± 95% interval</small></th><th scope="col"
								>Hands won</th
							><th scope="col">Move</th></tr
						></thead
					><tbody>
						{#each run?.standings ?? [] as s, i (s.id)}{@const move = movement(s.id, i)}<tr
								class:selected-row={selectedBot === s.id}
								><td class="rank">{String(i + 1).padStart(2, '0')}</td><th scope="row"
									><button class="player-link" onclick={() => pickBot(s.id)}
										><span class="player-dot" style:background={accents[s.id]}
										></span>{s.name}{#if run?.winner === s.id}<Trophy size={16} />{/if}</button
									></th
								><td class:negative={s.net < 0} class="score">{signed(s.net)}</td><td class="rate"
									>{signed(s.profit100, 1)} <span>± {fmt(s.interval95, 1)}</span></td
								><td
									>{fmt(s.wins)}
									<span class="win-share">/ {fmt((s.wins / s.hands) * 100, 1)}%</span></td
								><td class="movement"
									>{move === null
										? 'First run'
										: move === 0
											? '·'
											: move > 0
												? `↑ ${move}`
												: `↓ ${Math.abs(move)}`}</td
								></tr
							>{/each}
					</tbody>
				</table>
				{#if !run}<div class="empty-state">
						<Trophy size={25} />
						<p>The first trophy is still on the table.</p>
						<span>Results appear after the first championship finishes.</span>
					</div>{/if}
			</div>
			<div class="scoreboard-foot">
				<span>Profit beats pot count. Small wins can hide big losses.</span><span
					>{run
						? `${fmt(run.blocks)} independent deck blocks · 5 rotations each`
						: 'Classic Teen Patti · equal starting stacks'}</span
				>
			</div>
		</section>
		<section id="players" class="players-section" aria-labelledby="players-title">
			<div class="section-heading">
				<div>
					<p class="overline">A familiar kind of trouble</p>
					<h2 id="players-title">Pick your rival.</h2>
				</div>
				<p class="section-copy">Same rules.<br />Very different ideas about winning.</p>
			</div>
			<div class="player-tabs" role="group" aria-label="Select a character">
				{#each CAST as c (c.id)}<button
						class:active={selectedBot === c.id}
						style:--player-accent={accents[c.id]}
						onclick={() => pickBot(c.id)}
						aria-pressed={selectedBot === c.id}
						><span>{c.name}</span><span class="tab-tagline">{c.tagline}</span><ArrowUpRight
							size={17}
						/></button
					>{/each}
			</div>
			<div class="player-dossier" style:--player-accent={accents[selectedBot]}>
				<div class="dossier-art">
					<span class="dossier-number">0{CAST.findIndex((c) => c.id === selectedBot) + 1}</span
					><BotPortrait mascotId={`bot-${selectedBot}`} name={selected.name} size={410} /><span
						class="dossier-signature">{selected.name}.</span
					>
				</div>
				<div class="dossier-copy">
					<p class="overline">{selected.tagline}</p>
					<h3>{selected.name}<span>.</span></h3>
					<p class="player-description">{profile?.description ?? descriptions[selectedBot]}</p>
					<dl class="player-stats">
						<div>
							<dt>League hands</dt>
							<dd>{short(career(selectedBot))}</dd>
						</div>
						<div>
							<dt>Daily titles <small>last 90 runs</small></dt>
							<dd>{titles(selectedBot)}</dd>
						</div>
						<div>
							<dt>This competition</dt>
							<dd class:negative={(record?.net ?? 0) < 0}>
								{record ? signed(record.net) : 'Pending'}
							</dd>
						</div>
					</dl>
					<div class="style-tags">
						<span>{record?.style ?? profile?.style?.styleId ?? 'Canonical character'}</span><span
							>Teen Patti · Classic</span
						>
					</div>
					<div class="dossier-actions">
						{#if preview || profile?.available}<a
								class="primary-button"
								href={`/create-room?bot=${encodeURIComponent(selectedBot)}`}
								>Take on {selected.name}<ArrowUpRight size={18} /></a
							>{:else}<span class="availability"
								>{bots.length
									? 'Sitting out of new tables'
									: 'Sign in to see table availability'}</span
							>{/if}<span>Keep the personality.<br />Earn the improvement.</span>
					</div>
					{#if profile?.record?.hands}<p class="personal-record">
							At your tables: {fmt(profile.record.hands)} recorded hands together. League simulations
							are counted separately.
						</p>{/if}
				</div>
			</div>
		</section>
		<section id="rivalries" class="rivalry-section" aria-labelledby="rivalries-title">
			<div class="section-heading">
				<div>
					<p class="overline">Everybody has a difficult opponent</p>
					<h2 id="rivalries-title">Bad company.<br /><span>Good competition.</span></h2>
				</div>
				<p class="section-copy">Who finishes ahead when<br />all five share a table?</p>
			</div>
			<div class="rivalry-layout">
				<div class="matrix-wrap">
					<table class="matrix">
						<caption>Relative profit per 100 hands at the same five-player tables</caption><thead
							><tr
								><th scope="col"><span class="sr-only">Player</span></th>{#each CAST as c (c.id)}<th
										scope="col">{c.name}</th
									>{/each}</tr
							></thead
						><tbody
							>{#each CAST as a (a.id)}<tr
									><th scope="row">{a.name}</th>{#each CAST as b (b.id)}{@const g =
											run?.gaps[a.id]?.[b.id]}<td
											>{#if a.id === b.id}<span class="matrix-self" aria-label="Same player">·</span
												>{:else}<button
													class:positive={g && g.mean - g.interval95 > 0}
													class:negative={g && g.mean + g.interval95 < 0}
													class:matrix-selected={selectedBot === a.id && rival === b.id}
													onclick={() => {
														selectedBot = a.id;
														rival = b.id;
													}}
													aria-label={`${a.name} compared with ${b.name}: ${g ? `${signed(g.mean)} starting bets per 100 hands` : 'no result yet'}`}
													aria-pressed={selectedBot === a.id && rival === b.id}
													>{g ? signed(g.mean) : '…'}</button
												>{/if}</td
										>{/each}</tr
								>{/each}</tbody
						>
					</table>
					<div class="matrix-key">
						<span><i></i> Clear positive gap</span><span><i></i> Within the margin</span><span
							><i></i> Clear negative gap</span
						>
					</div>
				</div>
				<div class="rivalry-note">
					<span class="big-quote" aria-hidden="true">“</span>
					<h3>{selected.name}<span>vs.</span>{CAST.find((c) => c.id === rival)?.name}</h3>
					{#if gap}<p>
							{Math.abs(gap.mean) <= gap.interval95
								? 'A rivalry still waiting for an answer.'
								: gap.mean > 0
									? `${selected.name} has the edge at this table.`
									: `${CAST.find((c) => c.id === rival)?.name} has the edge at this table.`}
						</p>
						<strong class="gap-number"
							>{signed(gap.mean, 1)}<small>± {fmt(gap.interval95, 1)}</small></strong
						><span class="rivalry-unit">Relative starting bets per 100 hands</span>{:else}<p>
							Their next chapter starts with the first completed competition.
						</p>{/if}<small class="rivalry-disclaimer"
						>Relative earnings in the five-player league. This is not a heads-up match record.</small
					>
				</div>
			</div>
		</section>
		<section id="history" class="history-section" aria-labelledby="history-title">
			<div class="section-heading">
				<div>
					<p class="overline">The table remembers</p>
					<h2 id="history-title">The trophy room.</h2>
				</div>
				<div class="history-total">
					<strong>{totals.titles}</strong><span>titles awarded<br />in the last 90 runs</span>
				</div>
			</div>
			<div class="history-list">
				{#each reports as r (r.id)}{@const winner = CAST.find((c) => c.id === r.winner)}<button
						class:current={r.id === run?.id}
						onclick={() => chooseRun(r.id)}
						aria-pressed={r.id === run?.id}
						><span class="history-date"
							>{date(r.completedAt)}<small
								>{r.kind === 'daily' ? 'Daily championship' : 'Exhibition'}</small
							></span
						><span class="history-winner"
							>{#if winner}<Trophy size={20} />{winner.name}{:else}<span class="unclaimed-trophy"
									><Trophy size={20} /></span
								>No title awarded{/if}</span
						><span class="history-hands">{short(r.hands)} hands</span><span class="history-view"
							>{r.id === run?.id ? 'Selected' : 'View result'}<ArrowUpRight size={17} /></span
						></button
					>{/each}{#if !reports.length}<p class="history-empty">
						An empty shelf. Five very interested players.
					</p>{/if}
			</div>
			{#if !latest}<button class="text-button back-latest" onclick={() => chooseRun(reports[0].id)}
					>Return to the latest result <ArrowRight size={15} /></button
				>{/if}
			<p class="fine-print">
				Select a date to update the championship table, standings and rivalries above. Ties stay
				unclaimed.
			</p>
		</section>
		<section id="workshop" class="workshop-section" aria-labelledby="workshop-title">
			<div class="workshop-intro">
				<p class="overline">Behind the poker face</p>
				<h2 id="workshop-title">Built to play.<br /><span>Tested to improve.</span></h2>
				<p>
					Personality is the point. A better bot should still feel like the same person across the
					table.
				</p>
				<a class="text-button" href="#development-journal"
					>Read the development notes <ArrowRight size={16} /></a
				>
			</div>
			<div class="research-number">
				<strong>10.628<span>M</span></strong><span>simulated hands in the Phase 3 study</span>
				<p>
					8.504M search hands + 2.124M evaluation hands.<br />Across experimental candidates, not
					per current bot.
				</p>
				<span class="research-stamp"><Check size={13} /> Recorded study · October 2026</span>
			</div>
		</section>
		<div class="process-strip" aria-label="How bots improve">
			<span>Compete</span><ArrowRight size={17} /><span>Find a weakness</span><ArrowRight
				size={17}
			/><span>Test a challenger</span><ArrowRight size={17} /><span>Validate</span><ArrowRight
				size={17}
			/><span>Approve a version</span>
		</div>
		<div class="journal" id="development-journal">
			<article>
				<span class="journal-date">Development note / 01</span>
				<h3>Even Captain Cool<br />has a pressure point.</h3>
				<p>
					Repeated blind raises exposed a weakness in Dhoni’s decision logic. The first correction
					created a different problem against players who changed their style. A narrower correction
					passed all eight evaluation gates and became the canonical Dhoni.
				</p>
				<div class="journal-foot">
					<span class="journal-badge">Adopted</span><span>Dhoni · blind-raise response</span>
				</div>
			</article>
			<article>
				<span class="journal-date">Development note / 02</span>
				<h3>Winning isn’t permission<br />to become someone else.</h3>
				<p>
					GG’s selected challenger made him a more convincing patient player. Other candidates
					stayed out when stronger-looking results came with weaker adaptation or less variety
					between nights. Every improvement has to keep the character.
				</p>
				<div class="journal-foot">
					<span class="journal-badge">Character preserved</span><span>Canonical selection</span>
				</div>
			</article>
		</div>
		<footer class="league-footer">
			<span class="footer-mark">♠ CHAAL LEAGUE</span>
			<p>
				{short(totals.hands)} league hands recorded here.<br />Real results. Simulated stakes. Very
				familiar egos.
			</p>
			<a href="#championship">Back to the table ↑</a>
		</footer>
	</div>
</div>

<style>
	.league {
		--ground: #101f1b;
		--ink: #f7f1df;
		--muted: #b5c2b9;
		--line: #385047;
		--gold: #edc76c;
		background: var(--ground);
		color: var(--ink);
		font-family: var(--font-display);
		margin: 0;
		overflow: clip;
		isolation: isolate;
	}
	.league-inner {
		max-width: 1600px;
		margin: auto;
		padding: 0 clamp(20px, 5vw, 80px);
	}
	.league :is(section, div[id]) {
		scroll-margin-top: 100px;
	}
	.edition {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		padding: 28px 0 20px;
		border-bottom: 1px solid var(--line);
		font:
			10px/1.5 ui-monospace,
			monospace;
		text-transform: uppercase;
		letter-spacing: 0.13em;
		color: var(--muted);
	}
	.edition > span:first-child {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.edition-dot {
		width: 6px;
		height: 6px;
		background: var(--gold);
		border-radius: 50%;
	}
	.masthead {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 30px;
		padding: 30px 0 35px;
	}
	.masthead h1 {
		font-weight: 800;
		font-size: clamp(70px, 9.8vw, 150px);
		line-height: 0.82;
		letter-spacing: -0.065em;
		margin: 0;
	}
	.masthead h1 > span {
		display: block;
	}
	.title-period {
		color: var(--gold);
	}
	.masthead-note {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		align-self: stretch;
		justify-content: space-between;
		padding: 8px 0;
	}
	.tiny-suit {
		color: var(--gold);
		font-size: 40px;
	}
	.masthead-note p {
		font-size: 14px;
		line-height: 1.65;
		color: var(--muted);
		text-align: right;
	}
	.masthead-note strong {
		font-weight: 500;
		color: var(--ink);
	}
	.section-nav {
		display: flex;
		justify-content: space-between;
		border-block: 1px solid var(--line);
		padding: 15px 0;
		gap: 20px;
		font-size: 12px;
	}
	.section-nav a {
		display: flex;
		align-items: center;
		gap: 18px;
		color: var(--muted);
		white-space: nowrap;
	}
	.section-nav a:first-child {
		color: var(--gold);
	}
	a,
	button {
		transition:
			color 0.2s,
			background 0.2s,
			translate 0.2s;
	}
	button,
	a {
		cursor: pointer;
	}
	button:focus-visible,
	a:focus-visible,
	[tabindex]:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 5px;
	}
	.section-nav a:hover,
	.text-button:hover {
		color: var(--gold);
		translate: 0 -2px;
	}
	.championship {
		padding-top: 27px;
	}
	.match-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		font:
			11px/1.5 ui-monospace,
			monospace;
		color: var(--muted);
	}
	.match-label {
		color: var(--gold);
	}
	.match-status {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.headline {
		display: flex;
		justify-content: space-between;
		gap: 24px;
		padding-top: 42px;
	}
	.overline {
		font:
			10px/1.5 ui-monospace,
			monospace;
		letter-spacing: 0.13em;
		text-transform: uppercase;
		color: var(--muted);
		margin: 0 0 13px;
	}
	.headline h2 {
		font-size: clamp(38px, 4.3vw, 65px);
		letter-spacing: -0.05em;
		line-height: 1.05;
		margin: 0;
		font-weight: 650;
	}
	.headline h2 span {
		color: var(--gold);
	}
	.headline-deck {
		font-size: 13px;
		max-width: 370px;
		line-height: 1.65;
		color: var(--muted);
		margin: 17px 0 0;
	}
	.schedule {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding-top: 24px;
	}
	.schedule > :global(svg) {
		color: var(--gold);
	}
	.schedule strong,
	.schedule span,
	.schedule small {
		display: block;
	}
	.schedule strong {
		font-size: 14px;
		font-weight: 600;
	}
	.schedule span {
		font-size: 12px;
		color: var(--muted);
		margin: 5px 0 17px;
	}
	.schedule small {
		font:
			9px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.arena {
		height: clamp(440px, 41vw, 590px);
		position: relative;
		margin-top: -32px;
	}
	.arena-light {
		position: absolute;
		inset: -15% -15% -10%;
		pointer-events: none;
		background: radial-gradient(ellipse at 50% 53%, #41634835, transparent 60%);
	}
	.table-oval {
		position: absolute;
		left: 11%;
		right: 11%;
		top: 36%;
		height: 53%;
		border-radius: 50%;
		background: radial-gradient(ellipse at 50% 30%, #285346, #183e32 70%);
		border: 8px solid #4c3f2d;
		box-shadow:
			0 4px 0 #a885473b,
			inset 0 0 0 2px #ba9e5759,
			inset 0 0 0 11px #12271f8c,
			0 22px 30px #0005;
		transform: rotate(-3deg);
	}
	.table-oval:after {
		content: '';
		position: absolute;
		inset: 19px;
		border: 1px solid #b89e5345;
		border-radius: 50%;
	}
	.table-mark {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding-top: 15px;
		color: #b4bd9b52;
	}
	.table-mark > span:first-child {
		font-size: clamp(35px, 5vw, 72px);
		font-weight: 800;
		letter-spacing: 0.16em;
		line-height: 1;
	}
	.table-mark small {
		font:
			8px ui-monospace,
			monospace;
		letter-spacing: 0.18em;
		margin-top: 8px;
	}
	.table-suits {
		font-size: 18px;
		letter-spacing: 10px;
		margin-top: 14px;
	}
	.competitor {
		position: absolute;
		width: 21%;
		max-width: 260px;
		z-index: 2;
		border: 0;
		background: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		color: var(--ink);
		isolation: isolate;
		transform-origin: 50% 100%;
	}
	.competitor:hover {
		translate: 0 -7px;
	}
	.competitor:before {
		content: '';
		position: absolute;
		inset: 15% 12% 10%;
		border-radius: 50%;
		background: radial-gradient(ellipse, var(--player-accent), transparent 68%);
		opacity: 0;
		z-index: -1;
		transition: opacity 0.25s;
	}
	.competitor:hover:before,
	.competitor.chosen:before {
		opacity: 0.17;
	}
	.competitor-portrait {
		display: flex;
		justify-content: center;
		width: 100%;
		height: clamp(150px, 18vw, 250px);
		overflow: visible;
		filter: drop-shadow(0 8px 4px #0003);
	}
	.competitor-portrait :global(.portrait) {
		width: 100%;
		height: auto;
		aspect-ratio: 1;
		max-width: 270px;
	}
	.spot-0 {
		left: 40%;
		top: 4%;
	}
	.spot-1 {
		left: 19%;
		top: 14%;
	}
	.spot-2 {
		right: 18%;
		top: 16%;
	}
	.spot-3 {
		left: 0;
		top: 37%;
	}
	.spot-4 {
		right: 0;
		top: 39%;
	}
	.nameplate {
		display: flex;
		gap: 10px;
		align-items: center;
		justify-content: space-between;
		min-width: 120px;
		padding: 9px 13px;
		background: #0b1815;
		border: 1px solid #526052;
		border-radius: 4px;
		margin-top: -38px;
		z-index: 2;
		box-shadow: 0 5px 10px #0003;
	}
	.nameplate > span {
		font-weight: 650;
		font-size: 15px;
	}
	.nameplate small {
		font:
			9px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.crowned .nameplate {
		border-color: var(--gold);
		color: var(--gold);
	}
	.winner-badge {
		position: absolute;
		top: 5%;
		left: 50%;
		translate: -50% -50%;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 9px;
		border: 1px solid #edc76c70;
		border-radius: 30px;
		background: #1d2c20;
		font:
			9px ui-monospace,
			monospace;
		text-transform: uppercase;
		color: var(--gold);
		white-space: nowrap;
		z-index: 3;
	}
	.table-caption {
		display: flex;
		align-items: center;
		gap: 13px;
		position: absolute;
		bottom: 0;
		width: 100%;
		justify-content: center;
		color: var(--muted);
		font:
			9px ui-monospace,
			monospace;
	}
	.table-caption-line {
		width: 40px;
		height: 1px;
		background: var(--line);
	}
	.match-strip {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-block: 1px solid var(--line);
		margin-top: 28px;
		padding: 24px 0;
	}
	.match-strip > div {
		border-right: 1px solid var(--line);
		padding-left: 30px;
	}
	.match-strip > div:first-child {
		padding-left: 0;
	}
	.match-strip > div:last-child {
		border: 0;
	}
	.match-strip span {
		display: block;
		font:
			9px ui-monospace,
			monospace;
		letter-spacing: 0.03em;
		color: var(--muted);
		margin-bottom: 9px;
	}
	.match-strip strong {
		font-size: 27px;
		letter-spacing: -0.04em;
		font-weight: 500;
	}
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 24px;
		margin-bottom: 30px;
	}
	.section-heading h2 {
		font-size: clamp(35px, 4.2vw, 62px);
		letter-spacing: -0.05em;
		line-height: 1.06;
		font-weight: 550;
		margin: 0;
	}
	.standings-section,
	.players-section,
	.rivalry-section,
	.history-section {
		padding-top: 90px;
	}
	.section-aside {
		text-align: right;
		font-size: 11px;
		color: var(--muted);
		display: grid;
		justify-items: end;
		gap: 10px;
	}
	.text-button {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		border: 0;
		background: none;
		padding: 0;
		color: var(--gold);
	}
	.method {
		border: 1px solid var(--line);
		padding: 25px;
		margin-bottom: 25px;
		background: #172d25;
		font-size: 13px;
		line-height: 1.7;
	}
	.method strong {
		color: var(--gold);
	}
	.method p {
		max-width: 850px;
		color: var(--muted);
		margin: 10px 0 0;
	}
	.scoreboard {
		overflow-x: auto;
		border-top: 2px solid var(--gold);
	}
	.scoreboard table {
		width: 100%;
		border-collapse: collapse;
		text-align: left;
		font-size: 13px;
		white-space: nowrap;
	}
	.scoreboard thead {
		color: var(--muted);
		font:
			9px ui-monospace,
			monospace;
	}
	.scoreboard th {
		font-weight: 500;
	}
	.scoreboard th small {
		display: block;
		font-size: 8px;
		color: #92a599;
		margin-top: 5px;
	}
	.scoreboard th,
	.scoreboard td {
		padding: 19px 15px;
		border-bottom: 1px solid var(--line);
	}
	.scoreboard th:first-child,
	.scoreboard td:first-child {
		padding-left: 0;
	}
	.scoreboard th:last-child,
	.scoreboard td:last-child {
		padding-right: 0;
		text-align: right;
	}
	.scoreboard .rank {
		font:
			20px ui-monospace,
			monospace;
		color: #a0b1a5;
	}
	.scoreboard td.score {
		font-size: 23px;
		letter-spacing: -0.05em;
		font-weight: 600;
		color: var(--gold);
	}
	.scoreboard .negative {
		color: #ee9e8c !important;
	}
	.player-link {
		display: flex;
		align-items: center;
		gap: 12px;
		background: none;
		border: 0;
		color: var(--ink);
		font: 600 16px var(--font-display);
		padding: 7px 0;
	}
	.player-link > :global(svg) {
		color: var(--gold);
	}
	.player-link:hover {
		translate: 4px 0;
	}
	.player-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.selected-row {
		background: #e1ebd906;
	}
	.rate {
		font:
			12px ui-monospace,
			monospace;
	}
	.rate span,
	.win-share {
		font-size: 10px;
		color: var(--muted);
	}
	.movement {
		font:
			9px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.scoreboard-foot {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		font:
			9px/1.7 ui-monospace,
			monospace;
		color: var(--muted);
		padding-top: 16px;
	}
	.section-copy {
		font-size: 13px;
		line-height: 1.65;
		color: var(--muted);
		margin: 0;
	}
	.player-tabs {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		border-block: 1px solid var(--line);
	}
	.player-tabs button {
		padding: 19px 17px 19px 0;
		background: none;
		border: 0;
		border-right: 1px solid var(--line);
		text-align: left;
		color: var(--muted);
		position: relative;
	}
	.player-tabs button:not(:first-child) {
		padding-left: 17px;
	}
	.player-tabs button:last-child {
		border: 0;
	}
	.player-tabs button > span:first-child {
		display: block;
		font-size: 19px;
		font-weight: 600;
		margin-bottom: 5px;
	}
	.player-tabs button.active {
		color: var(--player-accent);
	}
	.player-tabs button.active:after {
		content: '';
		position: absolute;
		height: 2px;
		background: var(--player-accent);
		bottom: -1px;
		left: 0;
		right: 0;
	}
	.player-tabs button:hover {
		background: #e4f0dd08;
	}
	.player-tabs :global(svg) {
		position: absolute;
		right: 13px;
		top: 22px;
	}
	.tab-tagline {
		font-size: 9px;
		display: block;
		color: var(--muted);
	}
	.player-dossier {
		display: grid;
		grid-template-columns: 42% 58%;
		padding-top: 40px;
		gap: 0;
	}
	.dossier-art {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 370px;
	}
	.dossier-art:before {
		content: '';
		position: absolute;
		width: 72%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(
			ellipse,
			color-mix(in srgb, var(--player-accent) 22%, transparent),
			transparent 70%
		);
	}
	.dossier-art :global(.portrait) {
		position: relative;
		z-index: 1;
	}
	.dossier-number {
		position: absolute;
		top: 0;
		left: 0;
		font-size: 180px;
		font-weight: 700;
		line-height: 1;
		color: #36504466;
		letter-spacing: -0.1em;
	}
	.dossier-signature {
		position: absolute;
		bottom: 25px;
		left: 40%;
		rotate: -9deg;
		font-size: 35px;
		font-style: italic;
		color: var(--player-accent);
		z-index: 2;
		text-shadow: 0 2px 3px #101f1b;
	}
	.dossier-copy {
		padding: 10px 0 0 35px;
	}
	.dossier-copy h3 {
		font-size: 68px;
		letter-spacing: -0.06em;
		line-height: 1;
		margin: 0 0 20px;
	}
	.dossier-copy h3 > span {
		color: var(--player-accent);
	}
	.player-description {
		font-size: 16px;
		line-height: 1.65;
		max-width: 510px;
		color: var(--muted);
	}
	.player-stats {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 25px 0;
		padding: 20px 0;
		border-block: 1px solid var(--line);
		gap: 10px;
	}
	.player-stats dt {
		font:
			9px ui-monospace,
			monospace;
		color: var(--muted);
		line-height: 1.5;
	}
	.player-stats dt small {
		display: block;
		font-size: 8px;
	}
	.player-stats dd {
		font-size: 29px;
		margin: 9px 0 0;
		letter-spacing: -0.05em;
	}
	.negative {
		color: #ee9e8c;
	}
	.style-tags {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.style-tags span {
		border: 1px solid var(--line);
		padding: 5px 8px;
		border-radius: 3px;
		font:
			8px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.dossier-actions {
		display: flex;
		align-items: center;
		gap: 25px;
		margin-top: 30px;
	}
	.primary-button {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 30px;
		background: var(--gold);
		color: #172219;
		border: 1px solid var(--gold);
		border-radius: 4px;
		padding: 14px 17px;
		font-size: 13px;
		font-weight: 600;
	}
	.primary-button:hover {
		background: var(--ink);
		translate: 0 -3px;
	}
	.primary-button :global(svg) {
		transition: translate 0.2s;
	}
	.primary-button:hover :global(svg) {
		translate: 2px -2px;
	}
	.dossier-actions > span {
		font-size: 10px;
		line-height: 1.65;
		color: var(--muted);
	}
	.personal-record {
		font-size: 11px;
		color: var(--muted);
		line-height: 1.6;
	}
	.rivalry-section .section-heading h2 > span {
		color: #a9bdad;
	}
	.rivalry-layout {
		display: grid;
		grid-template-columns: 1.3fr 1fr;
		gap: 60px;
		align-items: center;
	}
	.matrix-wrap {
		min-width: 0;
	}
	.matrix {
		width: 100%;
		border-collapse: separate;
		border-spacing: 5px;
		font:
			11px ui-monospace,
			monospace;
	}
	.matrix caption {
		text-align: left;
		font:
			10px/1.6 ui-monospace,
			monospace;
		color: var(--muted);
		margin-bottom: 18px;
	}
	.matrix th {
		font-weight: 400;
		color: var(--muted);
		font-size: 10px;
		padding: 7px 0;
	}
	.matrix th:first-child {
		text-align: left;
		padding-right: 10px;
	}
	.matrix td {
		height: 49px;
		text-align: center;
	}
	.matrix button {
		width: 100%;
		height: 100%;
		padding: 5px;
		background: #2e3f35;
		border: 1px solid transparent;
		border-radius: 3px;
		color: #b5c2b9;
		font-size: 11px;
	}
	.matrix button.positive {
		background: #35533d;
		color: #dcf0bd;
	}
	.matrix button.negative {
		background: #573b32;
		color: #f6b8a2;
	}
	.matrix button:hover {
		translate: 0 -2px;
		border-color: var(--gold);
	}
	.matrix button.matrix-selected {
		border-color: var(--gold);
		outline: 1px solid var(--gold);
	}
	.matrix-self {
		color: #688272;
	}
	.matrix-key {
		display: flex;
		gap: 15px;
		flex-wrap: wrap;
		margin: 15px 0 0 5px;
		font:
			8px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.matrix-key span {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.matrix-key i {
		width: 7px;
		height: 7px;
		background: #35533d;
		border: 1px solid #648253;
	}
	.matrix-key span:nth-child(2) i {
		background: #2e3f35;
		border-color: #718777;
	}
	.matrix-key span:nth-child(3) i {
		background: #573b32;
		border-color: #ae7767;
	}
	.rivalry-note {
		border-left: 1px solid var(--line);
		padding: 0 0 0 40px;
		position: relative;
	}
	.big-quote {
		font-size: 90px;
		line-height: 0.6;
		color: #667a594d;
		display: block;
	}
	.rivalry-note h3 {
		display: flex;
		align-items: center;
		gap: 15px;
		font-size: 30px;
		margin: 8px 0 16px;
		letter-spacing: -0.04em;
	}
	.rivalry-note h3 span {
		font:
			italic 16px Georgia,
			serif;
		color: var(--muted);
	}
	.rivalry-note p {
		font-size: 14px;
		color: var(--muted);
		line-height: 1.7;
		max-width: 300px;
	}
	.gap-number {
		display: block;
		font-size: 45px;
		letter-spacing: -0.05em;
		font-weight: 500;
		color: var(--gold);
	}
	.gap-number small {
		font:
			13px ui-monospace,
			monospace;
		color: var(--muted);
		margin-left: 15px;
	}
	.rivalry-unit {
		font:
			9px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.rivalry-disclaimer {
		display: block;
		font-size: 10px;
		line-height: 1.65;
		margin-top: 25px;
		max-width: 310px;
		color: var(--muted);
	}
	.history-total {
		display: flex;
		gap: 15px;
		align-items: center;
	}
	.history-total strong {
		font-size: 49px;
		line-height: 1;
		letter-spacing: -0.05em;
		color: var(--gold);
		font-weight: 500;
	}
	.history-total span {
		font:
			9px/1.7 ui-monospace,
			monospace;
		color: var(--muted);
	}
	.history-list {
		border-top: 1px solid var(--line);
	}
	.history-list > button {
		width: 100%;
		display: grid;
		grid-template-columns: 1fr 1.4fr 1fr 0.8fr;
		align-items: center;
		gap: 15px;
		padding: 24px 15px;
		border: 0;
		border-bottom: 1px solid var(--line);
		background: none;
		color: var(--ink);
		text-align: left;
	}
	.history-list > button.current {
		background: #edc76c08;
		box-shadow: inset 2px 0 var(--gold);
	}
	.history-list > button:hover {
		background: #edc76c12;
	}
	.history-date {
		font-size: 19px;
	}
	.history-date small {
		display: block;
		font:
			8px ui-monospace,
			monospace;
		color: var(--muted);
		margin-top: 5px;
	}
	.history-winner {
		display: flex;
		align-items: center;
		gap: 15px;
		font-size: 20px;
		letter-spacing: -0.03em;
	}
	.history-winner :global(svg) {
		color: var(--gold);
	}
	.unclaimed-trophy {
		opacity: 0.4;
	}
	.history-hands {
		font:
			11px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.history-view {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 18px;
		font-size: 11px;
		color: var(--gold);
	}
	.fine-print {
		font:
			9px/1.7 ui-monospace,
			monospace;
		color: var(--muted);
		margin: 17px 0 0;
	}
	.back-latest {
		margin-top: 18px;
	}
	.workshop-section {
		display: grid;
		grid-template-columns: 1fr 1fr;
		align-items: center;
		gap: 60px;
		padding: 55px 0;
		margin-top: 100px;
		border-block: 1px solid var(--line);
	}
	.workshop-intro h2 {
		font-size: clamp(33px, 3.4vw, 50px);
		font-weight: 550;
		letter-spacing: -0.05em;
		line-height: 1.1;
		margin: 0 0 20px;
	}
	.workshop-intro h2 span {
		color: #a9bdad;
	}
	.workshop-intro > p:not(.overline) {
		font-size: 13px;
		line-height: 1.7;
		max-width: 330px;
		color: var(--muted);
		margin-bottom: 25px;
	}
	.research-number {
		padding-left: 35px;
		border-left: 1px solid var(--line);
	}
	.research-number > strong {
		font-size: clamp(55px, 7vw, 100px);
		font-weight: 500;
		letter-spacing: -0.07em;
		display: block;
		line-height: 1.1;
	}
	.research-number > strong > span {
		color: var(--gold);
		font-size: 0.5em;
		margin-left: 8px;
	}
	.research-number > span:not(.research-stamp) {
		font-size: 13px;
		display: block;
		margin: 5px 0 20px;
	}
	.research-number p {
		font:
			9px/1.8 ui-monospace,
			monospace;
		color: var(--muted);
	}
	.research-stamp {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		color: var(--gold);
		font:
			8px ui-monospace,
			monospace;
		margin-top: 10px;
	}
	.process-strip {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font:
			10px ui-monospace,
			monospace;
		color: var(--muted);
		padding: 25px 0;
		border-bottom: 1px solid var(--line);
	}
	.process-strip :global(svg) {
		color: #677b65;
	}
	.process-strip > span:last-child {
		color: var(--gold);
	}
	.journal {
		display: grid;
		grid-template-columns: 1fr 1fr;
		padding: 40px 0 75px;
		gap: 60px;
	}
	.journal article + article {
		border-left: 1px solid var(--line);
		padding-left: 35px;
	}
	.journal-date {
		font:
			8px ui-monospace,
			monospace;
		color: var(--muted);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.journal h3 {
		font-size: 26px;
		line-height: 1.2;
		letter-spacing: -0.03em;
		font-weight: 500;
		margin: 20px 0 15px;
	}
	.journal p {
		font-size: 12px;
		color: var(--muted);
		line-height: 1.85;
		max-width: 470px;
	}
	.journal-foot {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 22px;
		font:
			8px ui-monospace,
			monospace;
		color: var(--muted);
	}
	.journal-badge {
		border: 1px solid #74835b80;
		padding: 5px 8px;
		border-radius: 3px;
		color: #d1dfa8;
	}
	.league-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 30px;
		border-top: 1px solid var(--line);
		padding: 30px 0 40px;
	}
	.footer-mark {
		font-size: 16px;
		font-weight: 700;
		letter-spacing: -0.04em;
	}
	.league-footer p {
		font:
			9px/1.8 ui-monospace,
			monospace;
		color: var(--muted);
	}
	.league-footer a {
		font-size: 11px;
		color: var(--gold);
	}
	.league-footer a:hover {
		translate: 0 -3px;
	}
	.empty-state {
		padding: 45px 20px;
		text-align: center;
		color: var(--muted);
	}
	.empty-state :global(svg) {
		margin: auto;
		color: var(--gold);
	}
	.empty-state p {
		font-size: 18px;
		color: var(--ink);
	}
	.empty-state span {
		font-size: 12px;
	}
	.history-empty {
		padding: 35px 0;
		color: var(--muted);
		font-size: 15px;
	}
	.load-notice {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		background: #593a2b;
		padding: 15px;
		margin-top: 20px;
		font-size: 12px;
		line-height: 1.6;
	}
	.load-notice button {
		display: flex;
		gap: 7px;
		align-items: center;
		color: var(--ink);
		flex: none;
	}
	.availability {
		font-size: 12px;
		color: var(--muted);
	}
	.league :is(a, button) {
		min-height: 24px;
	}

	@media (min-width: 1600px) {
		.league {
			margin-inline: 0;
		}
	}
	@media (max-width: 1000px) {
		.league-inner {
			padding-inline: 25px;
		}
		.arena {
			height: 440px;
			margin-top: -5px;
		}
		.nameplate {
			min-width: 105px;
			padding: 8px 10px;
			margin-top: -28px;
		}
		.nameplate > span {
			font-size: 13px;
		}
		.nameplate small {
			font-size: 8px;
		}
		.competitor-portrait {
			height: 180px;
		}
		.masthead-note {
			padding-top: 0;
		}
		.section-nav {
			gap: 15px;
			font-size: 10px;
		}
		.player-dossier {
			grid-template-columns: 38% 62%;
		}
		.dossier-copy {
			padding-left: 20px;
		}
		.dossier-art :global(.portrait) {
			width: 300px;
			height: 300px;
		}
		.dossier-signature {
			left: 30%;
			bottom: 50px;
		}
		.rivalry-layout {
			gap: 25px;
			grid-template-columns: 1.2fr 1fr;
		}
		.rivalry-note {
			padding-left: 25px;
		}
		.rivalry-note h3 {
			font-size: 24px;
			gap: 10px;
		}
		.player-tabs button > span:first-child {
			font-size: 16px;
		}
		.player-tabs :global(svg) {
			width: 13px;
			right: 8px;
		}
		.dossier-actions {
			gap: 15px;
		}
		.primary-button {
			gap: 15px;
		}
		.workshop-section,
		.journal {
			gap: 30px;
		}
		.scoreboard th,
		.scoreboard td {
			padding-inline: 11px;
		}
		.scoreboard td.score {
			font-size: 20px;
		}
		.win-share {
			display: block;
			margin-top: 4px;
		}
	}
	@media (max-width: 650px) {
		.league {
			margin-inline: 0;
		}
		.league-inner {
			padding-inline: 20px;
		}
		.edition {
			font-size: 8px;
			letter-spacing: 0.05em;
			padding: 20px 0 14px;
		}
		.edition-year {
			display: none;
		}
		.masthead {
			padding: 26px 0;
		}
		.masthead h1 {
			font-size: clamp(62px, 16vw, 100px);
		}
		.masthead-note {
			display: none;
		}
		.section-nav {
			overflow-x: auto;
			justify-content: flex-start;
			gap: 25px;
			font-size: 10px;
			padding-block: 15px;
			scrollbar-width: none;
		}
		.section-nav a:first-child {
			gap: 6px;
		}
		.match-heading {
			font-size: 8px;
			gap: 8px;
		}
		.championship {
			padding-top: 20px;
		}
		.headline {
			padding-top: 30px;
			display: block;
		}
		.headline h2 {
			font-size: 40px;
		}
		.overline {
			font-size: 8px;
			margin-bottom: 10px;
		}
		.headline-deck {
			font-size: 12px;
			max-width: 290px;
			margin-top: 13px;
		}
		.schedule {
			padding-top: 22px;
			gap: 8px;
		}
		.schedule > :global(svg) {
			width: 14px;
		}
		.schedule strong {
			font-size: 11px;
			display: inline;
		}
		.schedule span {
			display: inline;
			font-size: 10px;
			margin-left: 7px;
		}
		.schedule small {
			display: none;
		}
		.arena {
			height: 360px;
			margin-top: 15px;
			margin-inline: -10px;
		}
		.table-oval {
			left: 5%;
			right: 5%;
			top: 38%;
			height: 47%;
			border-width: 5px;
			box-shadow:
				inset 0 0 0 1px #ba9e5759,
				inset 0 0 0 7px #12271f8c,
				0 15px 23px #0005;
		}
		.table-oval:after {
			inset: 11px;
		}
		.table-mark {
			padding-top: 18px;
		}
		.table-mark > span:first-child {
			font-size: 34px;
		}
		.table-mark small {
			font-size: 5px;
			letter-spacing: 0.12em;
		}
		.table-suits {
			font-size: 12px;
			letter-spacing: 7px;
			margin-top: 10px;
		}
		.competitor {
			width: 30%;
		}
		.competitor-portrait {
			height: 116px;
		}
		.spot-0 {
			left: 35%;
			top: 0;
		}
		.spot-1 {
			left: 9%;
			top: 15%;
		}
		.spot-2 {
			right: 6%;
			top: 16%;
		}
		.spot-3 {
			left: -1%;
			top: 44%;
		}
		.spot-4 {
			right: -1%;
			top: 45%;
		}
		.nameplate {
			min-width: 68px;
			padding: 5px 7px;
			gap: 7px;
			margin-top: -17px;
		}
		.nameplate > span {
			font-size: 11px;
		}
		.nameplate small {
			font-size: 7px;
		}
		.winner-badge {
			font-size: 7px;
			padding: 4px 7px;
			top: 1%;
		}
		.winner-badge :global(svg) {
			width: 11px;
			height: 11px;
		}
		.table-caption {
			font-size: 7px;
			gap: 8px;
			bottom: 6px;
		}
		.table-caption-line {
			width: 17px;
		}
		.match-strip {
			grid-template-columns: 1fr 1fr;
			margin-top: 8px;
			padding: 0;
		}
		.match-strip > div {
			padding: 18px 0 18px 18px;
			border-bottom: 1px solid var(--line);
		}
		.match-strip > div:nth-child(odd) {
			padding-left: 0;
		}
		.match-strip > div:nth-child(even) {
			border-right: 0;
		}
		.match-strip > div:nth-child(n + 3) {
			border-bottom: 0;
		}
		.match-strip span {
			font-size: 8px;
			margin-bottom: 7px;
		}
		.match-strip strong {
			font-size: 23px;
		}
		.standings-section,
		.players-section,
		.rivalry-section,
		.history-section {
			padding-top: 60px;
		}
		.section-heading {
			align-items: flex-start;
			gap: 15px;
			margin-bottom: 22px;
		}
		.section-heading h2 {
			font-size: 35px;
		}
		.section-aside {
			font-size: 8px;
			padding-top: 6px;
			gap: 9px;
		}
		.text-button {
			font-size: 9px;
			gap: 5px;
		}
		.text-button :global(svg) {
			width: 12px;
		}
		.scoreboard table {
			min-width: 620px;
			font-size: 11px;
		}
		.scoreboard th,
		.scoreboard td {
			padding: 15px 12px;
		}
		.scoreboard .rank {
			font-size: 16px;
		}
		.scoreboard td.score {
			font-size: 20px;
		}
		.scoreboard-foot {
			display: grid;
			gap: 5px;
			font-size: 8px;
			padding-top: 13px;
		}
		.section-copy {
			font-size: 10px;
			line-height: 1.6;
		}
		.player-tabs {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
		.player-tabs button {
			padding: 14px 6px !important;
		}
		.player-tabs button > span:first-child {
			font-size: 12px;
			margin: 0;
		}
		.player-tabs :global(svg),
		.tab-tagline {
			display: none;
		}
		.player-tabs button:first-child {
			padding-left: 0 !important;
		}
		.player-dossier {
			grid-template-columns: 1fr;
			padding-top: 20px;
		}
		.dossier-art {
			min-height: 240px;
			height: 240px;
		}
		.dossier-art :global(.portrait) {
			width: 290px;
			height: 290px;
		}
		.dossier-number {
			font-size: 140px;
			top: 15px;
		}
		.dossier-signature {
			font-size: 33px;
			bottom: 18px;
			left: 56%;
		}
		.dossier-art:before {
			width: 70%;
			height: 95%;
		}
		.dossier-copy {
			padding: 20px 0 0;
		}
		.dossier-copy h3 {
			font-size: 53px;
			margin-bottom: 12px;
		}
		.player-description {
			font-size: 14px;
			line-height: 1.7;
		}
		.player-stats {
			margin: 20px 0;
			padding: 18px 0;
		}
		.player-stats dd {
			font-size: 25px;
		}
		.player-stats dt {
			font-size: 8px;
		}
		.dossier-actions {
			margin-top: 24px;
			justify-content: space-between;
		}
		.dossier-actions > span {
			font-size: 9px;
		}
		.primary-button {
			font-size: 12px;
			padding: 13px 15px;
		}
		.rivalry-section .section-heading {
			display: block;
		}
		.rivalry-section .section-copy {
			margin-top: 15px;
		}
		.rivalry-layout {
			grid-template-columns: 1fr;
			gap: 35px;
		}
		.matrix {
			border-spacing: 3px;
			font-size: 10px;
		}
		.matrix th {
			font-size: 8px;
		}
		.matrix td {
			height: 43px;
		}
		.matrix button {
			font-size: 10px;
			padding: 3px;
		}
		.matrix caption {
			font-size: 8px;
			margin-bottom: 13px;
		}
		.matrix-key {
			font-size: 7px;
			gap: 10px;
		}
		.rivalry-note {
			padding: 0 0 0 22px;
		}
		.rivalry-note h3 {
			font-size: 29px;
		}
		.rivalry-note p {
			font-size: 13px;
			max-width: none;
		}
		.big-quote {
			font-size: 65px;
		}
		.gap-number {
			font-size: 40px;
		}
		.rivalry-disclaimer {
			margin-top: 17px;
			font-size: 9px;
			max-width: none;
		}
		.history-total {
			gap: 8px;
			padding-top: 5px;
		}
		.history-total strong {
			font-size: 35px;
		}
		.history-total span {
			font-size: 7px;
		}
		.history-list > button {
			grid-template-columns: 0.9fr 1.3fr;
			gap: 12px;
			padding: 20px 12px;
		}
		.history-date {
			font-size: 17px;
		}
		.history-date small {
			font-size: 7px;
		}
		.history-winner {
			font-size: 17px;
			gap: 8px;
		}
		.history-winner :global(svg) {
			width: 16px;
		}
		.history-hands {
			font-size: 9px;
		}
		.history-view {
			font-size: 9px;
			gap: 7px;
		}
		.fine-print {
			font-size: 8px;
		}
		.workshop-section {
			grid-template-columns: 1fr;
			gap: 30px;
			margin-top: 60px;
			padding: 35px 0;
		}
		.workshop-intro h2 {
			font-size: 35px;
		}
		.workshop-intro > p:not(.overline) {
			font-size: 12px;
			max-width: 100%;
			margin-bottom: 17px;
		}
		.research-number {
			border-left: 0;
			border-top: 1px solid var(--line);
			padding: 25px 0 0;
		}
		.research-number > strong {
			font-size: 76px;
		}
		.research-number > span:not(.research-stamp) {
			font-size: 12px;
		}
		.research-number p {
			font-size: 9px;
		}
		.process-strip {
			flex-wrap: wrap;
			justify-content: flex-start;
			gap: 10px;
			font-size: 8px;
			line-height: 1.7;
			padding: 20px 0;
		}
		.process-strip :global(svg) {
			width: 11px;
		}
		.journal {
			grid-template-columns: 1fr;
			gap: 30px;
			padding: 30px 0 45px;
		}
		.journal article + article {
			padding: 30px 0 0;
			border-left: 0;
			border-top: 1px solid var(--line);
		}
		.journal h3 {
			font-size: 25px;
			margin: 16px 0;
		}
		.journal p {
			font-size: 12px;
		}
		.league-footer {
			flex-wrap: wrap;
			gap: 14px;
			padding: 25px 0 30px;
		}
		.footer-mark {
			font-size: 13px;
		}
		.league-footer p {
			font-size: 8px;
			order: 3;
			flex-basis: 100%;
			margin: 0;
		}
		.league-footer a {
			font-size: 9px;
			margin-left: auto;
		}
		.method {
			padding: 18px;
			font-size: 12px;
		}
		.load-notice {
			font-size: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.league :is(button, a),
		.competitor:before,
		.primary-button :global(svg) {
			transition: none;
		}
		.competitor:hover,
		.section-nav a:hover,
		.text-button:hover,
		.primary-button:hover,
		.player-link:hover,
		.matrix button:hover,
		.league-footer a:hover {
			translate: none;
		}
	}
</style>
