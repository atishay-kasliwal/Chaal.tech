<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';
	import BotPortrait from '#lib/bots/BotPortrait.svelte';
	import { CAST } from '#lib/bots/cast.js';

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
	const isHost = $derived(room.hostId === selfId);
	// Seats around the felt, from my point of view: me at the bottom, then clockwise.
	const ring = $derived.by(() => {
		const ids = room.order.length === 3 ? room.order : users.map((u) => u.id);
		const i = Math.max(ids.indexOf(selfId), 0);
		return [ids[i], ids[(i + 1) % ids.length], ids[(i + 2) % ids.length]].filter(Boolean);
	});
	const freeCast = $derived(CAST.filter((c) => !users.some((u) => u.characterId === c.id)));
	const emptySeats = $derived(Math.max(0, 3 - users.length));
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
</script>

<div class="t325" class:my-turn={myTurn}>
	<header class="bar">
		<h1>
			3 2 5 {#if room.round}<span>Round {room.round}</span>{/if}
		</h1>
		{#if room.trump}<span class="trump" class:red={red(room.trump)} aria-label="Trump {room.trump}"
				>Trump {SUIT[room.trump]}</span
			>{/if}
		<p class="turn-line" aria-live="polite">{status}</p>
		<div class="tools">
			<button class="ghost" onclick={onInvite}>Invite</button>
			<button class="ghost" onclick={onLeave}>Leave</button>
		</div>
	</header>

	{#if !connected}<p class="banner" role="status">Reconnecting. Your seat is kept.</p>{/if}
	{#if !seated}<p class="banner" role="status">Taking your seat…</p>{/if}

	<div class="felt">
		{#each ring as id, k (id)}
			{@const u = user(id)}
			{#if u}
				<div
					class="seat s{k}"
					class:turn={room.currentPlayerId === id && playing}
					class:away={!u.isBot && !u.connected}
				>
					<div class="avatar">
						{#if u.isBot}<BotPortrait
								mascotId={u.mascotId}
								name={u.username}
								size={64}
							/>{:else}<span class="initial">{u.username.slice(0, 1).toUpperCase()}</span>{/if}
					</div>
					<div class="who">
						<strong>{id === selfId ? 'You' : u.username}</strong>
						<small>
							{#if room.dealerId === id}<span class="tag">Dealer</span>{/if}
							{#if u.isBot}<span class="tag bot">Bot</span>{/if}
							{#if !u.isBot && !u.connected}<span class="tag warn">Away</span>{/if}
							{#if (room.scores[id] ?? 0) !== 0 || room.round}<span class="score"
									>{(room.scores[id] ?? 0) > 0 ? '+' : ''}{room.scores[id] ?? 0}</span
								>{/if}
						</small>
					</div>
					{#if room.quotas[id]}
						<div class="quota" aria-label="Won {room.tricks[id] ?? 0} of {room.quotas[id]} tricks">
							<b>{room.tricks[id] ?? 0}/{room.quotas[id]}</b>
							<span class="pips"
								>{#each pips(id) as p, i (i)}<i class={p}></i>{/each}</span
							>
						</div>
					{/if}
					{#if id !== selfId && playing}<div class="backs" aria-label="{u.cardCount} cards">
							{#each range(Math.min(u.cardCount, 10)) as i (i)}<span></span>{/each}
						</div>{/if}
				</div>
			{/if}
		{/each}

		<div class="middle">
			{#if room.stage === 'pull' && room.pull && myTurn && room.pull.step === 'take'}
				<div class="facedown" role="group" aria-label="Face-down cards to pull from">
					{#each range(room.legalActions.pull) as position (position)}
						<button
							class="fd"
							disabled={busy}
							onclick={() => trick('pull', { position })}
							aria-label="Pull card {position + 1}"
							><DeckCard faceDown class="!h-24 !w-auto" /></button
						>
					{/each}
				</div>
			{:else if room.stage === 'pull' && room.pull?.taken && myTurn}
				<div class="pulled">
					<p>You pulled</p>
					<DeckCard
						rank={room.pull.taken.rank}
						suit={room.pull.taken.suit as Suit}
						class="!h-28 !w-auto"
					/>
					<p>Now tap a card in your hand to return</p>
				</div>
			{:else if room.stage === 'trump' && myTurn}
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
			{:else if playing}
				<div class="trick">
					{#each shownTrick as p (p.id + p.card.rank + p.card.suit)}
						<div class="played p{ring.indexOf(p.id)}" class:won={shownWinner === p.id}>
							<DeckCard rank={p.card.rank} suit={p.card.suit as Suit} class="!h-28 !w-auto" />
						</div>
					{/each}
				</div>
			{:else}
				<div class="lobby">
					{#if room.result}
						<h2>
							{room.result.reason === 'abandoned' ? 'Round abandoned' : `Round ${room.round}`}
						</h2>
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
											picking = false;
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
								onclick={() => act('start', [])}>{room.round ? 'Next round' : 'Deal'}</button
							>{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if me && me.cardsInHand.length}
		<div class="hand" class:active={myTurn} aria-label="Your cards">
			{#each me.cardsInHand as c (c.rank + c.suit)}
				{@const ok = legalPlay(c) || legalGive(c)}
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
		</div>
	{/if}
</div>

<style>
	.t325 {
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
		word-spacing: 0.18em;
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
	.trump.red,
	.suit.red {
		color: #c0392b;
	}
	.turn-line {
		flex: 1;
		color: var(--butter);
		font-weight: 700;
		min-width: 200px;
	}
	.tools {
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
	.felt {
		position: relative;
		flex: 1;
		min-height: 420px;
		border-radius: 28px;
		background: radial-gradient(ellipse at 50% 45%, #2c6a47, var(--felt) 60%, #163626);
		border: 1px solid #ffffff14;
		display: grid;
		grid-template-columns: 1fr 1.6fr 1fr;
		grid-template-rows: 1fr auto;
		padding: 18px;
	}
	.seat {
		display: grid;
		gap: 8px;
		align-content: start;
		justify-items: center;
		padding: 12px;
		border-radius: 18px;
		background: #00000030;
		border: 2px solid transparent;
		transition:
			border-color 0.25s,
			box-shadow 0.25s;
		max-width: 220px;
	}
	.seat.turn {
		border-color: var(--butter);
		box-shadow: 0 0 0 4px #f2dc9122;
	}
	.seat.away {
		opacity: 0.6;
	}
	.s1 {
		grid-column: 1;
		grid-row: 1;
		justify-self: start;
		align-self: start;
	}
	.s2 {
		grid-column: 3;
		grid-row: 1;
		justify-self: end;
		align-self: start;
	}
	.s0 {
		grid-column: 2;
		grid-row: 2;
		justify-self: center;
		grid-template-columns: auto auto auto;
		align-items: center;
		max-width: none;
	}
	.avatar {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		overflow: hidden;
		display: grid;
		place-items: center;
		background: #ffffff14;
	}
	.initial {
		font-family: var(--font-display);
		font-size: 28px;
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
	.score {
		font-weight: 800;
		font-size: 12px;
	}
	.quota {
		display: grid;
		justify-items: center;
		gap: 4px;
	}
	.quota b {
		font-family: var(--font-display);
		font-size: 20px;
	}
	.pips {
		display: flex;
		gap: 3px;
	}
	.pips i {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid #ffffff55;
	}
	.pips i.made {
		background: var(--butter);
		border-color: var(--butter);
	}
	.pips i.extra {
		background: #8fd19e;
		border-color: #8fd19e;
	}
	.backs {
		display: flex;
	}
	.backs span {
		width: 12px;
		height: 18px;
		margin-left: -4px;
		border-radius: 3px;
		background: linear-gradient(135deg, #7b2232, #4a1520);
		border: 1px solid #ffffff40;
	}
	.middle {
		grid-column: 2;
		grid-row: 1;
		display: grid;
		place-items: center;
	}
	.trick {
		position: relative;
		width: 260px;
		height: 200px;
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
		left: 0;
		top: 10px;
		rotate: -8deg;
	}
	.played.p2 {
		right: 0;
		top: 10px;
		rotate: 8deg;
	}
	.played.won {
		filter: drop-shadow(0 0 12px var(--butter));
	}
	.choose,
	.facedown,
	.cast {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: center;
	}
	.suit {
		width: 84px;
		height: 104px;
		border-radius: 16px;
		background: var(--paper);
		color: #111;
		font-size: 44px;
		display: grid;
		place-items: center;
		cursor: pointer;
		transition: translate 0.2s;
	}
	.suit small {
		font-size: 12px;
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
	.pulled,
	.lobby {
		display: grid;
		gap: 10px;
		justify-items: center;
		text-align: center;
	}
	.lobby h2 {
		font-family: var(--font-display);
		font-size: 26px;
		font-weight: 800;
	}
	.fine {
		font-size: 13px;
		color: #e8e0f0;
	}
	.results {
		border-collapse: collapse;
		font-size: 14px;
	}
	.results th,
	.results td {
		padding: 6px 12px;
		text-align: center;
	}
	.results th {
		font-size: 11px;
		color: var(--muted);
		text-transform: uppercase;
	}
	.pos {
		color: #8fd19e;
		font-weight: 800;
	}
	.neg {
		color: var(--red);
		font-weight: 800;
	}
	.seats-list {
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
	.row {
		display: flex;
		gap: 10px;
	}
	.hand {
		display: flex;
		justify-content: center;
		gap: 0;
		height: clamp(110px, 16dvh, 160px);
		padding: 6px 0;
	}
	.card {
		height: 100%;
		margin-left: -18px;
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
		.felt {
			grid-template-columns: 1fr 1fr;
			grid-template-rows: auto auto auto;
			min-height: 0;
			gap: 10px;
			padding: 10px;
		}
		.s1 {
			grid-column: 1;
			grid-row: 1;
		}
		.s2 {
			grid-column: 2;
			grid-row: 1;
		}
		.middle {
			grid-column: 1 / -1;
			grid-row: 2;
			min-height: 220px;
		}
		.s0 {
			grid-column: 1 / -1;
			grid-row: 3;
		}
		.seat {
			padding: 8px;
		}
		.avatar {
			width: 44px;
			height: 44px;
		}
		.card {
			margin-left: -34px;
		}
		.trick {
			width: 220px;
			height: 180px;
		}
	}
</style>
