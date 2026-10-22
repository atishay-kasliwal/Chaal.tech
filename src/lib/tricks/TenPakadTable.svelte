<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import BotPortrait from '#lib/bots/BotPortrait.svelte';
	import { CAST } from '#lib/bots/cast.js';

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
	const range = (n: number) => Array.from({ length: n }, (_, i) => i);
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
	const isHost = $derived(room.hostId === selfId);
	const myTeam = $derived(me?.team ?? 0);
	// Seats from my point of view: me at the bottom; play goes anticlockwise, so the next player sits
	// on my right, my partner across, the last player on my left.
	const ring = $derived.by(() => {
		const mine = me?.seatNumber ?? 0;
		return [0, 3, 2, 1].map((k) => users.find((u) => u.seatNumber === (mine + k) % 4)?.id ?? null);
	});
	const freeCast = $derived(CAST.filter((c) => !users.some((u) => u.characterId === c.id)));
	const emptySeats = $derived(Math.max(0, 4 - users.length));
	const teamName = (t: number) => (t === myTeam ? 'Your team' : 'Opponents');
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
</script>

<div class="pakad" class:my-turn={myTurn}>
	<header class="bar">
		<h1>
			10 Pakad {#if room.hand}<span>Hand {room.hand}</span>{/if}
		</h1>
		{#if room.trump}<span class="trump" class:red={red(room.trump)} aria-label="Trump {room.trump}"
				>Trump {SUIT[room.trump]}</span
			>{:else if playing}<span class="trump none">No trump yet</span>{/if}
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
				<span>Tens this hand <b>{room.captured[t]?.tens ?? 0}</b></span>
				<span>Kots <b>{room.match.kots[t]}</b></span>
				<span>Hands <b>{room.match.handsWon[t]}</b></span>
				{#if room.match.run.team === t && room.match.run.hands > 1}<span class="run"
						>{room.match.run.hands} in a row</span
					>{/if}
			</div>
		{/each}
	</div>

	<div class="felt">
		{#each ring as id, k (k)}
			{@const u = user(id)}
			<div
				class="seat s{k}"
				class:turn={!!u && room.currentPlayerId === id && playing}
				class:away={!!u && !u.isBot && !u.connected}
				class:partner={k === 2}
			>
				{#if u}
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
							{#if u.isBot}<span class="tag bot">Bot</span>{/if}
							{#if !u.isBot && !u.connected}<span class="tag warn">Away</span>{/if}
						</small>
					</div>
					{#if id !== selfId && playing}<div class="backs" aria-label="{u.cardCount} cards">
							{#each range(Math.min(u.cardCount, 13)) as i (i)}<span></span>{/each}
						</div>{/if}
				{:else}
					<span class="empty-seat">Empty seat</span>
				{/if}
			</div>
		{/each}

		<div class="middle">
			{#if playing}
				<div class="trick">
					{#each shownTrick as p (p.id + p.card.rank + p.card.suit)}
						<div class="played p{ring.indexOf(p.id)}" class:won={shownWinner === p.id}>
							<DeckCard rank={p.card.rank} suit={p.card.suit as Suit} class="!h-24 !w-auto" />
						</div>
					{/each}
				</div>
				<div class="pile" aria-label="Centre pile">
					<span><b>{room.centre.count}</b> cards in the centre</span>
					{#if room.centre.tens}<span class="tens"
							>{room.centre.tens} {room.centre.tens === 1 ? 'ten' : 'tens'}</span
						>{/if}
					{#if room.lastTrick?.collected && !room.trick?.plays.length}<span class="took"
							>{name(room.lastTrick.winner)} collected the pile</span
						>{/if}
				</div>
				<p class="fine">{streakNote || trumpNote}</p>
			{:else}
				<div class="lobby">
					{#if room.result}
						<h2>{resultLine}</h2>
						{#if room.result.tens}
							<p class="fine">
								Tens: {teamName(myTeam)}
								{room.result.tens[myTeam]} · {teamName(1 - myTeam)}
								{room.result.tens[1 - myTeam]}
							</p>
							{#if resultWhy}<p class="fine">{resultWhy}</p>{/if}
						{/if}
					{:else}
						<h2>Four players, two teams, four tens</h2>
						<p class="fine">
							Win the same trick twice in a row to collect the centre pile. Take the tens.
						</p>
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
								onclick={() => act('start', [room.name])}>{room.hand ? 'Next hand' : 'Deal'}</button
							>{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if me && me.cardsInHand.length}
		<div class="hand" class:active={myTurn} aria-label="Your cards">
			{#each me.cardsInHand as c (c.rank + c.suit)}
				{@const ok = legalPlay(c)}
				<button
					class="card"
					class:ok
					class:trumpc={room.trump && c.suit === room.trump}
					disabled={!ok || busy}
					onclick={() => play(c)}
					aria-label="{c.rank} of {c.suit}{ok ? '' : ' (not playable now)'}"
					><DeckCard rank={c.rank} suit={c.suit as Suit} class="!h-full !w-auto" /></button
				>
			{/each}
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
	.pile {
		display: flex;
		gap: 10px;
		align-items: center;
		flex-wrap: wrap;
		justify-content: center;
		font-size: 13px;
	}
	.pile .tens {
		padding: 3px 10px;
		border-radius: 100px;
		background: var(--butter);
		color: var(--night);
		font-weight: 800;
	}
	.pile .took {
		color: var(--butter);
		font-weight: 700;
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
