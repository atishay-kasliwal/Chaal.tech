<script lang="ts">
	import TrickTableShell, { type ShellSeat } from './TrickTableShell.svelte';
	import TrickLobby from './TrickLobby.svelte';
	import TrickPlay from './TrickPlay.svelte';
	import TrickHand from './TrickHand.svelte';

	import type { Suit, Card, PakadRoom as Room } from './types.js';

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
	const same = (a: Card, b: Card) => a.rank === b.rank && a.suit === b.suit;
	const cardLabel = (c: Card) =>
		`${({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[c.rank] ?? c.rank}${SUIT[c.suit as Suit] ?? ''}`;

	const users = $derived(room.usersList);
	const me = $derived(users.find((u) => u.id === selfId));
	const user = (id: string | null | undefined) => users.find((u) => u.id === id);
	const name = (id: string | null | undefined) =>
		id === selfId ? 'You' : (user(id)?.username ?? 'Someone');
	const playing = $derived(room.isStarted && !room.gameShow);
	const myTurn = $derived(playing && room.currentPlayerId === selfId);
	const myTeam = $derived(me?.team ?? 0);
	const teamName = (t: number) => (t === myTeam ? 'Your team' : 'Opponents');
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
	const legalPlay = (c: Card) => room.legalActions.play.some((x) => same(x, c));
	const play = (c: Card) => {
		if (legalPlay(c)) void act('trickAction', ['play', { card: c }]);
	};
	const status = $derived.by(() => {
		if (!playing) return '';
		const who = name(room.currentPlayerId);
		if (myTurn)
			return room.trick?.plays.length
				? room.trump
					? 'Your turn: follow suit if you can'
					: 'Your turn: follow suit, or the card you play sets trump'
				: 'Your lead';
		return `${who} to play`;
	});
	const shownTrick = $derived(
		room.trick?.plays.length ? room.trick.plays : (room.lastTrick?.plays ?? [])
	);
	const shownWinner = $derived(room.trick?.plays.length ? null : (room.lastTrick?.winner ?? null));
	const trumpNote = $derived.by(() => {
		const s = room.trumpSetBy;
		if (!s) return 'No trump yet: the first player who cannot follow suit sets it';
		if ('drawn' in s) return `Everyone followed: ${cardLabel(s.drawn)} was drawn to set trump`;
		return `${name(s.id)} set trump in trick ${s.trick}`;
	});
	const streakNote = $derived.by(() => {
		if (!room.streak || !playing) return '';
		const who = room.streak.id === selfId ? 'you take' : `${name(room.streak.id)} takes`;
		return `If ${room.streak.id === selfId ? 'you win' : `${name(room.streak.id)} wins`} the next trick, ${who} the pile`;
	});
	const resultLine = $derived.by(() => {
		const r = room.result;
		if (!r) return '';
		if (r.reason === 'abandoned') return 'Hand abandoned: no score';
		const t = r.winnerTeam ?? 0;
		if (r.kot === 'four-tens') return `${teamName(t)} took all four tens: a Kot`;
		if (r.kot === 'seven-in-a-row') return `${teamName(t)} won seven hands in a row: a Kot`;
		return `${teamName(t)} won the hand`;
	});
	// Why the hand went that way: the dealing team needs three tens, the other team only two.
	const resultWhy = $derived.by(() => {
		const r = room.result;
		if (!r?.tens || r.kot || r.dealingTeam === undefined) return '';
		const dealers = teamName(r.dealingTeam).toLowerCase();
		return r.tens[0] === 2
			? `A 2-2 split goes to the team that did not deal (${dealers} dealt)`
			: `The dealing team needs three tens (${dealers} dealt)`;
	});
	const shellSeats: ShellSeat[] = $derived(
		users.map((u) => ({
			id: u.id,
			seatNumber: u.seatNumber,
			name: u.id === selfId ? 'You' : u.username,
			isBot: u.isBot,
			mascotId: u.mascotId,
			tags: [
				...(u.id !== selfId && u.team === myTeam ? ['Partner'] : []),
				...(room.dealerId === u.id ? ['Dealer'] : [])
			],
			cardCount: playing ? u.cardCount : 0,
			active: playing && room.currentPlayerId === u.id,
			away: !u.isBot && !u.connected
		}))
	);
	const info = $derived([
		...(room.hand ? [{ text: `Hand ${room.hand}` }] : []),
		...(room.trump
			? [
					{
						text: `Trump ${SUIT[room.trump]}`,
						tone: red(room.trump) ? ('red' as const) : ('gold' as const)
					}
				]
			: playing
				? [{ text: 'No trump yet' }]
				: [])
	]);
</script>

<TrickTableShell
	title="10 Pakad"
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
		{#if playing}
			<TrickPlay plays={shownTrick} winner={shownWinner} {placeOf} />
			<div class="pile" aria-label="Centre pile">
				<span><b>{room.centre.count}</b> in the centre</span>
				{#if room.centre.tens}<span class="tens"
						>{room.centre.tens} {room.centre.tens === 1 ? 'ten' : 'tens'}</span
					>{/if}
				{#if room.lastTrick?.collected && !room.trick?.plays.length}<span class="took"
						>{name(room.lastTrick.winner)} collected the pile</span
					>{/if}
			</div>
			<p class="note">{streakNote || trumpNote}</p>
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
					{#if room.result.tens}<p class="fine">
							Tens: {teamName(myTeam)}
							{room.result.tens[myTeam]} · {teamName(1 - myTeam)}
							{room.result.tens[1 - myTeam]}
						</p>{/if}
					{#if resultWhy}<p class="fine">{resultWhy}</p>{/if}
				{:else}
					<h2>Four players, two teams, four tens</h2>
					<p class="fine">
						Win the same trick twice in a row to collect the centre pile. Take the tens.
					</p>
				{/if}
			</TrickLobby>
		{/if}
	{/snippet}
	{#snippet hand()}
		{#if me && me.cardsInHand.length}
			<TrickHand
				cards={me.cardsInHand}
				playable={legalPlay}
				onpick={play}
				trump={room.trump}
				active={myTurn}
				{busy}
			/>
		{/if}
	{/snippet}
	{#snippet actions()}
		<div class="board" aria-label="Score">
			{#each [myTeam, 1 - myTeam] as t (t)}
				<div class="team" class:us={t === myTeam}>
					<strong>{teamName(t)}</strong>
					<span>Tens <b>{room.captured[t]?.tens ?? 0}</b></span>
					<span>Kots <b>{room.match.kots[t]}</b></span>
					<span>Hands <b>{room.match.handsWon[t]}</b></span>
				</div>
			{/each}
			{#if room.match.run.team !== null && room.match.run.hands > 1}<p class="run">
					{teamName(room.match.run.team)}: {room.match.run.hands} hands in a row
				</p>{/if}
		</div>
	{/snippet}
</TrickTableShell>

<style>
	.pile {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.5rem;
		border-radius: 999px;
		background: rgb(8 12 10 / 65%);
		padding: 0.3rem 0.8rem;
		font-size: 0.82rem;
	}
	.pile .tens {
		border-radius: 999px;
		background: #f2dc91;
		padding: 0.1rem 0.55rem;
		color: #211c2e;
		font-weight: 800;
	}
	.pile .took {
		color: #f2dc91;
		font-weight: 700;
	}
	.note {
		max-width: 26rem;
		color: rgb(248 242 229 / 85%);
		font-size: 0.8rem;
		text-align: center;
		text-shadow: 0 1px 2px rgb(0 0 0 / 60%);
	}
	.board {
		display: grid;
		gap: 0.3rem;
		width: 100%;
	}
	.team {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
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
	.team b {
		font-size: 0.9rem;
	}
	.run {
		color: #f2dc91;
		font-size: 0.75rem;
		font-weight: 700;
	}
</style>
