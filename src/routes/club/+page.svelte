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

	const atTable = $derived(new Set(tables.flatMap((table) => table.connectedMembers)));
	const featured = $derived(tables.find((table) => table.connectedMembers.length) ?? tables[0]);
	const others = $derived(tables.filter((table) => table !== featured));
	const roster = $derived(
		[...members].sort(
			(a, b) => rank(b.memberId) - rank(a.memberId) || a.nickname.localeCompare(b.nickname)
		)
	);
	const nameOf = (id: string) =>
		members.find((member) => member.memberId === id)?.nickname ?? 'A friend';
	function rank(id: string) {
		return atTable.has(id) ? 2 : online.includes(id) ? 1 : 0;
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
		const refresh = () => void heartbeat().then(load);
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

<ClubGate>
	<div class="lobby">
		<header>
			<CharacterAvatar characterId={club.member?.characterId} size={56} />
			<div>
				<p class="eyebrow">Game night</p>
				<h1>Hey {club.member?.nickname}</h1>
			</div>
		</header>

		{#if !loaded}
			<section class="table-card skeleton" aria-busy="true">
				<p>Looking for an open table…</p>
			</section>
		{:else if featured}
			{@const full = seatsLeft(featured) <= 0}
			<section class="table-card" aria-label="Featured table">
				<p class="eyebrow">
					{featured.connectedMembers.length ? 'Happening now' : 'Open table'}
				</p>
				<h2>
					{gameName[featured.gameType] ?? 'Table'}{featured.hostName
						? ` · ${featured.hostName}’s table`
						: ''}
				</h2>
				<p class="meta">
					{featured.playerCount}/{featured.maxPlayers} seated{featured.botCount
						? ` (${featured.botCount} bots)`
						: ''}{featured.boot ? ` · boot ₹${featured.boot}` : ''} · {featured.isStarted
						? 'hand in progress'
						: 'between hands'}
				</p>
				{#if featured.connectedMembers.length}
					<div class="faces" aria-label="At this table">
						{#each featured.connectedMembers as id (id)}
							{@const friend = members.find((member) => member.memberId === id)}
							<CharacterAvatar characterId={friend?.characterId} size={32} label={nameOf(id)} />
						{/each}
					</div>
				{/if}
				<button class="primary" disabled={full} onclick={() => goto(`/${featured.name}`)}
					>{full
						? 'Full'
						: featured.connectedMembers.includes(club.member?.memberId ?? '')
							? 'Back to your seat'
							: 'Join the table'}</button
				>
				{#if featured.isStarted && !full}<p class="meta">
						You’ll be seated for the next hand.
					</p>{/if}
			</section>
		{:else}
			<section class="table-card empty">
				<h2>No table yet tonight</h2>
				<p class="meta">Start one and your friends will see it here.</p>
				<button class="primary" onclick={openStart}>Start a table</button>
			</section>
		{/if}

		{#if error}<p class="notice" role="alert">
				{error} <button class="link" onclick={load}>Retry</button>
			</p>{/if}

		{#if others.length}
			<section aria-label="Other tables">
				<h3>Other tables</h3>
				<ul class="others">
					{#each others as table (table.name)}
						<li>
							<a href="/{table.name}">
								<span
									>{gameName[table.gameType] ?? 'Table'}{table.hostName
										? ` · ${table.hostName}`
										: ''}</span
								>
								<small
									>{seatsLeft(table) <= 0
										? 'Full'
										: `${table.playerCount}/${table.maxPlayers}`}</small
								>
							</a>
						</li>
					{/each}
				</ul>
				<button class="link" onclick={openStart}>Start another table</button>
			</section>
		{/if}

		{#if roster.length}
			<section aria-label="The club">
				<h3>The club</h3>
				<ul class="friends">
					{#each roster as friend (friend.memberId)}
						<li>
							<CharacterAvatar
								characterId={friend.characterId}
								size={40}
								status={atTable.has(friend.memberId)
									? 'table'
									: online.includes(friend.memberId)
										? 'online'
										: undefined}
							/>
							<span>{friend.nickname}</span>
							<small
								>{atTable.has(friend.memberId)
									? 'At the table'
									: online.includes(friend.memberId)
										? 'Online'
										: ''}</small
							>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
</ClubGate>

<style>
	.lobby {
		display: grid;
		gap: 1.4rem;
		margin: 0 auto;
		max-width: 34rem;
		padding: 1.5rem 0.5rem 3rem;
		color: #f1ebdc;
	}
	header {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	h1 {
		font-size: 1.7rem;
		font-weight: 700;
	}
	h2 {
		font-size: 1.3rem;
		font-weight: 700;
	}
	h3 {
		margin-bottom: 0.6rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.85rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.eyebrow {
		color: #e2b862;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.table-card {
		display: grid;
		gap: 0.6rem;
		border: 1px solid rgb(240 209 140 / 20%);
		border-radius: 1.4rem;
		background: radial-gradient(ellipse at 50% 0%, rgb(46 125 80 / 45%), transparent 70%), #0f2219;
		padding: 1.3rem;
	}
	.skeleton {
		min-height: 11rem;
		place-items: center;
		color: rgb(241 235 220 / 60%);
	}
	.meta {
		color: rgb(241 235 220 / 70%);
		font-size: 0.9rem;
	}
	.faces {
		display: flex;
		gap: 0.35rem;
	}
	.primary {
		margin-top: 0.3rem;
		border-radius: 999px;
		background: linear-gradient(#f0d18c, #c9963d);
		padding: 0.85rem 1rem;
		color: #1c1406;
		font-weight: 700;
	}
	.primary:disabled {
		background: rgb(255 255 255 / 12%);
		color: rgb(241 235 220 / 60%);
	}
	.notice {
		color: #ffd9cf;
		font-size: 0.9rem;
	}
	.link {
		color: #e2b862;
		text-decoration: underline;
	}
	.others {
		display: grid;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.others a {
		display: flex;
		justify-content: space-between;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 5%);
		padding: 0.7rem 0.9rem;
	}
	.friends {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
		gap: 0.8rem;
	}
	.friends li {
		display: grid;
		justify-items: center;
		gap: 0.25rem;
		text-align: center;
	}
	.friends small {
		min-height: 1em;
		color: rgb(241 235 220 / 60%);
		font-size: 0.75rem;
	}
</style>
