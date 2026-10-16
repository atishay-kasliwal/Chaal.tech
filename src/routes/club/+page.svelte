<script lang="ts">
	import { goto } from '$app/navigation';
	import ClubGate from '#lib/club/ClubGate.svelte';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import { club } from '#lib/club/club.svelte.js';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { openStart } from '#lib/start/start-modal.svelte.js';

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
	let tab = $state<'tonight' | 'leaderboard' | 'history' | 'friends'>('tonight');
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

	async function load() {
		try {
			const response = await socket.authorizedFetch('/club');
			const body = await response.json();
			if (!response.ok) throw new Error(body.error);
			members = body.members;
			online = body.online;
			tables = body.tables;
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
</script>

<svelte:head><title>The club · Chaal</title></svelte:head>

{#snippet leaders(limit: number, offset = 0)}
	<ol class="standings">
		{#each standings.slice(offset, offset + limit) as entry (entry.rank)}
			<li class:you={entry.isYou}>
				<span class="place">{entry.rank < 4 ? ['Ⅰ', 'Ⅱ', 'Ⅲ'][entry.rank - 1] : entry.rank}</span>
				<CharacterAvatar characterId={entry.characterId} size={36} />
				<div class="standing-name">
					<strong>{entry.nickname}{entry.isYou ? ' · You' : ''}</strong><small
						>{entry.wins} wins · {entry.hands} hands</small
					>
				</div>
				<strong class="score" class:negative={entry.net < 0}>{chips(entry.net)}</strong>
			</li>
		{/each}
	</ol>
{/snippet}

<ClubGate>
	<div class="club-room">
		<header class="welcome">
			<div>
				<p class="eyebrow">Your people. Your table.</p>
				<h1>Hey {club.member?.nickname}<span class="gold">.</span></h1>
			</div>
			<button class="online-pill" onclick={() => (tab = 'friends')}
				><span class="live-dot"></span>{online.length} online
				<span aria-hidden="true">↗</span></button
			>
		</header>

		<div class="personal-record" aria-label="Your record for the selected period">
			<div>
				<span>Your net winnings</span><strong class:negative={personal.net < 0}
					>{historyLoaded && !historyError && !historyBusy ? chips(personal.net) : '-'}
					<small>chips</small></strong
				>
			</div>
			<div>
				<span>Hands won</span><strong
					>{historyLoaded && !historyError && !historyBusy ? personal.wins : '-'}</strong
				>
			</div>
			<div>
				<span>Hands played</span><strong
					>{historyLoaded && !historyError && !historyBusy ? personal.hands : '-'}</strong
				>
			</div>
			<div class="record-period">
				<label for="record-period">Club record</label><select
					id="record-period"
					value={period}
					onchange={(event) => filterHistory(event.currentTarget.value)}
					><option value="all">All time</option><option value="month">This month</option><option
						value="today">Today</option
					></select
				>
			</div>
		</div>

		{#if error}<div class="notice" role="alert">
				{error} <button onclick={load}>Retry lobby</button>
			</div>{/if}
		{#if historyError}<div class="notice" role="alert">
				Records unavailable. <button onclick={loadHistory}>Retry records</button>
			</div>{/if}

		<div class="room-content" class:tonight={tab === 'tonight'}>
			{#if tab === 'tonight'}
				<section class="panel table-panel" aria-label="Tonight’s table">
					<div class="panel-heading">
						<p class="eyebrow">{featured ? 'The night is young' : 'Make a night of it'}</p>
						<button class="text-button" onclick={openStart}>+ Start a table</button>
					</div>
					{#if !loaded}
						<div class="empty-state" aria-busy="true">
							<span class="suit-mark">♠</span>
							<h2>Opening the card room…</h2>
						</div>
					{:else if error && !featured}
						<div class="empty-state">
							<h2>The room is taking a moment</h2>
							<p>Try reconnecting to see your friends’ tables.</p>
							<button class="primary" onclick={load}>Try again</button>
						</div>
					{:else if featured}
						{@const mine = featured.connectedMembers.includes(club.member?.memberId ?? '')}
						{@const full = seatsLeft(featured) <= 0 && !mine}
						<div class="table-scene">
							<div class="felt-table">
								<span class="table-suits" aria-hidden="true">♠ ♥ ♣ ♦</span>
								<h2>{gameName[featured.gameType] ?? 'Cards with friends'}</h2>
								<p>
									{featured.hostName
										? `${featured.hostName}’s table`
										: 'A seat with your name on it'}
								</p>
								<div class="faces">
									{#each featured.connectedMembers.slice(0, 6) as id (id)}{@const friend =
											members.find((member) => member.memberId === id)}<CharacterAvatar
											memberId={friend?.memberId}
											characterId={friend?.characterId}
											size={38}
											label={nameOf(id)}
										/>{/each}
								</div>
							</div>
							<p class="table-meta">
								{featured.playerCount}/{featured.maxPlayers} seated{featured.botCount
									? ` · ${featured.botCount} bots`
									: ''} · {featured.isStarted ? 'Hand in progress' : 'Between hands'}
							</p>
							<button class="primary" disabled={full} onclick={() => goto(`/${featured.name}`)}
								>{full ? 'Table full' : mine ? 'Back to your seat' : 'Join the table'}
								<span aria-hidden="true">↗</span></button
							>
							{#if featured.isStarted && !full && !mine}<p class="muted tiny">
									Your seat opens with the next hand.
								</p>{/if}
						</div>
						{#if tables.length > 1}<div class="pager">
								<button
									aria-label="Previous table"
									onclick={() => (tablePage = (tablePage - 1 + tables.length) % tables.length)}
									>←</button
								><span>Table {Math.min(tablePage + 1, tables.length)} of {tables.length}</span
								><button
									aria-label="Next table"
									onclick={() => (tablePage = (tablePage + 1) % tables.length)}>→</button
								>
							</div>{/if}
					{:else}
						<div class="empty-state">
							<span class="suit-mark" aria-hidden="true">♠</span>
							<h2>Someone has to deal first.</h2>
							<p>
								Your friends, a little bakwaas, one more hand.<br />Start a table and they’ll see it
								here.
							</p>
							<button class="primary" onclick={openStart}
								>Deal us in <span aria-hidden="true">↗</span></button
							>
						</div>
					{/if}
				</section>
				<aside class="panel hall-of-fame">
					<div class="panel-heading">
						<div>
							<p class="eyebrow">A little friendly competition</p>
							<h2>The leaderboard</h2>
						</div>
						<span class="trophy" aria-hidden="true">♛</span>
					</div>
					{#if historyBusy && !historyLoaded}<p class="muted">
							Opening the record book…
						</p>{:else if standings.length}{@render leaders(3)}{:else if !historyError}<div
							class="empty-record"
						>
							<span aria-hidden="true">♧</span>
							<h3>Legends start somewhere.</h3>
							<p>The first finished game with friends starts the leaderboard.</p>
						</div>{/if}
					<button class="text-button view-record" onclick={() => (tab = 'leaderboard')}
						>See the club record <span aria-hidden="true">→</span></button
					>
				</aside>
			{:else if tab === 'leaderboard'}
				<section class="panel record-panel" aria-labelledby="leader-title" aria-busy={historyBusy}>
					<div class="panel-heading">
						<div>
							<p class="eyebrow">Bragging rights, earned</p>
							<h2 id="leader-title">The club leaderboard</h2>
						</div>
						<span class="record-count">Net chips won</span>
					</div>
					{#if historyBusy}<p class="muted" role="status">
							Updating the record book…
						</p>{:else if standings.length}{@render leaders(5, leaderPage * 5)}
						<div class="pager">
							<button disabled={leaderPage === 0} onclick={() => leaderPage--}>← Previous</button
							><span>{leaderPage + 1} / {Math.ceil(standings.length / 5)}</span><button
								disabled={(leaderPage + 1) * 5 >= standings.length}
								onclick={() => leaderPage++}>Next →</button
							>
						</div>{:else if !historyError}<div class="empty-state">
							<span class="suit-mark">♛</span>
							<h2>A fresh page in the record book.</h2>
							<p>Finish a game with friends to put your name here.</p>
						</div>{/if}
					<p class="record-note">
						Ranked by net chips won. Chip gifts and top-ups don’t count. Practice with bots stays
						off the board.
					</p>
				</section>
			{:else if tab === 'history'}
				<section class="panel record-panel" aria-labelledby="history-title" aria-busy={historyBusy}>
					<div class="panel-heading">
						<div>
							<p class="eyebrow">Remember that hand?</p>
							<h2 id="history-title">The record book</h2>
						</div>
						<span class="record-count">{historyTotal} finished hands</span>
					</div>
					{#if historyBusy}<p class="muted" role="status">
							Opening the record book…
						</p>{:else if pastHands.length}<div class="history-list">
							{#each pastHands as hand (hand.id)}<article class="past-hand">
									<div class="hand-heading">
										<strong>{hand.winnerName} <span class="muted">won</span></strong><time
											datetime={new Date(hand.completedAt).toISOString()}
											>{when(hand.completedAt)}</time
										>
									</div>
									<p class="hand-game">
										{gameName[hand.gameType] ?? hand.gameType} · {hand.amount.toLocaleString(
											'en-IN'
										)} chips awarded
									</p>
									<div class="hand-results">
										{#each hand.players as player, index (index)}<span
												class:my-result={player.isYou}
												>{player.isYou ? 'You' : player.nickname}
												<b class:negative={player.net < 0}>{chips(player.net)}</b></span
											>{/each}
									</div>
								</article>{/each}
						</div>
						<div class="pager">
							<button disabled={historyPage === 0} onclick={() => turnHistory(-1)}
								>← Previous</button
							><span>Page {historyPage + 1}</span><button
								disabled={!hasMoreHistory}
								onclick={() => turnHistory(1)}>Next →</button
							>
						</div>{:else if !historyError}<div class="empty-state">
							<span class="suit-mark">♢</span>
							<h2>Good nights become good stories.</h2>
							<p>Completed hands with friends will be saved here.</p>
						</div>{/if}
					<p class="record-note">
						New records begin with this feature. Dates and calendar filters use India time (IST).
					</p>
				</section>
			{:else}
				<section class="panel record-panel" aria-labelledby="friends-title">
					<div class="panel-heading">
						<div>
							<p class="eyebrow">The usual suspects</p>
							<h2 id="friends-title">Your people</h2>
						</div>
						<span class="record-count">{members.length} members</span>
					</div>
					<ul class="friend-list">
						{#each roster.slice(friendPage * 5, friendPage * 5 + 5) as friend (friend.memberId)}<li>
								<CharacterAvatar
									memberId={friend.memberId}
									characterId={friend.characterId}
									size={44}
									status={atTable.has(friend.memberId)
										? 'table'
										: online.includes(friend.memberId)
											? 'online'
											: undefined}
								/><strong>{friend.nickname}</strong><span class="friend-status"
									>{atTable.has(friend.memberId)
										? 'At the table'
										: online.includes(friend.memberId)
											? 'Online'
											: friend.joined === false
												? 'Invited · not joined yet'
												: 'Away'}</span
								>
							</li>{/each}
					</ul>
					<div class="pager">
						<button disabled={friendPage === 0} onclick={() => friendPage--}>← Previous</button
						><span
							>{Math.min(friendPage * 5 + 1, members.length)}–{Math.min(
								(friendPage + 1) * 5,
								members.length
							)} of {members.length}</span
						><button disabled={(friendPage + 1) * 5 >= members.length} onclick={() => friendPage++}
							>Next →</button
						>
					</div>
				</section>
			{/if}
		</div>
		<footer class="club-footer">
			<nav aria-label="Club views">
				{#each [{ id: 'tonight' as const, label: 'Tonight', icon: '♠' }, { id: 'leaderboard' as const, label: 'Leaderboard', icon: '♛' }, { id: 'history' as const, label: 'History', icon: '◷' }, { id: 'friends' as const, label: 'Friends', icon: '♧' }] as view (view.id)}<button
						class:active={tab === view.id}
						aria-current={tab === view.id ? 'page' : undefined}
						onclick={() => (tab = view.id)}
						><span aria-hidden="true">{view.icon}</span>{view.label}</button
					>{/each}
			</nav>
			<p>Cards out. One more hand.</p>
		</footer>
	</div>
</ClubGate>

<style>
	.club-room {
		position: relative;
		isolation: isolate;
		display: flex;
		flex-direction: column;
		gap: clamp(0.7rem, 1.8vh, 1.3rem);
		height: calc(100dvh - 72px);
		min-height: 560px;
		padding: clamp(1rem, 2.5vw, 2.5rem) max(1rem, calc((100vw - 1240px) / 2));
		color: #f1ebdc;
	}
	.club-room::before {
		content: '';
		position: absolute;
		z-index: -1;
		inset: -72px 0 0;
		background:
			linear-gradient(90deg, rgb(4 13 10 / 94%), rgb(5 16 12 / 82%) 55%, rgb(6 15 12 / 88%)),
			url('/email/invite-table.jpg') center / cover;
	}
	.welcome,
	.panel-heading,
	.hand-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	h1 {
		font-size: clamp(1.6rem, 3vw, 2.4rem);
		font-weight: 650;
		letter-spacing: -0.04em;
	}
	h2 {
		font-size: clamp(1.2rem, 2vw, 1.65rem);
		font-weight: 600;
		letter-spacing: -0.025em;
	}
	h3 {
		font-size: 1.1rem;
		font-weight: 600;
	}
	.eyebrow {
		color: #d5b67a;
		font-size: 0.64rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		margin-bottom: 0.35rem;
	}
	.gold,
	.score {
		color: #e7c784;
	}
	.muted,
	.table-meta {
		color: #b1b9ae;
	}
	.tiny {
		font-size: 0.72rem;
	}
	button {
		cursor: pointer;
	}
	button:disabled {
		cursor: default;
		opacity: 0.4;
	}
	button:focus-visible,
	select:focus-visible {
		outline: 2px solid #e7c784;
		outline-offset: 4px;
	}
	.online-pill {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		white-space: nowrap;
		border: 1px solid #ffffff20;
		border-radius: 999px;
		padding: 0.6rem 0.85rem;
		font-size: 0.75rem;
		background: #ffffff06;
	}
	.live-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: #87bf93;
		box-shadow: 0 0 10px #87bf9344;
	}
	.personal-record {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1fr 1fr;
		gap: 1rem;
		border-block: 1px solid #e7c78424;
		padding: 0.85rem 0;
	}
	.personal-record > div {
		display: grid;
		align-content: center;
		gap: 0.25rem;
	}
	.personal-record span,
	.record-period label {
		font-size: 0.68rem;
		color: #b1b9ae;
	}
	.personal-record strong {
		font-size: clamp(1.25rem, 2vw, 1.8rem);
		font-weight: 500;
		color: #e7c784;
	}
	.personal-record small {
		font-size: 0.68rem;
		color: #b1b9ae;
		font-weight: 400;
	}
	.record-period {
		justify-self: end;
	}
	select {
		background: #10221a;
		border: 1px solid #ffffff24;
		color: #f1ebdc;
		border-radius: 0.5rem;
		padding: 0.35rem 0.6rem;
		font-size: 0.8rem;
	}
	.room-content {
		display: grid;
		flex: 1;
		min-height: 0;
	}
	.room-content.tonight {
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
		gap: 1.25rem;
	}
	.panel {
		border: 1px solid #e7c78424;
		border-radius: 1.4rem;
		background: linear-gradient(145deg, #14281ee8, #091810ee);
		padding: clamp(1rem, 2vw, 1.7rem);
		min-height: 0;
	}
	.table-panel,
	.record-panel,
	.hall-of-fame {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.text-button {
		font-size: 0.75rem;
		color: #e7c784;
		white-space: nowrap;
	}
	.table-scene {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.7rem;
		flex: 1;
		min-height: 0;
	}
	.felt-table {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: min(100%, 390px);
		padding: 1.2rem;
		border: 5px solid #3f3525;
		border-radius: 100px;
		background: radial-gradient(ellipse, #28583b, #163b29 80%);
		box-shadow:
			0 0 0 1px #b99a5e66,
			inset 0 0 30px #0005,
			0 15px 30px #0003;
		text-align: center;
	}
	.table-suits {
		color: #e7c78488;
		letter-spacing: 0.7em;
		font-size: 0.8rem;
	}
	.felt-table p {
		color: #ced3c5;
		font-size: 0.75rem;
	}
	.faces {
		display: flex;
		gap: 0.3rem;
		min-height: 38px;
	}
	.table-meta {
		font-size: 0.75rem;
		text-align: center;
	}
	.primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		border-radius: 999px;
		padding: 0.7rem 1.6rem;
		background: linear-gradient(120deg, #efdbab, #cda75e);
		color: #211a0d;
		font-size: 0.85rem;
		font-weight: 650;
		box-shadow: 0 6px 20px #0003;
	}
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.8rem;
		text-align: center;
		padding: 0.8rem;
	}
	.empty-state p,
	.empty-record p {
		color: #b1b9ae;
		font-size: 0.85rem;
		line-height: 1.6;
		max-width: 25rem;
	}
	.suit-mark {
		font-size: 2.7rem;
		line-height: 1;
		color: #c5a365;
	}
	.trophy {
		font-size: 2rem;
		color: #d5b67a;
	}
	.standings {
		display: grid;
		gap: 0.4rem;
		margin-block: auto;
	}
	.standings li {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 0.65rem 0.4rem;
		border-bottom: 1px solid #ffffff0d;
	}
	.standings li.you {
		background: #e7c7840a;
		border-radius: 0.65rem;
	}
	.place {
		width: 1.4rem;
		text-align: center;
		color: #d5b67a;
		font-size: 0.9rem;
	}
	.standing-name {
		flex: 1;
		min-width: 0;
		display: grid;
		gap: 0.2rem;
	}
	.standing-name strong {
		font-size: 0.85rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.standing-name small {
		font-size: 0.65rem;
		color: #b1b9ae;
	}
	.score {
		font-size: 0.9rem;
		white-space: nowrap;
	}
	.negative {
		color: #e9a99d !important;
	}
	.empty-record {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		gap: 0.6rem;
		text-align: center;
	}
	.empty-record > span {
		font-size: 2.5rem;
		color: #d5b67a;
	}
	.view-record {
		border-top: 1px solid #ffffff12;
		padding-top: 0.85rem;
		display: flex;
		justify-content: space-between;
	}
	.record-count {
		color: #b1b9ae;
		font-size: 0.72rem;
		white-space: nowrap;
	}
	.record-panel {
		max-width: 900px;
		width: 100%;
		margin-inline: auto;
	}
	.record-note {
		color: #9aa998;
		font-size: 0.65rem;
		line-height: 1.5;
	}
	.pager {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: auto;
		color: #b1b9ae;
		font-size: 0.72rem;
	}
	.pager button {
		padding: 0.35rem 0.5rem;
		color: #e7c784;
	}
	.history-list {
		display: grid;
		gap: 0.65rem;
		margin-block: auto;
	}
	.past-hand {
		padding-bottom: 0.65rem;
		border-bottom: 1px solid #ffffff12;
	}
	.hand-heading strong {
		font-size: 0.85rem;
	}
	.hand-heading time {
		color: #b1b9ae;
		font-size: 0.65rem;
		white-space: nowrap;
	}
	.hand-game {
		color: #b1b9ae;
		font-size: 0.68rem;
		margin-block: 0.25rem;
	}
	.hand-results {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem 0.8rem;
		font-size: 0.68rem;
		color: #b1b9ae;
	}
	.hand-results b {
		color: #e7c784;
		font-weight: 500;
	}
	.my-result {
		color: #f1ebdc;
	}
	.friend-list {
		display: grid;
		gap: 0.5rem;
		margin-block: auto;
	}
	.friend-list li {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.4rem;
	}
	.friend-list strong {
		font-size: 0.9rem;
	}
	.friend-status {
		margin-left: auto;
		font-size: 0.75rem;
		color: #b1b9ae;
	}
	.club-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.club-footer nav {
		display: flex;
		gap: 0.35rem;
		padding: 0.3rem;
		border: 1px solid #ffffff14;
		border-radius: 999px;
		background: #07160dde;
	}
	.club-footer nav button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.9rem;
		border-radius: 999px;
		color: #b1b9ae;
		font-size: 0.75rem;
	}
	.club-footer nav button[aria-current='page'] {
		background: #d6b779;
		color: #172016;
	}
	.club-footer p {
		font-size: 0.75rem;
		color: #9aa998;
	}
	.notice {
		color: #ffd9cf;
		font-size: 0.8rem;
	}
	.notice button {
		text-decoration: underline;
		margin-left: 0.5rem;
	}
	@media (max-width: 800px) {
		.room-content.tonight {
			grid-template-columns: 1fr;
		}
		.hall-of-fame {
			display: none;
		}
		.club-footer {
			justify-content: center;
		}
		.club-footer p {
			display: none;
		}
		.club-room::before {
			background-image: linear-gradient(#06100bea, #06100be0), url('/email/invite-table-phone.jpg');
		}
	}
	@media (max-width: 480px) {
		.club-room {
			gap: 0.7rem;
			padding: 0.85rem 0.85rem max(0.75rem, env(safe-area-inset-bottom));
		}
		.personal-record {
			grid-template-columns: 1.2fr 0.7fr 0.7fr;
			gap: 0.6rem;
			padding-block: 0.6rem;
		}
		.record-period {
			grid-column: 1 / -1;
			display: flex !important;
			align-items: center;
			justify-content: space-between;
			width: 100%;
		}
		.personal-record strong {
			font-size: 1.3rem;
		}
		.panel {
			padding: 1rem;
			border-radius: 1rem;
		}
		.panel-heading {
			gap: 0.5rem;
		}
		.panel-heading .eyebrow {
			font-size: 0.55rem;
		}
		.club-footer nav {
			width: 100%;
			justify-content: space-around;
		}
		.club-footer nav button {
			flex-direction: column;
			gap: 0.1rem;
			padding: 0.4rem 0.65rem;
			font-size: 0.65rem;
		}
		.club-footer nav button span {
			font-size: 1rem;
		}
		.hand-heading {
			align-items: start;
			gap: 0.3rem;
		}
		.hand-heading strong {
			font-size: 0.75rem;
		}
		.hand-heading time {
			font-size: 0.6rem;
		}
		.standings li {
			gap: 0.4rem;
			padding-block: 0.45rem;
		}
	}
	@media (max-height: 700px) {
		.club-room {
			height: auto;
			min-height: calc(100dvh - 72px);
		}
		.room-content {
			min-height: 330px;
		}
	}
</style>
