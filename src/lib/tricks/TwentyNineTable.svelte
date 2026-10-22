<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import BotPortrait from '#lib/bots/BotPortrait.svelte';
	import { CAST } from '#lib/bots/cast.js';

	import type { Suit, Card, TwentyNineRoom as Room } from './types.js';

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
	const isHost = $derived(room.hostId === selfId);
	const myTeam = $derived(me?.team ?? 0);
	const teamName = (t: number) => (t === myTeam ? 'Your team' : 'Opponents');
	// Seats from my point of view: play goes clockwise, so the next player sits on my left.
	const ring = $derived.by(() => {
		const mine = me?.seatNumber ?? 0;
		return [0, 1, 2, 3].map((k) => users.find((u) => u.seatNumber === (mine + k) % 4)?.id ?? null);
	});
	const freeCast = $derived(CAST.filter((c) => !users.some((u) => u.characterId === c.id)));
	const emptySeats = $derived(Math.max(0, 4 - users.length));
	const lastBid = (id: string) => [...room.bids].reverse().find((b) => b.id === id);
	let picking = $state(false);
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
</script>

<div class="pakad g29" class:my-turn={myTurn}>
	<header class="bar">
		<h1>
			29 {#if room.hand}<span>Hand {room.hand}</span>{/if}
		</h1>
		{#if room.trump && room.revealed}<span class="trump" class:red={red(room.trump)}
				>Trump {SUIT[room.trump]}</span
			>{:else if room.trump}<span class="trump secret" class:red={red(room.trump)}
				>Your trump {SUIT[room.trump]} (secret)</span
			>{:else if room.stage === 'play'}<span class="trump none">Trump hidden</span>{/if}
		{#if room.bid}<span class="trump none"
				>{name(room.bidderId)} bid {room.bid}{room.target !== room.bid
					? ` · target ${room.target}`
					: ''}</span
			>{/if}
		<p class="turn-line" aria-live="polite">{status}</p>
		<div class="tools">
			<button class="ghost" onclick={onInvite}>Invite</button>
			<button class="ghost" onclick={onLeave}>Leave</button>
		</div>
	</header>

	{#if !connected}<p class="banner" role="status">Reconnecting. Your seat is kept.</p>{/if}
	{#if !seated}<p class="banner" role="status">Taking your seat…</p>{/if}

	<div class="board" aria-label="Score">
		{#each [myTeam, 1 - myTeam] as t (t)}
			<div class="team" class:us={t === myTeam}>
				<strong>{teamName(t)}</strong>
				{#if playing && room.stage === 'play'}<span
						>Points <b>{room.points[t]}</b>{#if bidTeam === t && room.target}
							{` of ${room.target}`}{/if}</span
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

	<div class="felt">
		{#each ring as id, k (k)}
			{@const u = user(id)}
			<div
				class="seat s{[0, 3, 2, 1][k]}"
				class:turn={!!u && room.currentPlayerId === id && playing}
				class:away={!!u && !u.isBot && !u.connected}
				class:partner={k === 2}
			>
				{#if u && id}
					<div class="avatar">
						{#if u.isBot}<BotPortrait
								mascotId={u.mascotId}
								name={u.username}
								size={56}
							/>{:else}<span class="initial">{u.username.slice(0, 1).toUpperCase()}</span>{/if}
					</div>
					<div class="who">
						<strong>{id === selfId ? 'You' : u.username}</strong>
						<small>
							{#if k === 2}<span class="tag">Partner</span>{/if}
							{#if room.dealerId === id}<span class="tag">Dealer</span>{/if}
							{#if room.bidderId === id}<span class="tag bid">Bidder</span>{/if}
							{#if u.isBot}<span class="tag bot">Bot</span>{/if}
							{#if !u.isBot && !u.connected}<span class="tag warn">Away</span>{/if}
							{#if room.stage === 'bid' && lastBid(id)}<span class="tag"
									>{lastBid(id)?.bid ?? 'Pass'}</span
								>{/if}
						</small>
					</div>
					{#if id !== selfId && playing}<div class="backs" aria-label="{u.cardCount} cards">
							{#each range(Math.min(u.cardCount, 8)) as i (i)}<span></span>{/each}
							{#if room.bidderId === id && room.indicatorDown}<span
									class="down"
									title="Trump card, face down"
								></span>{/if}
						</div>{/if}
				{:else}
					<span class="empty-seat">Empty seat</span>
				{/if}
			</div>
		{/each}

		<div class="middle">
			{#if playing && room.stage === 'bid' && myTurn}
				<div class="bidding" role="group" aria-label="Your bid">
					{#each room.legalActions.bid.slice(0, 8) as v (v)}
						<button class="chipbtn" disabled={busy} onclick={() => trick('bid', { value: v })}
							>{v}</button
						>
					{/each}
					<button class="chipbtn pass" disabled={busy} onclick={() => trick('pass')}>Pass</button>
				</div>
			{:else if playing && room.stage === 'bid'}
				<p class="fine">
					{room.high ? `Highest bid ${room.high.bid} by ${name(room.high.id)}` : 'No bid yet'}
				</p>
			{:else if playing && room.stage === 'trump'}
				<p class="fine">{status}</p>
			{:else if playing}
				<div class="trick">
					{#each shownTrick as p (p.id + p.card.rank + p.card.suit)}
						<div
							class="played p{[0, 3, 2, 1][ring.indexOf(p.id)]}"
							class:won={shownWinner === p.id}
						>
							<DeckCard rank={p.card.rank} suit={p.card.suit as Suit} class="!h-24 !w-auto" />
						</div>
					{/each}
				</div>
				<div class="row">
					{#if myTurn && room.legalActions.reveal}<button
							class="cta"
							disabled={busy}
							onclick={() => trick('reveal')}>Ask for trump</button
						>{/if}
					{#if myTurn && room.legalActions.pair}<button
							class="cta"
							disabled={busy}
							onclick={() => trick('pair')}>Declare Pair (K Q)</button
						>{/if}
				</div>
				<p class="fine">
					{#if room.revealedAt}Trump {room.trump ? SUIT[room.trump] : ''} revealed by {name(
							room.revealedAt.by
						)} in trick {room.revealedAt.trick}{:else}Trump is hidden until someone cannot follow
						suit{/if}{#if room.pair}. {name(room.pair.id)} declared the Pair{/if}
				</p>
			{:else}
				<div class="lobby">
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
					<div class="seats-list">
						{#each users as u (u.id)}
							<span class="chip"
								>{u.id === selfId ? 'You' : u.username}{#if u.isBot}{#if isHost}<button
											class="x"
											aria-label="Remove {u.username}"
											onclick={() => act('removeBot', [u.id])}>×</button
										>{/if}{:else}<em>{u.ready ? 'ready' : 'not ready'}</em>{/if}</span
							>
						{/each}
						{#each range(emptySeats) as i (i)}
							<span class="chip empty">Empty seat</span>
						{/each}
					</div>
					{#if isHost && emptySeats > 0}
						{#if picking}
							<div class="cast" role="group" aria-label="Choose a character">
								{#each freeCast as c (c.id)}
									<button
										class="who-btn"
										disabled={busy}
										onclick={async () => {
											await act('addBot', [c.id]);
											if (emptySeats <= 1) picking = false;
										}}
										><BotPortrait mascotId={`bot-${c.id}`} name={c.name} size={56} /><span
											>{c.name}</span
										></button
									>
								{/each}
							</div>
						{:else}
							<button class="ghost" onclick={() => (picking = true)}
								>Fill {emptySeats === 1 ? 'the empty seat' : `${emptySeats} empty seats`} with a character</button
							>
						{/if}
					{/if}
					<div class="row">
						{#if me && !me.isBot}<button class="ghost" onclick={() => act('ready', [!me.ready])}
								>{me.ready ? 'Ready ✓' : 'I’m ready'}</button
							>{/if}
						{#if isHost}<button
								class="cta"
								disabled={!room.legalActions.start || busy}
								onclick={() => act('start', [])}>{room.hand ? 'Next hand' : 'Deal'}</button
							>{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if me && (me.cardsInHand.length || room.indicator)}
		<div class="hand" class:active={myTurn} aria-label="Your cards">
			{#each me.cardsInHand as c (c.rank + c.suit)}
				{@const ok = canPlay(c) || canSet(c)}
				<button
					class="card"
					class:ok
					class:trumpc={room.trump && c.suit === room.trump}
					disabled={!ok || busy}
					onclick={() => clickCard(c)}
					aria-label="{c.rank} of {c.suit}{ok ? '' : ' (not playable now)'}"
					><DeckCard rank={c.rank} suit={c.suit as Suit} class="!h-full !w-auto" /></button
				>
			{/each}
			{#if room.indicator}<div class="card set" title="Your trump card, face down until asked for">
					<DeckCard faceDown class="!h-full !w-auto" />
				</div>{/if}
		</div>
	{/if}
</div>

<style>
	.pakad {
		--felt: #1f4a33;
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: calc(100dvh - var(--header-h, 64px));
		padding: 14px max(var(--gutter), calc((100vw - var(--page-max)) / 2 + var(--gutter))) 16px;
		color: var(--paper);
		background: var(--night);
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	h1 {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.02em;
		display: flex;
		align-items: baseline;
		gap: 10px;
	}
	h1 span {
		font-size: 13px;
		color: var(--muted);
	}
	.trump {
		padding: 6px 12px;
		border-radius: 100px;
		background: var(--paper);
		color: #111;
		font-weight: 800;
	}
	.trump.red {
		color: #c0392b;
	}
	.trump.none {
		background: #ffffff14;
		color: var(--muted);
		font-weight: 700;
	}
	.turn-line {
		flex: 1;
		color: var(--butter);
		font-weight: 700;
		min-width: 200px;
	}
	.tools,
	.row {
		display: flex;
		gap: 8px;
	}
	.ghost {
		padding: 9px 16px;
		border-radius: 100px;
		background: #ffffff12;
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
	}
	.ghost:hover {
		background: #ffffff20;
	}
	.cta {
		padding: 11px 22px;
		border-radius: 100px;
		background: var(--butter);
		color: var(--night);
		font-weight: 800;
		cursor: pointer;
	}
	.cta:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.banner {
		padding: 10px 14px;
		border-radius: 12px;
		background: #ffffff10;
		color: var(--muted);
	}
	.board {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.team {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
		align-items: baseline;
		padding: 10px 14px;
		border-radius: 14px;
		background: #00000030;
		font-size: 13px;
	}
	.team.us {
		box-shadow: inset 0 0 0 2px #f2dc9155;
	}
	.team strong {
		font-family: var(--font-display);
		font-size: 15px;
		margin-right: auto;
	}
	.team b {
		font-size: 16px;
	}
	.run {
		color: var(--butter);
		font-weight: 700;
	}
	.felt {
		position: relative;
		flex: 1;
		min-height: 440px;
		border-radius: 28px;
		background: radial-gradient(ellipse at 50% 45%, #2c6a47, var(--felt) 60%, #163626);
		border: 1px solid #ffffff14;
		display: grid;
		grid-template-columns: 1fr 1.6fr 1fr;
		grid-template-rows: auto 1fr auto;
		gap: 8px;
		padding: 16px;
	}
	.seat {
		display: grid;
		gap: 6px;
		align-content: start;
		justify-items: center;
		padding: 10px;
		border-radius: 18px;
		background: #00000030;
		border: 2px solid transparent;
		transition:
			border-color 0.25s,
			box-shadow 0.25s;
		max-width: 200px;
	}
	.seat.partner {
		background: #f2dc9112;
	}
	.seat.turn {
		border-color: var(--butter);
		box-shadow: 0 0 0 4px #f2dc9122;
	}
	.seat.away {
		opacity: 0.6;
	}
	.s0 {
		grid-column: 2;
		grid-row: 3;
		justify-self: center;
		grid-template-columns: auto auto;
		align-items: center;
		max-width: none;
	}
	.s1 {
		grid-column: 3;
		grid-row: 2;
		justify-self: end;
		align-self: center;
	}
	.s2 {
		grid-column: 2;
		grid-row: 1;
		justify-self: center;
	}
	.s3 {
		grid-column: 1;
		grid-row: 2;
		justify-self: start;
		align-self: center;
	}
	.empty-seat {
		color: var(--muted);
		font-size: 13px;
		padding: 12px;
	}
	.avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: #ffffff14;
	}
	.initial {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 800;
	}
	.who {
		display: grid;
		justify-items: center;
		gap: 4px;
	}
	.who small {
		display: flex;
		gap: 4px;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
	}
	.tag {
		font-size: 10px;
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		padding: 2px 6px;
		border-radius: 6px;
		background: #ffffff1c;
	}
	.tag.bot {
		background: #f2dc9130;
		color: var(--butter);
	}
	.tag.warn {
		background: #ee715b33;
		color: var(--red);
	}
	.backs {
		display: flex;
	}
	.backs span {
		width: 10px;
		height: 16px;
		margin-left: -3px;
		border-radius: 3px;
		background: linear-gradient(135deg, #7b2232, #4a1520);
		border: 1px solid #ffffff40;
	}
	.middle {
		grid-column: 2;
		grid-row: 2;
		display: grid;
		place-items: center;
		gap: 8px;
	}
	.trick {
		position: relative;
		width: 250px;
		height: 210px;
	}
	.played {
		position: absolute;
		transition: translate 0.3s;
	}
	.played.p0 {
		left: 50%;
		bottom: 0;
		translate: -50% 0;
	}
	.played.p1 {
		right: 0;
		top: 50%;
		translate: 0 -50%;
		rotate: 8deg;
	}
	.played.p2 {
		left: 50%;
		top: 0;
		translate: -50% 0;
	}
	.played.p3 {
		left: 0;
		top: 50%;
		translate: 0 -50%;
		rotate: -8deg;
	}
	.played.won {
		filter: drop-shadow(0 0 12px var(--butter));
	}
	.lobby {
		display: grid;
		gap: 10px;
		justify-items: center;
		text-align: center;
	}
	.lobby h2 {
		font-family: var(--font-display);
		font-size: 24px;
		font-weight: 800;
	}
	.fine {
		font-size: 13px;
		color: #e8e0f0;
		text-align: center;
	}
	.seats-list,
	.cast {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 100px;
		background: #00000035;
		font-size: 13px;
		font-weight: 700;
	}
	.chip em {
		font-style: normal;
		font-weight: 600;
		color: var(--muted);
		font-size: 11px;
	}
	.chip.empty {
		border: 1px dashed #ffffff55;
		background: transparent;
		color: var(--muted);
	}
	.x {
		cursor: pointer;
		color: var(--muted);
	}
	.who-btn {
		display: grid;
		justify-items: center;
		gap: 4px;
		padding: 8px;
		border-radius: 14px;
		background: #00000035;
		cursor: pointer;
		font-weight: 700;
		font-size: 12px;
	}
	.who-btn:hover {
		background: #00000055;
	}
	.hand {
		display: flex;
		justify-content: center;
		height: clamp(104px, 15dvh, 150px);
		padding: 6px 0;
	}
	.card {
		height: 100%;
		margin-left: -26px;
		transition:
			translate 0.2s,
			filter 0.2s;
		filter: brightness(0.62);
		cursor: default;
	}
	.card:first-child {
		margin-left: 0;
	}
	.card.ok {
		filter: none;
		cursor: pointer;
	}
	.card.ok:hover,
	.card.ok:focus-visible {
		translate: 0 -12px;
	}
	.hand:not(.active) .card {
		filter: none;
	}
	.card.trumpc {
		box-shadow: 0 -4px 0 var(--butter);
		border-radius: 10px;
	}
	.trump.secret {
		background: #f2dc91;
	}
	.tag.bid {
		background: var(--butter);
		color: var(--night);
	}
	.game {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}
	.game i {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		border: 2px solid #ffffff40;
	}
	.game i.up {
		background: #8fd19e;
		border-color: #8fd19e;
	}
	.game i.down {
		background: var(--red);
		border-color: var(--red);
	}
	.game b {
		margin-left: 4px;
	}
	.bidding {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		justify-content: center;
		max-width: 360px;
	}
	.chipbtn {
		min-width: 52px;
		padding: 12px 14px;
		border-radius: 14px;
		background: var(--paper);
		color: #111;
		font-weight: 800;
		font-size: 17px;
		cursor: pointer;
	}
	.chipbtn.pass {
		background: #ffffff1c;
		color: var(--paper);
	}
	.chipbtn:hover {
		translate: 0 -2px;
	}
	.backs .down {
		background: linear-gradient(135deg, #f2dc91, #b89a3a);
		margin-left: 4px;
	}
	.card.set {
		margin-left: 8px;
		opacity: 0.85;
	}
	@media (max-width: 720px) {
		.board {
			grid-template-columns: 1fr;
		}
		.felt {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: auto auto auto auto;
			min-height: 0;
			padding: 10px;
		}
		.s2 {
			grid-column: 1 / -1;
			grid-row: 1;
		}
		.s3 {
			grid-column: 1;
			grid-row: 2;
		}
		.s1 {
			grid-column: 2;
			grid-row: 2;
		}
		.middle {
			grid-column: 1 / -1;
			grid-row: 3;
			min-height: 240px;
		}
		.s0 {
			grid-column: 1 / -1;
			grid-row: 4;
		}
		.avatar {
			width: 40px;
			height: 40px;
		}
		/* Phones: wrapped rows, no overlap, so every card is easy to tap. */
		.hand {
			flex-wrap: wrap;
			height: auto;
			gap: 5px;
		}
		.card {
			height: 84px;
			margin-left: 0;
		}
		.trick {
			width: 230px;
			height: 236px;
		}
	}
</style>
