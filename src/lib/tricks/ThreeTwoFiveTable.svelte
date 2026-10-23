<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import TrickTableShell, { type ShellSeat } from './TrickTableShell.svelte';
	import TrickLobby from './TrickLobby.svelte';
	import TrickPlay from './TrickPlay.svelte';
	import TrickHand from './TrickHand.svelte';

	import type { Suit, Card, TrickRoom as Room } from './types.js';

	let {
		room,
		selfId,
		connected,
		seated,
		send,
		onLeave,
		onInvite
	}: {
		room: Room;
		selfId: string;
		connected: boolean;
		seated: boolean;
		send: (event: string, args?: unknown[]) => Promise<boolean>;
		onLeave: () => void;
		onInvite: () => void;
	} = $props();

	const SUIT = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' } as const;
	const SUITS: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
	const red = (s: string) => s === 'hearts' || s === 'diamonds';
	const range = (n: number) => Array.from({ length: n }, (_, i) => i);
	const same = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

	const users = $derived(room.usersList);
	const me = $derived(users.find((u) => u.id === selfId));
	const user = (id: string | null | undefined) => users.find((u) => u.id === id);
	const playing = $derived(room.isStarted && !room.gameShow);
	const myTurn = $derived(playing && room.currentPlayerId === selfId);
	let busy = $state(false);

	const act = async (event: string, args: unknown[]) => {
		if (busy) return;
		busy = true;
		try {
			await send(event, args);
		} finally {
			busy = false;
		}
	};
	const trick = (action: string, payload: Record<string, unknown>) =>
		act('trickAction', [action, payload]);
	const legalPlay = (c: Card) => room.legalActions.play.some((x) => same(x, c));
	const legalGive = (c: Card) => room.legalActions.give.some((x) => same(x, c));
	const clickCard = (c: Card) => {
		if (legalPlay(c)) void trick('play', { card: c });
		else if (legalGive(c)) void trick('give', { card: c });
	};
	const pips = (id: string) => {
		const q = room.quotas[id] ?? 0;
		const t = room.tricks[id] ?? 0;
		return Array.from({ length: Math.max(q, t) }, (_, k) =>
			k < t ? (k < q ? 'made' : 'extra') : 'need'
		);
	};
	const status = $derived.by(() => {
		if (!playing) return '';
		const who = user(room.currentPlayerId);
		const name = room.currentPlayerId === selfId ? 'You' : (who?.username ?? 'Someone');
		if (room.stage === 'trump')
			return myTurn ? 'Choose trump from your first five cards' : `${name} is choosing trump`;
		if (room.stage === 'pull' && room.pull) {
			const v = room.pull.victim === selfId ? 'you' : user(room.pull.victim)?.username;
			if (room.pull.step === 'take')
				return myTurn ? `Pull a face-down card from ${v}` : `${name} is pulling a card from ${v}`;
			return myTurn ? `Return a card to ${v}` : `${name} is returning a card`;
		}
		return myTurn
			? room.trick?.plays.length
				? 'Your turn: follow suit if you can'
				: 'Your lead'
			: `${name} to play`;
	});
	const lastTrick = $derived(room.history.at(-1));
	const shownTrick = $derived(
		room.trick?.plays.length ? room.trick.plays : (lastTrick?.plays ?? [])
	);
	const shownWinner = $derived(room.trick?.plays.length ? null : (lastTrick?.winner ?? null));
	const pullsNext = $derived.by(() => {
		if (!room.lastRound) return [];
		const over = Object.entries(room.lastRound).filter(([, d]) => d > 0);
		const under = Object.entries(room.lastRound).filter(([, d]) => d < 0);
		return over.flatMap(([id, d]) => under.map(([v]) => ({ id, v, d })));
	});
	const shellSeats: ShellSeat[] = $derived(
		users.map((u) => ({
			id: u.id,
			seatNumber: u.seatNumber ?? 0,
			name: u.id === selfId ? 'You' : u.username,
			isBot: u.isBot,
			mascotId: u.mascotId,
			tags: room.dealerId === u.id ? ['Dealer'] : [],
			sub: room.quotas[u.id]
				? `${room.tricks[u.id] ?? 0}/${room.quotas[u.id]}`
				: room.round
					? `${(room.scores[u.id] ?? 0) > 0 ? '+' : ''}${room.scores[u.id] ?? 0}`
					: undefined,
			cardCount: playing ? u.cardCount : 0,
			active: playing && room.currentPlayerId === u.id,
			away: !u.isBot && !u.connected
		}))
	);
	const info = $derived([
		...(room.round ? [{ text: `Round ${room.round}` }] : []),
		...(room.trump
			? [
					{
						text: `Trump ${SUIT[room.trump]}`,
						tone: red(room.trump) ? ('red' as const) : ('gold' as const)
					}
				]
			: [])
	]);
</script>

<TrickTableShell
	title="3 2 5"
	focusedHand
	{info}
	{status}
	seats={shellSeats}
	{selfId}
	{connected}
	{seated}
	{onLeave}
	{onInvite}
>
	{#snippet center(placeOf)}
		{#if room.stage === 'pull' && room.pull && myTurn && room.pull.step === 'take'}
			<div class="facedown" role="group" aria-label="Face-down cards to pull from">
				{#each range(room.legalActions.pull) as position (position)}
					<button
						class="fd"
						disabled={busy}
						onclick={() => trick('pull', { position })}
						aria-label="Pull card {position + 1}"
						><DeckCard faceDown class="!h-20 !w-auto" /></button
					>
				{/each}
			</div>
		{:else if room.stage === 'pull' && room.pull?.taken && myTurn}
			<div class="panel">
				<p>You pulled</p>
				<DeckCard
					rank={room.pull.taken.rank}
					suit={room.pull.taken.suit as Suit}
					class="!h-24 !w-auto"
				/>
				<p class="fine">Now tap a card in your hand to return</p>
			</div>
		{:else if room.stage === 'trump' && myTurn}
			<div class="panel">
				<p>Choose trump from your first five cards</p>
				<div class="choose" role="group" aria-label="Choose trump">
					{#each SUITS as s (s)}
						<button
							class="suit"
							class:red={red(s)}
							disabled={busy}
							onclick={() => trick('chooseTrump', { suit: s })}
							>{SUIT[s]}<small>{me?.cardsInHand.filter((c) => c.suit === s).length ?? 0}</small
							></button
						>
					{/each}
				</div>
			</div>
		{:else if playing}
			<TrickPlay large plays={shownTrick} winner={shownWinner} {placeOf} />
		{:else}
			<TrickLobby
				users={room.usersList}
				{selfId}
				hostId={room.hostId}
				roomName={room.name}
				seats={3}
				{busy}
				canStart={room.legalActions.start}
				startLabel={room.round ? 'Next round' : 'Deal'}
				{act}
			>
				{#if room.result}
					<h2>{room.result.reason === 'abandoned' ? 'Round abandoned' : `Round ${room.round}`}</h2>
					{#if room.result.diffs}
						<table class="results">
							<thead
								><tr><th></th><th>Needed</th><th>Won</th><th>Round</th><th>Total</th></tr></thead
							>
							<tbody>
								{#each room.order as id (id)}
									{@const d = room.result.diffs[id]}
									<tr>
										<td>{id === selfId ? 'You' : user(id)?.username}</td>
										<td>{room.result.quotas[id]}</td>
										<td>{room.result.tricks[id]}</td>
										<td class:pos={d > 0} class:neg={d < 0}>{d > 0 ? '+' : ''}{d}</td>
										<td>{room.scores[id] ?? 0}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						{#if pullsNext.length}<p class="fine">
								Next round: {pullsNext
									.map(
										({ id, v, d }) =>
											`${id === selfId ? 'you' : user(id)?.username} pull${id === selfId ? '' : 's'} ${d > 1 ? 'up to ' + d : 'one'} from ${v === selfId ? 'you' : user(v)?.username}`
									)
									.join(' · ')}
							</p>{/if}
					{/if}
				{:else}
					<h2>Three players, ten tricks</h2>
					<p class="fine">The first player needs 5 tricks, the next 3, the dealer 2.</p>
				{/if}
			</TrickLobby>
		{/if}
	{/snippet}
	{#snippet hand()}
		{#if me && me.cardsInHand.length}
			<TrickHand
				large
				dealKey={room.round}
				cards={me.cardsInHand}
				playable={(c) => legalPlay(c) || legalGive(c)}
				onpick={clickCard}
				trump={room.trump}
				active={myTurn}
				{busy}
			/>
		{/if}
	{/snippet}
	{#snippet actions()}
		<div class="board" aria-label="Targets and scores">
			{#each room.order.length ? room.order : users.map((u) => u.id) as id (id)}
				<div class="line" class:me={id === selfId}>
					<strong>{id === selfId ? 'You' : user(id)?.username}</strong>
					{#if room.quotas[id]}<span class="pips"
							>{#each pips(id) as p, i (i)}<i class={p}></i>{/each}</span
						>{/if}
					<b>{(room.scores[id] ?? 0) > 0 ? '+' : ''}{room.scores[id] ?? 0}</b>
				</div>
			{/each}
		</div>
	{/snippet}
</TrickTableShell>

<style>
	.panel {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
		border-radius: 1.1rem;
		background: rgb(8 12 10 / 72%);
		padding: 0.9rem 1.2rem;
		font-weight: 700;
		backdrop-filter: blur(6px);
	}
	.fine {
		color: rgb(248 242 229 / 80%);
		font-size: 0.8rem;
		font-weight: 500;
	}
	.choose,
	.facedown {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}
	.suit {
		display: grid;
		place-items: center;
		width: 4.2rem;
		height: 5.2rem;
		border-radius: 0.9rem;
		background: #f8f2e5;
		color: #111;
		font-size: 2.2rem;
		cursor: pointer;
		transition: translate 0.2s;
	}
	.suit.red {
		color: #c0392b;
	}
	.suit small {
		font-size: 0.7rem;
		font-weight: 800;
		color: #555;
	}
	.suit:hover,
	.fd:hover {
		translate: 0 -4px;
	}
	.fd {
		cursor: pointer;
		transition: translate 0.2s;
	}
	.results {
		border-collapse: collapse;
		font-size: 0.85rem;
	}
	.results th,
	.results td {
		padding: 0.3rem 0.7rem;
		text-align: center;
	}
	.results th {
		color: rgb(248 242 229 / 60%);
		font-size: 0.7rem;
		text-transform: uppercase;
	}
	.pos {
		color: #8fd19e;
		font-weight: 800;
	}
	.neg {
		color: #ee715b;
		font-weight: 800;
	}
	.board {
		display: grid;
		gap: 0.25rem;
		width: 100%;
	}
	.line {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 5%);
		padding: 0.3rem 0.6rem;
		font-size: 0.8rem;
	}
	.line.me {
		box-shadow: inset 0 0 0 1px rgb(242 220 145 / 45%);
	}
	.line strong {
		margin-right: auto;
	}
	.pips {
		display: flex;
		gap: 3px;
	}
	.pips i {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 2px solid rgb(255 255 255 / 35%);
	}
	.pips i.made {
		background: #f2dc91;
		border-color: #f2dc91;
	}
	.pips i.extra {
		background: #8fd19e;
		border-color: #8fd19e;
	}
</style>
