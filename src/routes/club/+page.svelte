<script lang="ts">
	import { dialogFocus } from '#lib/components/dialog-focus.js';
	import { properName } from '#lib/names.js';
	import { goto } from '$app/navigation';
	import ClubGate from '#lib/club/ClubGate.svelte';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import { club } from '#lib/club/club.svelte.js';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { openStart } from '#lib/start/start-modal.svelte.js';
	import ClubWarmup from '#lib/club/ClubWarmup.svelte';
	import DeckCard from '#lib/components/DeckCard.svelte';
	import CasinoChip from '#lib/components/CasinoChip.svelte';
	import { VARIANT_BY_VERSION, type RulesVersion } from '#lib/variant-catalog.js';
	const slotName = (game: string) =>
		game === 'mystery'
			? 'Mystery'
			: (VARIANT_BY_VERSION[game as RulesVersion]?.selectionLabel.split(':')[0] ?? game);

	interface Friend {
		memberId: string;
		nickname: string;
		characterId: string;
		/** False until an invited friend first signs in. */
		joined?: boolean;
	}
	interface LobbyTable {
		name: string;
		gameType: string;
		playerCount: number;
		botCount: number;
		maxPlayers: number;
		isStarted: boolean;
		hostName: string | null;
		boot: number | null;
		table: number;
		connectedMembers: string[];
	}

	let members = $state<Friend[]>([]);
	let online = $state<string[]>([]);
	let tables = $state<LobbyTable[]>([]);
	let loaded = $state(false);
	let error = $state('');
	let period = $state('all');
	let historyPage = $state(0);
	let leaderPage = $state(0);
	let friendPage = $state(0);
	let tablePage = $state(0);
	let historyBusy = $state(true);
	let historyError = $state('');
	let historyLoaded = $state(false);
	let historyRequest = 0;
	interface Standing {
		rank: number;
		nickname: string;
		characterId?: string;
		net: number;
		wins: number;
		hands: number;
		isYou: boolean;
	}
	interface PastHand {
		id: string;
		room: string;
		gameType: string;
		completedAt: number;
		winnerName: string;
		amount: number;
		players: { nickname: string; net: number; won: boolean; isYou: boolean }[];
	}
	let standings = $state<Standing[]>([]);
	let pastHands = $state<PastHand[]>([]);
	let personal = $state({ net: 0, wins: 0, hands: 0 });
	let historyTotal = $state(0);
	let hasMoreHistory = $state(false);
	const chips = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('en-IN')}`;
	const when = (value: number) =>
		new Intl.DateTimeFormat('en-IN', {
			timeZone: 'Asia/Kolkata',
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(value);

	async function loadHistory() {
		const request = ++historyRequest;
		historyBusy = true;
		try {
			const response = await socket.authorizedFetch(
				`/club/history?period=${period}&page=${historyPage}`
			);
			const body = await response.json();
			if (!response.ok) throw new Error(body.error || 'Could not load the club record.');
			if (request !== historyRequest) return;
			standings = body.leaderboard;
			pastHands = body.hands;
			personal = body.personal;
			historyTotal = body.total;
			hasMoreHistory = body.hasMore;
			historyError = '';
			historyLoaded = true;
		} catch (failure) {
			if (request === historyRequest)
				historyError =
					failure instanceof Error ? failure.message : 'Could not load the club record.';
		} finally {
			if (request === historyRequest) historyBusy = false;
		}
	}

	function filterHistory(value: string) {
		period = value;
		historyPage = 0;
		leaderPage = 0;
		void loadHistory();
	}
	function turnHistory(offset: number) {
		historyPage += offset;
		void loadHistory();
	}

	const atTable = $derived(new Set(tables.flatMap((table) => table.connectedMembers)));
	const featured = $derived(tables[Math.min(tablePage, Math.max(0, tables.length - 1))]);
	const roster = $derived(
		[...members].sort(
			(a, b) => rank(b.memberId) - rank(a.memberId) || a.nickname.localeCompare(b.nickname)
		)
	);
	const nameOf = (id: string) =>
		members.find((member) => member.memberId === id)?.nickname ?? 'A friend';
	function rank(id: string) {
		if (atTable.has(id)) return 3;
		if (online.includes(id)) return 2;
		return members.find((member) => member.memberId === id)?.joined === false ? 0 : 1;
	}
	const gameName: Record<string, string> = {
		'teen-patti': 'Teen Patti',
		'texas-holdem': 'Texas Hold’em',
		blackjack: 'Blackjack',
		rummy: 'Indian Rummy'
	};

	/** Ended tables from the last week, newest first: who settles with whom. */
	interface Night {
		table: string;
		endedAt: string;
		hands: number;
		settleUp: { from: string; fromName: string; to: string; toName: string; amount: number }[];
	}
	let nights = $state<Night[]>([]);

	async function load() {
		try {
			const response = await socket.authorizedFetch('/club');
			const body = await response.json();
			if (!response.ok) throw new Error(body.error);
			members = body.members;
			online = body.online;
			tables = body.tables;
			nights = body.nights ?? [];
			error = '';
		} catch (failure) {
			error =
				failure instanceof Error && failure.message
					? failure.message
					: 'Can’t reach the club right now.';
		} finally {
			loaded = true;
		}
	}

	async function heartbeat() {
		if (document.visibilityState !== 'visible') return;
		await socket.authorizedFetch('/club/heartbeat', { method: 'POST' }).catch(() => {});
	}

	// Members-only calls start once the member is confirmed, then every 30s while visible.
	const ready = $derived(club.status === 'signedIn' && !!club.member?.onboarded);
	$effect(() => {
		if (!ready) return;
		const refresh = () => {
			void heartbeat().then(load);
			void loadHistory();
		};
		refresh();
		const timer = setInterval(refresh, 30_000);
		const visible = () => document.visibilityState === 'visible' && refresh();
		document.addEventListener('visibilitychange', visible);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', visible);
		};
	});

	function seatsLeft(table: LobbyTable) {
		return table.maxPlayers - table.playerCount;
	}
	/** Which overlay sheet is open: the full lists live here, so the room itself never scrolls. */
	let sheet = $state<'leaderboard' | 'history' | 'friends' | 'practice' | null>(null);
	const LEADER_PAGE = 6;
	const FRIEND_PAGE = 12;
	const winRate = $derived(personal.hands ? personal.wins / personal.hands : 0);
	const recordReady = $derived(historyLoaded && !historyError && !historyBusy);
	const podium = $derived([standings[1], standings[0], standings[2]]);
	const topNet = $derived(Math.max(1, ...standings.slice(0, 3).map((s) => Math.abs(s.net))));
	const statusOf = (id: string) =>
		atTable.has(id) ? ('table' as const) : online.includes(id) ? ('online' as const) : undefined;
	const PERIODS = [
		['all', 'All'],
		['month', 'Month'],
		['today', 'Today']
	] as const;
	const SUIT: Record<string, string> = {
		'teen-patti': '♠',
		'texas-holdem': '♦',
		blackjack: '♣',
		rummy: '♥'
	};
</script>

<svelte:head><title>Your adda · Chaal</title></svelte:head>
<svelte:window onkeydown={(e) => e.key === 'Escape' && sheet && (sheet = null)} />

{#snippet standingRow(entry: Standing)}
	<li class:you={entry.isYou}>
		<span class="place">{entry.rank}</span>
		<CharacterAvatar characterId={entry.characterId} size={30} />
		<strong class="who">{properName(entry.nickname)}</strong>
		<span class="mini" title="{entry.wins} wins, {entry.hands} hands"
			><span aria-hidden="true">♛</span>{entry.wins}<span class="sep" aria-hidden="true">·</span
			><span aria-hidden="true">🂠</span>{entry.hands}</span
		>
		<strong class="net" class:negative={entry.net < 0}>{chips(entry.net)}</strong>
	</li>
{/snippet}

<ClubGate>
	<div class="club-room">
		<!-- Friends: status rings say who is here; the count and the period are the only words. -->
		<section class="crowd" aria-label="Club friends">
			<button
				class="online"
				onclick={() => (sheet = 'friends')}
				aria-label="{online.length} friends online. See everyone"
				><span class="live-dot" class:off={!!error}></span><strong
					>{loaded && !error ? online.length : '·'}</strong
				><span aria-hidden="true">online</span></button
			>
			<ul class="faces-row">
				{#each roster as friend (friend.memberId)}
					<li class:here={!!statusOf(friend.memberId)} class:invited={friend.joined === false}>
						<CharacterAvatar
							memberId={friend.memberId}
							characterId={friend.characterId}
							size={40}
							status={statusOf(friend.memberId)}
							label="{properName(friend.nickname)}: {atTable.has(friend.memberId)
								? 'at a table'
								: online.includes(friend.memberId)
									? 'online'
									: friend.joined === false
										? 'invited'
										: 'away'}"
						/>
						<span>{properName(friend.nickname)}</span>
					</li>
				{/each}
			</ul>
			<div class="period" role="group" aria-label="Record period">
				{#each PERIODS as [id, label] (id)}<button
						aria-pressed={period === id}
						onclick={() => filterHistory(id)}>{label}</button
					>{/each}
			</div>
		</section>

		{#if error || historyError}
			<div class="notice" role="alert">
				<span aria-hidden="true">⚠</span>
				{#if error}<button onclick={load}>Retry lobby</button>{/if}
				{#if historyError}<button onclick={loadHistory}>Retry records</button>{/if}
			</div>
		{/if}

		<div class="board">
			<!-- The live table: a felt oval with the people already sitting at it. -->
			<section class="tile table-tile" aria-label="Tonight’s table">
				{#if !loaded}
					<div class="stage">
						<div class="felt idle" aria-busy="true"><span class="felt-suits">♠ ♥ ♣ ♦</span></div>
					</div>
				{:else if featured}
					{@const mine = featured.connectedMembers.includes(club.member?.memberId ?? '')}
					{@const full = seatsLeft(featured) <= 0 && !mine}
					<div class="stage">
						<div class="felt">
							<div class="seats" style:--n={featured.maxPlayers}>
								{#each Array.from({ length: featured.maxPlayers }, (_, k) => k) as i (i)}
									{@const id = featured.connectedMembers[i]}
									{@const friend = members.find((m) => m.memberId === id)}
									<span class="seat" style:--i={i} class:empty={!id && i >= featured.playerCount}>
										{#if id}<CharacterAvatar
												memberId={friend?.memberId}
												characterId={friend?.characterId}
												size={42}
												label={nameOf(id)}
											/>{:else if i < featured.playerCount}<span class="bot-seat" aria-hidden="true"
												>🤖</span
											>{/if}
									</span>
								{/each}
							</div>
							<div class="felt-center">
								<span class="game-suit" aria-hidden="true">{SUIT[featured.gameType] ?? '♠'}</span>
								<h2>{gameName[featured.gameType] ?? 'Cards'}</h2>
								{#if featured.hostName}<span class="host">{properName(featured.hostName)}</span
									>{/if}
							</div>
						</div>
					</div>
					<div class="table-bar">
						<span class="chip" title="Seated"
							><span aria-hidden="true">👥</span>{featured.playerCount}/{featured.maxPlayers}</span
						>
						{#if featured.botCount}<span class="chip" title="Bots"
								><span aria-hidden="true">🤖</span>{featured.botCount}</span
							>{/if}
						{#if featured.boot}<span class="chip" title="Boot"
								><span aria-hidden="true">●</span>{featured.boot}</span
							>{/if}
						<span class="chip state" class:live={featured.isStarted}
							>{featured.isStarted ? '▶ Live' : '⏸ Waiting'}</span
						>
						<button class="primary" disabled={full} onclick={() => goto(`/${featured.name}`)}
							>{full ? 'Full' : mine ? 'Back to my seat' : 'Join'}</button
						>
					</div>
					{#if tables.length > 1}
						<div class="dots" role="group" aria-label="Open tables">
							{#each tables as t, i (t.name)}<button
									aria-label="Table {i + 1} of {tables.length}"
									aria-pressed={i === Math.min(tablePage, tables.length - 1)}
									onclick={() => (tablePage = i)}
								></button>{/each}
						</div>
					{/if}
				{:else}
					<div class="stage">
						<div class="felt idle">
							<div class="fan" aria-hidden="true">
								<span><DeckCard faceDown /></span><span><DeckCard rank="A" suit="spades" /></span
								><span><DeckCard rank="K" suit="hearts" /></span>
							</div>
							<span class="chips-art" aria-hidden="true"
								><CasinoChip denomination={25} size={44} decorative /><CasinoChip
									denomination={100}
									size={44}
									decorative
								/></span
							>
						</div>
					</div>
					<div class="table-bar">
						<span class="chip">0 tables open</span>
						<button class="primary" onclick={openStart}>Start a table</button>
					</div>
				{/if}
			</section>

			<!-- Leaderboard: a podium, then the next few. -->
			<section class="tile podium-tile" aria-labelledby="podium-title">
				<header>
					<h2 id="podium-title"><span aria-hidden="true">♛</span> Leaderboard</h2>
					<button
						class="expand"
						onclick={() => (sheet = 'leaderboard')}
						aria-label="Full leaderboard">⤢</button
					>
				</header>
				{#if historyBusy && !historyLoaded}
					<div class="podium skeleton" aria-busy="true"><i></i><i></i><i></i></div>
				{:else if standings.length}
					<ol class="podium" aria-label="Top three">
						{#each podium as entry, i (i)}
							{#if entry}
								<li
									class="step p{entry.rank}"
									class:you={entry.isYou}
									style:--h={Math.abs(entry.net) / topNet}
								>
									<CharacterAvatar characterId={entry.characterId} size={i === 1 ? 54 : 44} />
									<strong>{properName(entry.nickname)}</strong>
									<span class="net" class:negative={entry.net < 0}>{chips(entry.net)}</span>
									<span class="block" aria-hidden="true">{entry.rank}</span>
								</li>
							{:else}<li class="step vacant" aria-hidden="true"></li>{/if}
						{/each}
					</ol>
					{#if standings.length > 3}<ol class="standings compact">
							{#each standings.slice(3, 6) as entry (entry.rank)}{@render standingRow(entry)}{/each}
						</ol>{/if}
				{:else}
					<div class="empty"><span aria-hidden="true">♛</span><span>0 hands yet</span></div>
				{/if}
			</section>

			<!-- You: one big number and a ring. -->
			<section class="tile you-tile" aria-labelledby="you-title">
				<h2 id="you-title" class="you-head"><span aria-hidden="true">♠</span> You</h2>
				<div
					class="ring"
					style:--p={winRate}
					role="img"
					aria-label="{recordReady ? Math.round(winRate * 100) : 0}% of hands won"
				>
					<CharacterAvatar
						memberId={club.member?.memberId}
						characterId={club.member?.characterId}
						size={52}
					/>
				</div>
				<div class="you-numbers">
					<strong class="big" class:negative={personal.net < 0}
						>{recordReady ? chips(personal.net) : '·'}</strong
					>
					<span class="unit">chips</span>
					<span class="pair"
						><span title="Hands won"
							><span aria-hidden="true">♛</span>{recordReady ? personal.wins : '·'}</span
						><span title="Hands played"
							><span aria-hidden="true">🂠</span>{recordReady ? personal.hands : '·'}</span
						><span title="Win rate">{recordReady ? Math.round(winRate * 100) : '·'}%</span></span
					>
				</div>
			</section>

			<!-- The last hand: who took it and how much. -->
			<section class="tile last-tile" aria-labelledby="last-title">
				<header>
					<h2 id="last-title"><span aria-hidden="true">◷</span> Last hand</h2>
					<button class="expand" onclick={() => (sheet = 'history')} aria-label="Record book"
						>⤢</button
					>
				</header>
				{#if pastHands.length && !historyError}
					{@const last = pastHands[0]}
					<div class="last">
						<span class="winner-suit" aria-hidden="true">{SUIT[last.gameType] ?? '♠'}</span>
						<div>
							<strong>{properName(last.winnerName)}</strong>
							<span class="won">+{last.amount.toLocaleString('en-IN')}</span>
						</div>
						<time datetime={new Date(last.completedAt).toISOString()}>{when(last.completedAt)}</time
						>
					</div>
					<ul class="hand-strip" aria-label="Results">
						{#each last.players.slice(0, 5) as p, i (i)}<li
								class:negative={p.net < 0}
								class:me={p.isYou}
							>
								<span>{p.isYou ? 'You' : properName(p.nickname)}</span><b>{chips(p.net)}</b>
							</li>{/each}
					</ul>
				{:else}
					<div class="empty"><span aria-hidden="true">◷</span><span>0 hands yet</span></div>
				{/if}
			</section>

			<!-- Settle up after the last night: arrows from who pays to who gets paid. -->
			<section class="tile settle-tile" aria-labelledby="settle-title">
				<header><h2 id="settle-title"><span aria-hidden="true">₹</span> Settle up</h2></header>
				{#if nights.length}
					{@const night = nights[0]}
					{#if night.settleUp.length}
						<ul class="settle">
							{#each night.settleUp.slice(0, 3) as pay (`${pay.from}-${pay.to}`)}
								<li>
									<span class="from">{properName(pay.fromName)}</span>
									<span class="arrow" aria-label="pays">→</span>
									<span class="to">{properName(pay.toName)}</span>
									<b>₹{pay.amount.toLocaleString('en-IN')}</b>
								</li>
							{/each}
						</ul>
					{:else}<div class="empty">
							<span aria-hidden="true">✓</span><span>All square</span>
						</div>{/if}
					<span class="foot">🂠 {night.hands} · {when(new Date(night.endedAt).getTime())}</span>
				{:else}
					<div class="empty"><span aria-hidden="true">✓</span><span>Nothing owed</span></div>
				{/if}
			</section>

			<!-- Tonight's games, and a quick practice round. -->
			<section class="tile lineup-tile" aria-labelledby="lineup-title">
				<header>
					<h2 id="lineup-title"><span aria-hidden="true">♣</span> Tonight</h2>
					<a class="expand" href="/games" aria-label="All games">⤢</a>
				</header>
				<ol class="lineup">
					{#each club.settings.lineup?.length ? club.settings.lineup : ['classic-1', 'muflis-1', 'ak47-1'] as game, index (index)}
						<li class:mystery={game === 'mystery'}>
							<span class="n">{index + 1}</span><span>{slotName(game)}</span>
						</li>
					{/each}
				</ol>
				<button class="practice" onclick={() => (sheet = 'practice')}
					><span aria-hidden="true">🂡</span> Practice</button
				>
			</section>
		</div>
	</div>

	{#if sheet}
		<div class="scrim" role="presentation" onclick={() => (sheet = null)}></div>
		<div
			class="sheet"
			class:wide={sheet === 'practice'}
			role="dialog"
			aria-modal="true"
			aria-labelledby="sheet-title"
			tabindex="-1"
			use:dialogFocus
		>
			<header>
				<h2 id="sheet-title">
					{{
						leaderboard: '♛ Leaderboard',
						history: '◷ Record book',
						friends: '👥 Friends',
						practice: '🂡 Practice'
					}[sheet]}
				</h2>
				<button class="close" onclick={() => (sheet = null)} aria-label="Close">×</button>
			</header>
			{#if sheet === 'leaderboard'}
				{#if standings.length}
					<ol class="standings">
						{#each standings.slice(leaderPage * LEADER_PAGE, (leaderPage + 1) * LEADER_PAGE) as entry (entry.rank)}{@render standingRow(
								entry
							)}{/each}
					</ol>
					<div class="pager">
						<button disabled={leaderPage === 0} onclick={() => leaderPage--} aria-label="Previous"
							>←</button
						><span>{leaderPage + 1} / {Math.ceil(standings.length / LEADER_PAGE)}</span><button
							disabled={(leaderPage + 1) * LEADER_PAGE >= standings.length}
							onclick={() => leaderPage++}
							aria-label="Next">→</button
						>
					</div>
				{:else}<div class="empty">
						<span aria-hidden="true">♛</span><span>0 hands yet</span>
					</div>{/if}
				<p class="fine">Net chips with friends. Gifts, top-ups and bot practice don’t count.</p>
			{:else if sheet === 'history'}
				{#if pastHands.length}
					<ul class="history">
						{#each pastHands.slice(0, 5) as hand (hand.id)}
							<li>
								<span class="winner-suit" aria-hidden="true">{SUIT[hand.gameType] ?? '♠'}</span>
								<div class="h-main">
									<strong
										>{properName(hand.winnerName)}
										<span class="won">+{hand.amount.toLocaleString('en-IN')}</span></strong
									>
									<span class="h-players"
										>{#each hand.players as p, i (i)}<span
												class:negative={p.net < 0}
												class:me={p.isYou}
												>{p.isYou ? 'You' : properName(p.nickname)} {chips(p.net)}</span
											>{/each}</span
									>
								</div>
								<time datetime={new Date(hand.completedAt).toISOString()}
									>{when(hand.completedAt)}</time
								>
							</li>
						{/each}
					</ul>
					<div class="pager">
						<button
							disabled={historyPage === 0}
							onclick={() => turnHistory(-1)}
							aria-label="Previous">←</button
						><span>{historyPage + 1} · {historyTotal} hands</span><button
							disabled={!hasMoreHistory}
							onclick={() => turnHistory(1)}
							aria-label="Next">→</button
						>
					</div>
				{:else}<div class="empty">
						<span aria-hidden="true">◷</span><span>0 hands yet</span>
					</div>{/if}
				<p class="fine">Times in India time (IST).</p>
			{:else if sheet === 'friends'}
				<ul class="friend-grid">
					{#each roster.slice(friendPage * FRIEND_PAGE, (friendPage + 1) * FRIEND_PAGE) as friend (friend.memberId)}
						<li class:here={!!statusOf(friend.memberId)} class:invited={friend.joined === false}>
							<CharacterAvatar
								memberId={friend.memberId}
								characterId={friend.characterId}
								size={52}
								status={statusOf(friend.memberId)}
							/>
							<strong>{properName(friend.nickname)}</strong>
							<span
								>{atTable.has(friend.memberId)
									? '♠ At a table'
									: online.includes(friend.memberId)
										? '● Online'
										: friend.joined === false
											? '✉ Invited'
											: '○ Away'}</span
							>
						</li>
					{/each}
				</ul>
				{#if members.length > FRIEND_PAGE}<div class="pager">
						<button disabled={friendPage === 0} onclick={() => friendPage--} aria-label="Previous"
							>←</button
						><span>{friendPage + 1} / {Math.ceil(members.length / FRIEND_PAGE)}</span><button
							disabled={(friendPage + 1) * FRIEND_PAGE >= members.length}
							onclick={() => friendPage++}
							aria-label="Next">→</button
						>
					</div>{/if}
			{:else}
				<div class="practice-body"><ClubWarmup /></div>
			{/if}
		</div>
	{/if}
</ClubGate>

<style>
	/* One screen: the room is exactly the space under the header and never scrolls. */
	.club-room {
		--tile: #2c263b;
		--tile-line: #ffffff1a;
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		gap: 14px;
		height: calc(100dvh - var(--header-h, 64px));
		overflow: hidden;
		padding: 16px max(var(--gutter), calc((100vw - var(--page-max)) / 2 + var(--gutter))) 18px;
		color: var(--paper);
		background: radial-gradient(ellipse at 82% 0%, #243c2b55, transparent 45%), var(--night);
	}
	h2 {
		font-family: var(--font-display);
		font-weight: 700;
		letter-spacing: -0.02em;
		font-size: 15px;
		display: flex;
		align-items: center;
		gap: 7px;
	}
	h2 > span {
		color: var(--butter);
	}
	.negative {
		color: var(--red) !important;
	}

	/* Friends strip */
	.crowd {
		display: flex;
		align-items: center;
		gap: 16px;
		min-height: 64px;
	}
	.online {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		border-radius: 100px;
		background: #ffffff10;
		font-size: 13px;
		color: var(--muted);
		cursor: pointer;
		flex: none;
		transition:
			background 0.2s,
			translate 0.2s;
	}
	.online:hover,
	.online:focus-visible {
		background: #ffffff1c;
		translate: 0 -1px;
	}
	.online strong {
		font-family: var(--font-display);
		font-size: 22px;
		color: var(--paper);
	}
	.live-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--color-success);
		box-shadow: 0 0 0 4px #a9cfb52e;
	}
	.live-dot.off {
		background: var(--red);
		box-shadow: 0 0 0 4px #ee715b2e;
	}
	.faces-row {
		display: flex;
		gap: 14px;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		mask-image: linear-gradient(90deg, #000 calc(100% - 40px), transparent);
		padding: 2px;
	}
	.faces-row li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: none;
		width: 54px;
		opacity: 0.45;
		filter: grayscale(0.7);
	}
	.faces-row li.here {
		opacity: 1;
		filter: none;
	}
	.faces-row li.invited {
		opacity: 0.25;
	}
	.faces-row li > span {
		font-size: 11px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.period {
		display: flex;
		padding: 3px;
		border-radius: 100px;
		background: #ffffff10;
		flex: none;
	}
	.period button {
		padding: 7px 13px;
		border-radius: 100px;
		font-size: 12px;
		font-weight: 600;
		cursor: pointer;
		color: var(--muted);
	}
	.period button[aria-pressed='true'] {
		background: var(--butter);
		color: var(--night);
	}
	.notice {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 14px;
		border-radius: 12px;
		background: #ee715b22;
		color: #f39788;
		font-size: 13px;
	}
	.notice button {
		text-decoration: underline;
		cursor: pointer;
	}

	/* The board: six tiles in a fixed grid that fills what is left of the screen. */
	.board {
		flex: 1;
		min-height: 0;
		display: grid;
		gap: 14px;
		grid-template-columns: 1.35fr 1fr 1fr;
		grid-template-rows: repeat(3, minmax(0, 1fr));
		grid-template-areas:
			'table podium you'
			'table podium last'
			'table lineup settle';
	}
	.tile {
		min-height: 0;
		min-width: 0;
		overflow: hidden;
		border-radius: 18px;
		background: var(--tile);
		border: 1px solid var(--tile-line);
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.tile > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.expand {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 10px;
		color: var(--muted);
		cursor: pointer;
		font-size: 15px;
		transition:
			background 0.2s,
			color 0.2s,
			scale 0.2s;
	}
	.expand:hover,
	.expand:focus-visible {
		background: #ffffff14;
		color: var(--butter);
		scale: 1.08;
	}
	.empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: var(--muted);
		font-size: 13px;
	}
	.empty > span:first-child {
		font-size: 30px;
		color: var(--butter);
		opacity: 0.6;
	}

	/* Table tile */
	.table-tile {
		grid-area: table;
		padding: 16px;
		background:
			radial-gradient(ellipse at 50% 42%, #2f5a3d 0%, #1d3a28 60%, #172d20 100%) padding-box,
			var(--tile);
	}
	/* The felt keeps a table's proportions whatever the tile's shape. */
	.stage {
		flex: 1;
		min-height: 0;
		container-type: size;
		display: grid;
		place-items: center;
	}
	.felt {
		position: relative;
		width: min(100cqw - 64px, (100cqh - 56px) * 1.45);
		aspect-ratio: 1.45;
		border-radius: 50%;
		background: radial-gradient(ellipse at 50% 40%, #3b7350, #24493a 70%);
		box-shadow:
			inset 0 0 0 10px #5b3a22,
			inset 0 0 0 12px #2a1a10,
			inset 0 10px 40px #0007,
			0 18px 40px #0006;
		display: grid;
		place-items: center;
	}
	.felt-suits {
		font-size: 28px;
		letter-spacing: 0.4em;
		color: #ffffff30;
	}
	.felt-center {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		text-align: center;
	}
	.felt-center h2 {
		font-size: clamp(20px, 2.2vw, 30px);
		font-weight: 800;
	}
	.game-suit {
		font-size: 28px;
		color: var(--butter);
		line-height: 1;
	}
	.host {
		font-size: 12px;
		color: #ffffffa8;
	}
	/* Seats around the oval. */
	.seats {
		position: absolute;
		inset: 0;
	}
	.seat {
		--a: calc(var(--i) / var(--n) * 360deg + 90deg);
		position: absolute;
		left: calc(50% + cos(var(--a)) * 50%);
		top: calc(50% + sin(var(--a)) * 50%);
		translate: -50% -50%;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background: #1a1526;
		box-shadow: 0 0 0 3px #f2dc9166;
	}
	.seat.empty {
		background: #00000040;
		box-shadow: 0 0 0 2px #ffffff30;
		border: 2px dashed #ffffff33;
	}
	.bot-seat {
		font-size: 22px;
	}
	.fan {
		display: flex;
		--card-w: clamp(60px, 7vw, 92px);
	}
	.fan > span {
		width: var(--card-w);
		margin-inline: calc(var(--card-w) * -0.18);
		rotate: calc((var(--k, 0)) * 1deg);
		filter: drop-shadow(0 8px 10px #0006);
	}
	.fan > span:nth-child(1) {
		--k: -14;
		translate: 0 8px;
	}
	.fan > span:nth-child(3) {
		--k: 14;
		translate: 0 8px;
	}
	.chips-art {
		position: absolute;
		right: 14%;
		bottom: 12%;
		display: flex;
		gap: 4px;
	}
	.table-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 11px;
		border-radius: 100px;
		background: #00000038;
		font-size: 13px;
		font-weight: 600;
	}
	.chip.state.live {
		background: #a9cfb52e;
		color: #cfe8d6;
	}
	.primary {
		margin-left: auto;
		height: 42px;
		padding: 0 22px;
		border-radius: 100px;
		background: var(--butter);
		color: var(--night);
		font-weight: 800;
		font-size: 14px;
		cursor: pointer;
		transition:
			translate 0.2s,
			box-shadow 0.2s;
	}
	.primary:hover:not(:disabled),
	.primary:focus-visible {
		translate: 0 -2px;
		box-shadow: 0 4px 0 #0000004d;
	}
	.primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.dots {
		display: flex;
		justify-content: center;
		gap: 6px;
	}
	.dots button {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #ffffff40;
		cursor: pointer;
	}
	.dots button[aria-pressed='true'] {
		background: var(--butter);
		width: 22px;
		border-radius: 8px;
	}

	/* Podium */
	.podium-tile {
		grid-area: podium;
	}
	.podium {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		align-items: end;
		gap: 8px;
	}
	.step {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		min-width: 0;
		height: 100%;
		justify-content: flex-end;
	}
	.step strong {
		font-size: 13px;
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.step .net {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 15px;
		color: var(--butter);
	}
	.step .block {
		width: 100%;
		border-radius: 10px 10px 4px 4px;
		display: grid;
		place-items: start center;
		padding-top: 6px;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 20px;
		color: var(--night);
		background: var(--butter);
		height: calc(28px + var(--h, 0.3) * 30%);
		min-height: 30px;
	}
	.step.p1 .block {
		height: calc(44px + var(--h, 1) * 34%);
	}
	.step.p2 .block {
		background: #d8d2e3;
	}
	.step.p3 .block {
		background: #e0a47e;
	}
	.step.you strong {
		color: var(--butter);
	}
	.podium.skeleton i {
		display: block;
		height: 50%;
		border-radius: 10px;
		background: #ffffff10;
		align-self: end;
	}
	.podium.skeleton i:nth-child(2) {
		height: 75%;
	}
	.standings {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.standings li {
		display: grid;
		grid-template-columns: 22px 30px 1fr auto auto;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: 10px;
		font-size: 13px;
	}
	.standings li.you {
		background: #f2dc9118;
	}
	.place {
		font-family: var(--font-display);
		font-weight: 800;
		color: var(--muted);
		text-align: center;
	}
	.who {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mini {
		color: var(--muted);
		font-size: 12px;
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.sep {
		opacity: 0.5;
	}
	.standings .net {
		font-family: var(--font-display);
		font-weight: 800;
		color: var(--butter);
		min-width: 56px;
		text-align: right;
	}

	/* You */
	.you-tile {
		grid-area: you;
		flex-direction: row;
		align-items: center;
		gap: 16px;
	}
	.ring {
		--p: 0;
		flex: none;
		width: 84px;
		height: 84px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		background:
			radial-gradient(closest-side, var(--tile) 80%, transparent 81%),
			conic-gradient(var(--butter) calc(var(--p) * 1turn), #ffffff1a 0);
	}
	.you-tile {
		position: relative;
	}
	.you-head {
		position: absolute;
		left: 16px;
		top: 14px;
	}
	.you-tile .ring {
		margin-top: 18px;
	}
	.you-numbers {
		margin-top: 18px;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.big {
		font-family: var(--font-display);
		font-size: clamp(30px, 3vw, 42px);
		font-weight: 800;
		letter-spacing: -0.04em;
		line-height: 1;
		color: var(--color-success);
	}
	.unit {
		font-size: 12px;
		color: var(--muted);
		margin-bottom: 6px;
	}
	.pair {
		display: flex;
		gap: 12px;
		font-size: 14px;
		font-weight: 700;
	}
	.pair > span {
		display: inline-flex;
		gap: 4px;
	}
	.pair > span > span {
		color: var(--butter);
	}

	/* Last hand */
	.last-tile {
		grid-area: last;
	}
	.last {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.winner-suit {
		flex: none;
		width: 38px;
		height: 48px;
		border-radius: 7px;
		display: grid;
		place-items: center;
		background: var(--paper);
		color: var(--night);
		font-size: 22px;
		box-shadow: 0 4px 10px #0005;
	}
	.last > div {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.last strong {
		font-size: 15px;
	}
	.won {
		font-family: var(--font-display);
		font-weight: 800;
		color: var(--color-success);
		font-size: 18px;
	}
	.last time,
	.history time {
		margin-left: auto;
		font-size: 11px;
		color: var(--muted);
		white-space: nowrap;
	}
	.hand-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		overflow: hidden;
	}
	.hand-strip li {
		display: flex;
		gap: 5px;
		padding: 4px 9px;
		border-radius: 100px;
		background: #ffffff0d;
		font-size: 12px;
	}
	.hand-strip li b {
		color: var(--color-success);
	}
	.hand-strip li.negative b {
		color: #f6a596;
	}
	.hand-strip li.negative {
		color: inherit !important;
	}
	.hand-strip li.me {
		box-shadow: inset 0 0 0 1px #f2dc9166;
	}

	/* Settle */
	.settle-tile {
		grid-area: settle;
	}
	.settle {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.settle li {
		display: grid;
		grid-template-columns: 1fr auto 1fr auto;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.settle .from,
	.settle .to {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.settle .to {
		font-weight: 700;
	}
	.arrow {
		color: var(--butter);
		font-size: 16px;
	}
	.settle b {
		font-family: var(--font-display);
		color: var(--butter);
	}
	.foot {
		margin-top: auto;
		font-size: 11px;
		color: var(--muted);
	}

	/* Lineup */
	.lineup-tile {
		grid-area: lineup;
	}
	.lineup {
		display: flex;
		gap: 8px;
		flex: 1;
		min-height: 0;
	}
	.lineup li {
		flex: 1;
		min-width: 0;
		border-radius: 10px;
		background: var(--paper);
		color: var(--night);
		padding: 8px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 700;
		box-shadow: 0 6px 12px #0004;
		overflow: hidden;
	}
	.lineup li > span:last-child {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.lineup li.mystery {
		background: var(--butter);
	}
	.lineup .n {
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 800;
		color: var(--red);
	}
	.practice {
		align-self: flex-start;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border-radius: 100px;
		background: #ffffff14;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition:
			background 0.2s,
			translate 0.2s;
	}
	.practice:hover,
	.practice:focus-visible {
		background: var(--butter);
		color: var(--night);
		translate: 0 -1px;
	}

	/* Sheets: full lists, paged instead of scrolled. */
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: #0b0912b3;
		backdrop-filter: blur(3px);
	}
	.sheet {
		position: fixed;
		z-index: 41;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
		width: min(560px, calc(100vw - 24px));
		max-height: calc(100dvh - 40px);
		overflow: auto;
		border-radius: 20px;
		background: var(--surface);
		border: 1px solid var(--line);
		box-shadow: 0 30px 80px #0009;
		padding: 18px 20px 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		color: var(--paper);
		outline: none;
	}
	.sheet.wide {
		width: min(960px, calc(100vw - 24px));
	}
	.sheet > header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sheet h2 {
		font-size: 20px;
	}
	.close {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		font-size: 22px;
		cursor: pointer;
		background: #ffffff10;
	}
	.close:hover,
	.close:focus-visible {
		background: var(--butter);
		color: var(--night);
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		font-size: 13px;
		color: var(--muted);
	}
	.pager button {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		background: #ffffff10;
		cursor: pointer;
		color: var(--paper);
	}
	.pager button:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.pager button:hover:not(:disabled) {
		background: var(--butter);
		color: var(--night);
	}
	.fine {
		font-size: 11px;
		color: var(--muted);
		text-align: center;
	}
	.history {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.history li {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 10px;
		border-radius: 12px;
		background: #ffffff08;
	}
	.h-main {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.h-players {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 11px;
		color: var(--muted);
	}
	.h-players .me {
		color: var(--butter);
	}
	.friend-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px 10px;
	}
	.friend-grid li {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		text-align: center;
	}
	.friend-grid li:not(.here) > :global(:first-child) {
		opacity: 0.45;
		filter: grayscale(0.7);
	}
	.friend-grid strong {
		font-size: 13px;
	}
	.friend-grid span {
		font-size: 11px;
		color: var(--muted);
	}

	/* Tablets: two columns, still one screen. */
	@media (max-width: 1000px) {
		.board {
			grid-template-columns: 1.2fr 1fr;
			grid-template-rows: 1.3fr 1fr 1fr;
			grid-template-areas:
				'table podium'
				'you last'
				'lineup settle';
		}
	}
	/* Phones: composed for 390px. The table and four small tiles; the rest one tap away. */
	@media (max-width: 720px) {
		.club-room {
			gap: 10px;
			padding: 10px 12px 12px;
		}
		.crowd {
			gap: 10px;
			min-height: 52px;
		}
		.online {
			padding: 6px 10px;
		}
		.online > span:last-child {
			display: none;
		}
		.faces-row {
			gap: 8px;
		}
		.faces-row li {
			width: 40px;
		}
		.faces-row li > span {
			display: none;
		}
		.period button {
			padding: 6px 9px;
			font-size: 11px;
		}
		.board {
			gap: 10px;
			grid-template-columns: 1fr 1fr;
			grid-template-rows: 1.5fr 1fr 0.8fr 0.62fr;
			grid-template-areas:
				'table table'
				'podium you'
				'last settle'
				'lineup lineup';
		}
		.tile {
			padding: 10px 12px;
			border-radius: 16px;
			gap: 6px;
		}
		h2 {
			font-size: 13px;
		}
		.felt {
			width: min(100cqw - 56px, (100cqh - 44px) * 1.7);
			aspect-ratio: 1.7;
		}
		.seat {
			width: 38px;
			height: 38px;
		}
		.seat :global(*) {
			max-width: 34px;
			max-height: 34px;
		}
		.chip {
			padding: 4px 8px;
			font-size: 12px;
		}
		.primary {
			height: 38px;
			padding: 0 18px;
		}
		.podium-tile .standings {
			display: none;
		}
		.step strong {
			display: none;
		}
		.step .net {
			font-size: 12px;
		}
		.step .block {
			font-size: 14px;
			padding-top: 2px;
			min-height: 20px;
			height: calc(14px + var(--h, 0.3) * 18%);
		}
		.step.p1 .block {
			height: calc(22px + var(--h, 1) * 22%);
		}
		.step :global(img),
		.step :global(svg) {
			max-width: 34px;
			max-height: 34px;
		}
		.you-tile {
			flex-direction: column;
			gap: 6px;
			align-items: flex-start;
		}
		.ring {
			width: 54px;
			height: 54px;
			position: absolute;
			right: 10px;
			top: 10px;
		}
		.ring :global(*) {
			max-width: 36px;
			max-height: 36px;
		}
		.you-tile {
			position: relative;
			justify-content: flex-end;
		}
		.big {
			font-size: 26px;
		}
		.pair {
			gap: 8px;
			font-size: 12px;
		}
		.last {
			gap: 8px;
		}
		.winner-suit {
			width: 28px;
			height: 36px;
			font-size: 16px;
		}
		.last time,
		.hand-strip {
			display: none;
		}
		.won {
			font-size: 15px;
		}
		.settle li {
			grid-template-columns: 1fr auto 1fr;
			font-size: 11px;
		}
		.settle b {
			grid-column: 1 / -1;
			font-size: 12px;
		}
		.settle li:nth-child(n + 2) {
			display: none;
		}
		.lineup-tile {
			flex-direction: row;
			align-items: center;
		}
		.lineup-tile > header {
			display: none;
		}
		.lineup li {
			padding: 5px 7px;
			font-size: 11px;
		}
		.lineup .n {
			font-size: 14px;
		}
		.practice {
			align-self: center;
			padding: 10px 14px;
		}
		.friend-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (max-width: 720px) and (max-height: 700px) {
		.board {
			grid-template-rows: 1.7fr 1fr 0.8fr 0.56fr;
		}
		.felt {
			width: min(100cqw - 40px, (100cqh - 34px) * 2);
			aspect-ratio: 2;
		}
		.seat {
			width: 30px;
			height: 30px;
		}
		.seat :global(*) {
			max-width: 26px;
			max-height: 26px;
		}
		.felt-center h2 {
			font-size: 16px;
		}
		.game-suit,
		.host,
		.settle-tile .foot,
		.dots {
			display: none;
		}
		.step .block,
		.step.p1 .block {
			height: 16px;
			min-height: 16px;
			padding: 0;
			font-size: 11px;
		}
		.step :global(img),
		.step :global(svg) {
			max-width: 28px;
			max-height: 28px;
		}
		.you-tile .pair {
			display: none;
		}
		.tile > header,
		.you-head {
			font-size: 12px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.online,
		.expand,
		.primary,
		.practice {
			transition: none;
			translate: none;
			scale: none;
		}
	}
</style>
