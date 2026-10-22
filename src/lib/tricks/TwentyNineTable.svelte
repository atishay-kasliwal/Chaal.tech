<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import TrickTableShell, { type ShellSeat } from './TrickTableShell.svelte';
	import TrickLobby from './TrickLobby.svelte';
	import TrickPlay from './TrickPlay.svelte';
	import TrickHand from './TrickHand.svelte';

	import type { Card, TwentyNineRoom as Room } from './types.js';

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
	const red = (s: string) => s === 'hearts' || s === 'diamonds';
	const range = (n: number) => Array.from({ length: n }, (_, i) => i);
	const same = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;

	const users = $derived(room.usersList);
	const me = $derived(users.find((u) => u.id === selfId));
	const user = (id: string | null | undefined) => users.find((u) => u.id === id);
	const name = (id: string | null | undefined) =>
		id === selfId ? 'You' : (user(id)?.username ?? 'Someone');
	const playing = $derived(room.isStarted && !room.gameShow);
	const myTurn = $derived(playing && room.currentPlayerId === selfId);
	const myTeam = $derived(me?.team ?? 0);
	const teamName = (t: number) => (t === myTeam ? 'Your team' : 'Opponents');
	const lastBid = (id: string) => [...room.bids].reverse().find((b) => b.id === id);
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
	const trick = (action: string, payload: Record<string, unknown> = {}) =>
		act('trickAction', [action, payload]);
	const canPlay = (c: Card) => room.legalActions.play.some((x) => same(x, c));
	const canSet = (c: Card) => room.legalActions.chooseTrump.some((x) => same(x, c));
	const clickCard = (c: Card) => {
		if (canSet(c)) void trick('chooseTrump', { card: c });
		else if (canPlay(c)) void trick('play', { card: c });
	};
	const status = $derived.by(() => {
		if (!playing) return '';
		const who = name(room.currentPlayerId);
		if (room.stage === 'bid')
			return myTurn
				? room.high
					? `Bid more than ${room.high.bid}, or pass`
					: 'Open the bidding at 15 or more, or pass'
				: `${who} is bidding`;
		if (room.stage === 'trump')
			return myTurn
				? 'Tap the card of your trump suit to lay face down'
				: `${who} is choosing trump`;
		if (myTurn && room.legalActions.reveal) return 'You cannot follow suit: ask for trump';
		return myTurn
			? room.trick?.plays.length
				? 'Your turn: follow suit if you can'
				: 'Your lead'
			: `${who} to play`;
	});
	const shownTrick = $derived(
		room.trick?.plays.length ? room.trick.plays : (room.lastTrick?.plays ?? [])
	);
	const shownWinner = $derived(room.trick?.plays.length ? null : (room.lastTrick?.winner ?? null));
	const bidTeam = $derived(room.bidderId ? room.teams[room.bidderId] : null);
	const resultLine = $derived.by(() => {
		const r = room.result;
		if (!r) return '';
		if (r.reason === 'abandoned') return 'Hand abandoned: no score';
		if (r.reason === 'annulled') return 'Trump was never asked for: the hand does not count';
		const t = r.bidTeam ?? 0;
		const line = `${teamName(t)} bid ${r.bid}${r.target !== r.bid ? ` (target ${r.target})` : ''} and ${r.made ? 'made it' : 'fell short'}`;
		return r.gameOver === null || r.gameOver === undefined
			? line
			: `${line}. ${teamName(r.gameOver)} won the game`;
	});
	const pips = (t: number) => {
		const g = room.match.gamePoints[t];
		return range(6).map((k) => (g > k ? 'up' : -g > k ? 'down' : ''));
	};
	const shellSeats: ShellSeat[] = $derived(
		users.map((u) => ({
			id: u.id,
			seatNumber: u.seatNumber,
			name: u.id === selfId ? 'You' : u.username,
			isBot: u.isBot,
			mascotId: u.mascotId,
			tags: [
				...(u.id !== selfId && u.team === myTeam ? ['Partner'] : []),
				...(room.dealerId === u.id ? ['Dealer'] : []),
				...(room.bidderId === u.id ? ['Bidder'] : [])
			],
			sub: room.stage === 'bid' && lastBid(u.id) ? String(lastBid(u.id)?.bid ?? 'Pass') : undefined,
			cardCount: playing
				? u.cardCount + (room.bidderId === u.id && room.indicatorDown && u.id !== selfId ? 1 : 0)
				: 0,
			active: playing && room.currentPlayerId === u.id,
			away: !u.isBot && !u.connected
		}))
	);
	const info = $derived([
		...(room.hand ? [{ text: `Hand ${room.hand}` }] : []),
		...(room.bid
			? [
					{
						text: `${name(room.bidderId)} bid ${room.bid}${room.target !== room.bid ? ` · target ${room.target}` : ''}`
					}
				]
			: []),
		...(room.trump && room.revealed
			? [
					{
						text: `Trump ${SUIT[room.trump]}`,
						tone: red(room.trump) ? ('red' as const) : ('gold' as const)
					}
				]
			: room.trump
				? [{ text: `Your trump ${SUIT[room.trump]} (secret)`, tone: 'gold' as const }]
				: room.stage === 'play'
					? [{ text: 'Trump hidden' }]
					: [])
	]);
</script>

<TrickTableShell
	title="29"
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
		{#if playing && room.stage === 'bid' && myTurn}
			<div class="panel">
				<p>
					{room.high
						? `Bid more than ${room.high.bid}, or pass`
						: 'Open the bidding at 15 or more, or pass'}
				</p>
				<div class="bidding" role="group" aria-label="Your bid">
					{#each room.legalActions.bid.slice(0, 8) as v (v)}
						<button class="chipbtn" disabled={busy} onclick={() => trick('bid', { value: v })}
							>{v}</button
						>
					{/each}
					<button class="chipbtn pass" disabled={busy} onclick={() => trick('pass')}>Pass</button>
				</div>
			</div>
		{:else if playing && room.stage === 'bid'}
			<p class="note">
				{room.high ? `Highest bid ${room.high.bid} by ${name(room.high.id)}` : 'No bid yet'}
			</p>
		{:else if playing && room.stage === 'trump'}
			<p class="note">{status}</p>
		{:else if playing}
			<TrickPlay plays={shownTrick} winner={shownWinner} {placeOf} />
			{#if myTurn && (room.legalActions.reveal || room.legalActions.pair)}
				<div class="row">
					{#if room.legalActions.reveal}<button
							class="cta"
							disabled={busy}
							onclick={() => trick('reveal')}>Ask for trump</button
						>{/if}
					{#if room.legalActions.pair}<button
							class="cta"
							disabled={busy}
							onclick={() => trick('pair')}>Declare Pair (K Q)</button
						>{/if}
				</div>
			{/if}
			<p class="note">
				{#if room.revealedAt}Trump {room.trump ? SUIT[room.trump] : ''} revealed by {name(
						room.revealedAt.by
					)} in trick {room.revealedAt.trick}{:else}Trump is hidden until someone cannot follow suit{/if}{#if room.pair}.
					{name(room.pair.id)} declared the Pair{/if}
			</p>
		{:else}
			<TrickLobby
				users={room.usersList}
				{selfId}
				hostId={room.hostId}
				roomName={room.name}
				seats={4}
				{busy}
				canStart={room.legalActions.start}
				startLabel={room.hand ? 'Next hand' : 'Deal'}
				{act}
			>
				{#if room.result}
					<h2>{resultLine}</h2>
					{#if room.result.points}<p class="fine">
							Points: {teamName(myTeam)}
							{room.result.points[myTeam]} · {teamName(1 - myTeam)}
							{room.result.points[1 - myTeam]}
						</p>{/if}
				{:else}
					<h2>Four players, two teams, 28 points</h2>
					<p class="fine">Bid on four cards, keep trump secret, and make your target.</p>
				{/if}
			</TrickLobby>
		{/if}
	{/snippet}
	{#snippet hand()}
		{#if me && (me.cardsInHand.length || room.indicator)}
			<TrickHand
				cards={me.cardsInHand}
				playable={(c) => canPlay(c) || canSet(c)}
				onpick={clickCard}
				trump={room.trump}
				active={myTurn}
				{busy}
			>
				{#snippet after()}
					{#if room.indicator}<span class="set" title="Your trump card, face down until asked for"
							><DeckCard faceDown class="!h-full !w-auto" /></span
						>{/if}
				{/snippet}
			</TrickHand>
		{/if}
	{/snippet}
	{#snippet actions()}
		<div class="board" aria-label="Score">
			{#each [myTeam, 1 - myTeam] as t (t)}
				<div class="team" class:us={t === myTeam}>
					<strong>{teamName(t)}</strong>
					{#if playing && room.stage === 'play'}<span
							>Points <b>{room.points[t]}</b
							>{#if bidTeam === t && room.target}{` of ${room.target}`}{/if}</span
						>{/if}
					<span class="game" aria-label="Game points {room.match.gamePoints[t]}"
						>{#each pips(t) as p, i (i)}<i class={p}></i>{/each}<b
							>{room.match.gamePoints[t] > 0 ? '+' : ''}{room.match.gamePoints[t]}</b
						></span
					>
					<span>Games <b>{room.match.games[t]}</b></span>
				</div>
			{/each}
		</div>
	{/snippet}
</TrickTableShell>

<style>
	.panel {
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		border-radius: 1.1rem;
		background: rgb(8 12 10 / 72%);
		padding: 0.9rem 1.2rem;
		font-weight: 700;
		backdrop-filter: blur(6px);
	}
	.note {
		max-width: 26rem;
		color: rgb(248 242 229 / 85%);
		font-size: 0.8rem;
		text-align: center;
		text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
	}
	.bidding,
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.45rem;
		max-width: 24rem;
	}
	.chipbtn {
		min-width: 3rem;
		border-radius: 0.8rem;
		background: #f8f2e5;
		padding: 0.6rem 0.8rem;
		color: #111;
		font-size: 1rem;
		font-weight: 800;
		cursor: pointer;
		transition: translate 0.2s;
	}
	.chipbtn.pass {
		background: rgb(255 255 255 / 12%);
		color: #f8f2e5;
	}
	.chipbtn:hover {
		translate: 0 -2px;
	}
	.cta {
		border-radius: 999px;
		background: #f2dc91;
		padding: 0.6rem 1.2rem;
		color: #211c2e;
		font-weight: 800;
		cursor: pointer;
	}
	.set {
		height: 100%;
		margin-left: 0.6rem;
		opacity: 0.85;
	}
	@media (max-width: 760px) {
		.set {
			height: 4.6rem;
			margin-left: 0;
		}
	}
	.board {
		display: grid;
		gap: 0.3rem;
		width: 100%;
	}
	.team {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.2rem 0.7rem;
		border-radius: 0.7rem;
		background: rgb(255 255 255 / 5%);
		padding: 0.35rem 0.6rem;
		font-size: 0.78rem;
	}
	.team.us {
		box-shadow: inset 0 0 0 1px rgb(242 220 145 / 45%);
	}
	.team strong {
		margin-right: auto;
		font-family: var(--font-display);
	}
	.game {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.game i {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		border: 2px solid rgb(255 255 255 / 30%);
	}
	.game i.up {
		background: #8fd19e;
		border-color: #8fd19e;
	}
	.game i.down {
		background: #ee715b;
		border-color: #ee715b;
	}
	.game b {
		margin-left: 4px;
	}
</style>
