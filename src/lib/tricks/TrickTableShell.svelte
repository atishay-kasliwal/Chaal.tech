<script lang="ts">
	import type { Snippet } from 'svelte';
	import { club } from '#lib/club/club.svelte.js';
	import { arrangeSeats } from '#lib/seat-layout.js';
	import BotAvatar from '#lib/teen-patti/BotAvatar.svelte';
	import SeatVideo from '#lib/components/SeatVideo.svelte';
	import DeckCard from '#lib/components/DeckCard.svelte';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import TalkBubble from '#lib/mascots/TalkBubble.svelte';
	import { botChat } from '#lib/mascots/talk-prefs.svelte.js';
	import { hushBotTalk } from '#lib/mascots/table-talk.js';

	/**
	 * The card-room table every trick game sits at (3 2 5, 10 Pakad, 29), in the Teen Patti table's
	 * look: the dim room, the racetrack felt with its rail (the owner's felt colour), seat tiles around
	 * it placed like Teen Patti's (#lib/seat-layout), a status pill, and a dock at the bottom with your
	 * own tile, your hand and the game's actions. Each game brings its own centre, hand and actions.
	 */
	export type ShellSeat = {
		id: string;
		seatNumber: number;
		name: string;
		isBot: boolean;
		mascotId: string | null;
		tags: string[];
		/** A short line in the name plate (tricks won, points, a bid). */
		sub?: string;
		cardCount: number;
		active: boolean;
		away: boolean;
	};

	let {
		title,
		info = [],
		status = '',
		focusedHand = false,
		seats,
		selfId,
		connected,
		seated,
		onLeave,
		onInvite,
		center,
		hand,
		actions
	}: {
		title: string;
		info?: { text: string; tone?: 'gold' | 'red' | 'plain' }[];
		status?: string;
		focusedHand?: boolean;
		seats: ShellSeat[];
		selfId: string;
		connected: boolean;
		seated: boolean;
		onLeave: () => void;
		onInvite: () => void;
		center: Snippet<[(id: string) => string]>;
		hand?: Snippet;
		actions?: Snippet;
	} = $props();

	const arranged = $derived(arrangeSeats(seats, selfId));
	const me = $derived(seats.find((s) => s.id === selfId));
	const opponents = $derived(arranged.filter((entry) => entry.user.id !== selfId));
	const placeOf = (id: string) => arranged.find((entry) => entry.user.id === id)?.position ?? 'top';
	const range = (n: number) => Array.from({ length: n }, (_, i) => i);
</script>

<div class="trick-shell" class:focused-hand={focusedHand} data-testid="table-scene">
	<h1 class="sr-only">{title} table</h1>
	<header class="topbar">
		<div class="brand">
			<img class="logo" src="/brand/chaal-mark.svg" width="34" height="34" alt="" />
			<span class="game-pill">{title}</span>
			{#each info as item (item.text)}<span class="info-pill {item.tone ?? 'plain'}"
					>{item.text}</span
				>{/each}
		</div>
		<div class="tools">
			{#if seats.some((s) => s.isBot)}
				<button
					class="tool"
					data-testid="bot-chat-toggle"
					aria-pressed={botChat.on}
					title={botChat.on ? 'Hide what bots say' : 'Show what bots say'}
					onclick={() => {
						botChat.set(!botChat.on);
						if (!botChat.on) hushBotTalk();
					}}>Bot chat {botChat.on ? 'on' : 'off'}</button
				>
			{/if}
			<button class="tool" onclick={onInvite}>Invite</button>
			<button class="tool" onclick={onLeave}>Leave</button>
		</div>
	</header>

	{#if status}<p class="status-pill" aria-live="polite">
			{#if focusedHand && me?.active}<span class="turn-indicator"
					><i aria-hidden="true"></i>Your turn</span
				>{/if}{focusedHand && me?.active ? status.replace(/^Your turn:\s*/i, '') : status}
		</p>{/if}
	{#if !connected}<p class="banner" role="status">Reconnecting. Your seat is kept.</p>{/if}
	{#if !seated}<p class="banner" role="status">Taking your seat…</p>{/if}

	<div class="arena" data-seats={seats.length}>
		<div class="felt" data-felt={club.settings.look.felt} aria-hidden="true">
			<div class="felt-inner"></div>
			<span class="rail-logo">chaal<small>.tech</small></span>
		</div>

		{#each opponents as entry (entry.user.id)}
			{@const s = entry.user}
			<div class="seat-slot pos-{entry.position}">
				<div class="tile" class:active={s.active} class:away={s.away}>
					<div class="frame">
						{#if s.isBot}
							<BotAvatar
								name={s.name}
								level="normal"
								mascotId={s.mascotId ?? undefined}
								thinking={s.active}
								size={150}
							/>
						{:else}
							<SeatVideo name={s.name} playerId={s.id} />
						{/if}
						{#if s.tags.length}
							<span class="seat-tags">
								{#each s.tags as tag (tag)}<span class="seat-status">{tag}</span>{/each}
							</span>
						{/if}
						<div class="plate">
							<span class="name" title={s.name}>{s.name}</span>
							{#if s.sub}<span class="sub">{s.sub}</span>{/if}
						</div>
						{#if s.cardCount > 0}
							<div class="backs" aria-label="{s.cardCount} cards">
								{#each range(Math.min(s.cardCount, 5)) as i (i)}<DeckCard
										faceDown
										class="!h-9 !w-auto"
									/>{/each}
							</div>
						{/if}
						{#if s.away}<span class="away-icon">Away</span>{/if}
					</div>
				</div>
				{#if s.isBot}<TalkBubble
						playerId={s.id}
						name={s.name}
						side={entry.position === 'top' ? 'below' : 'above'}
						phoneSide="below"
					/>{/if}
			</div>
		{/each}

		<div class="center">
			{@render center(placeOf)}
		</div>
	</div>

	<section class="seat-dock" class:turn={me?.active} aria-label="Your seat">
		<div class="me">
			<div class="tile mine" class:active={me?.active}>
				<div class="frame">
					{#if focusedHand}<div class="self-portrait">
							<CharacterAvatar playerId={selfId} size={104} label="Your profile photo" />
						</div>{:else}<SeatVideo name={me?.name ?? 'You'} playerId={selfId} />{/if}
				</div>
			</div>
			<div class="me-text">
				<strong>{me?.name ?? 'You'}</strong>
				{#if me?.tags.length}<small>{me.tags.join(' · ')}</small>{/if}
				{#if me?.sub}<small class="me-sub">{me.sub}</small>{/if}
			</div>
		</div>
		<div class="dock-hand">{@render hand?.()}</div>
		<div class="dock-actions">{@render actions?.()}</div>
	</section>
</div>

<style>
	/* The card room: the same lamp, cloth and rail as the Teen Patti table. */
	.trick-shell {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		background:
			radial-gradient(ellipse 60% 48% at 50% 42%, rgb(255 214 150 / 11%), transparent 70%),
			radial-gradient(ellipse 90% 75% at 50% 45%, #18201b 0%, #0d110e 55%, #060807 100%);
		padding: 0.5rem max(0.75rem, env(safe-area-inset-right)) 0.75rem
			max(0.75rem, env(safe-area-inset-left));
		color: #f8f2e5;
		overflow: clip;
	}
	.trick-shell > * {
		width: 100%;
		max-width: 92rem;
		margin-inline: auto;
	}
	.trick-shell > .topbar {
		max-width: none;
	}
	.topbar {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-top: env(safe-area-inset-top);
	}
	.brand {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.logo {
		width: 2.1rem;
		height: 2.1rem;
	}
	.game-pill {
		border: 1px solid rgb(242 220 145 / 45%);
		border-radius: 999px;
		background: rgb(242 220 145 / 12%);
		padding: 0.35rem 0.85rem;
		color: #f2dc91;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
	}
	.info-pill {
		border-radius: 999px;
		background: rgb(255 255 255 / 6%);
		padding: 0.35rem 0.75rem;
		color: rgb(248 242 229 / 80%);
		font-size: 0.8rem;
		font-weight: 650;
	}
	.info-pill.gold {
		background: #f8f2e5;
		color: #211c2e;
	}
	.info-pill.red {
		background: #f8f2e5;
		color: #b8322a;
	}
	.tools {
		display: flex;
		gap: 0.4rem;
	}
	.tool {
		border: 1px solid rgb(255 255 255 / 12%);
		border-radius: 0.6rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.45rem 0.8rem;
		font-size: 0.8rem;
		font-weight: 650;
		cursor: pointer;
		transition: background 0.2s;
	}
	.tool:hover {
		background: rgb(255 255 255 / 10%);
	}
	.status-pill {
		position: relative;
		z-index: 5;
		flex: none;
		width: auto;
		max-width: min(92vw, 40rem);
		border: 1px solid rgb(255 255 255 / 12%);
		border-radius: 999px;
		background: rgb(10 12 11 / 80%);
		padding: 0.45rem 1rem;
		font-size: 0.85rem;
		font-weight: 650;
		text-align: center;
	}
	.banner {
		flex: none;
		width: auto;
		border-radius: 999px;
		background: rgb(255 255 255 / 8%);
		padding: 0.3rem 0.9rem;
		color: rgb(248 242 229 / 70%);
		font-size: 0.8rem;
	}

	/* ------------------------------ felt ------------------------------ */
	.arena {
		position: relative;
		flex: 1 1 0;
		min-height: 0;
		isolation: isolate;
	}
	.felt {
		--felt-1: #1f7a4c;
		--felt-2: #15603a;
		--felt-3: #0c4127;
		--felt-4: #08311d;
		--rail: clamp(0.9rem, 2.6vw, 2rem);
		position: absolute;
		inset: 10% 6% 4% 6%;
		transform: perspective(1400px) rotateX(20deg);
		transform-origin: 50% 100%;
		z-index: -1;
		border-radius: 999px;
		background:
			radial-gradient(ellipse 70% 40% at 50% 0%, rgb(255 225 180 / 16%), transparent 70%),
			linear-gradient(180deg, #3a2618 0%, #24160d 45%, #150c06 100%);
		padding: var(--rail);
		box-shadow:
			0 0.45rem 0 #22150b,
			0 0.8rem 0 #120a05,
			0 0.85rem 0 rgb(255 214 150 / 10%),
			0 2.8rem 4.5rem -0.5rem rgb(0 0 0 / 80%),
			0 1.2rem 1.6rem rgb(0 0 0 / 55%),
			inset 0 2px 1px rgb(255 228 190 / 22%),
			inset 0 -4px 8px rgb(0 0 0 / 60%),
			inset 0 0 0 1px rgb(0 0 0 / 55%);
	}
	.felt[data-felt='sapphire'] {
		--felt-1: #22568f;
		--felt-2: #1a4474;
		--felt-3: #102e52;
		--felt-4: #0a203d;
	}
	.felt[data-felt='crimson'] {
		--felt-1: #8c2633;
		--felt-2: #701c28;
		--felt-3: #50131c;
		--felt-4: #3a0d14;
	}
	.felt[data-felt='onyx'] {
		--felt-1: #33403b;
		--felt-2: #26302c;
		--felt-3: #19201d;
		--felt-4: #111614;
	}
	.felt::before {
		position: absolute;
		inset: calc(var(--rail) * 0.45);
		border: 1px dashed rgb(226 190 130 / 22%);
		border-radius: inherit;
		content: '';
		pointer-events: none;
	}
	.felt-inner {
		position: relative;
		height: 100%;
		overflow: hidden;
		border-radius: inherit;
		background:
			radial-gradient(ellipse 55% 50% at 50% 40%, rgb(255 240 200 / 13%), transparent 72%),
			radial-gradient(
				ellipse at 50% 45%,
				var(--felt-1) 0%,
				var(--felt-2) 50%,
				var(--felt-3) 85%,
				var(--felt-4) 100%
			);
		box-shadow:
			0 0 0 3px #8a5a2c,
			0 0 0 4px #c48a4a,
			0 0 0 6px #4a2c12,
			inset 0 0.9rem 1.6rem rgb(0 0 0 / 50%),
			inset 0 0 2.5rem rgb(0 0 0 / 35%);
	}
	.felt-inner::before {
		position: absolute;
		inset: clamp(1.4rem, 9%, 3.5rem);
		border: 1.5px solid rgb(240 210 140 / 16%);
		border-radius: inherit;
		content: '';
	}
	.rail-logo {
		position: absolute;
		top: calc(var(--rail) * 0.5);
		right: 21%;
		translate: 0 -50%;
		color: rgb(58 36 20 / 92%);
		font-size: clamp(0.7rem, calc(var(--rail) * 0.62), 1.15rem);
		font-weight: 900;
		text-shadow:
			0 -1px 0 rgb(0 0 0 / 70%),
			0 1px 0 rgb(255 226 180 / 16%);
		user-select: none;
	}
	.rail-logo small {
		font-size: 0.8em;
		font-weight: 700;
	}

	/* ------------------------------ seats ------------------------------ */
	.seat-slot {
		position: absolute;
		z-index: 2;
		width: clamp(9rem, 21vw, 17rem);
		translate: -50% -50%;
	}
	.pos-top {
		left: 50%;
		top: 13%;
	}
	.pos-left {
		left: 13%;
		top: 46%;
	}
	.pos-right {
		left: 87%;
		top: 46%;
	}
	.pos-upper-left {
		left: 17%;
		top: 24%;
	}
	.pos-upper-right {
		left: 83%;
		top: 24%;
	}
	.tile {
		border-radius: 1rem;
		padding: 3px;
		background: linear-gradient(160deg, #3a3326, #1c1a14);
		box-shadow:
			0 1.3rem 2rem -0.7rem rgb(0 0 0 / 80%),
			0 0.35rem 0.7rem rgb(0 0 0 / 40%);
		transition: box-shadow 300ms ease;
	}
	.tile.active {
		background: linear-gradient(160deg, #f2dc91, #c9a95c);
		box-shadow:
			0 1.3rem 2rem -0.7rem rgb(0 0 0 / 80%),
			0 0 1.8rem rgb(233 191 98 / 45%);
	}
	.tile.away {
		opacity: 0.6;
	}
	.frame {
		position: relative;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border-radius: 0.85rem;
		background: #0e1714;
		display: grid;
		place-items: center;
	}
	.frame::after {
		position: absolute;
		inset: 0;
		z-index: 2;
		border-radius: inherit;
		background: linear-gradient(
			180deg,
			rgb(255 255 255 / 13%) 0%,
			rgb(255 255 255 / 3%) 30%,
			transparent 55%,
			rgb(0 0 0 / 28%) 100%
		);
		box-shadow: inset 0 1px 0 rgb(255 255 255 / 22%);
		content: '';
		pointer-events: none;
	}
	.frame :global(.seat-video) {
		width: 100%;
		height: 100%;
		aspect-ratio: 4 / 3;
	}
	.frame :global(.camera-off-label) {
		display: none;
	}
	.seat-tags {
		position: absolute;
		z-index: 3;
		top: 0.4rem;
		left: 0.4rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.2rem;
	}
	.seat-status {
		border-radius: 999px;
		background: rgb(33 28 46 / 78%);
		padding: 0.12rem 0.5rem;
		color: #f3d38a;
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		backdrop-filter: blur(6px);
	}
	.plate {
		position: absolute;
		z-index: 3;
		top: 0.4rem;
		right: 0.4rem;
		display: flex;
		max-width: calc(100% - 5rem);
		align-items: center;
		gap: 0.4rem;
		border-radius: 999px;
		background: rgb(33 28 46 / 78%);
		padding: 0.15rem 0.55rem;
		box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
		backdrop-filter: blur(6px);
	}
	.name {
		overflow: hidden;
		font-size: 0.85rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sub {
		flex-shrink: 0;
		color: #f2dc91;
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}
	.backs {
		position: absolute;
		z-index: 3;
		right: 0.45rem;
		bottom: 0.45rem;
		display: flex;
	}
	.backs :global(*) {
		margin-left: -1.1rem;
	}
	.away-icon {
		position: absolute;
		inset: 0;
		z-index: 3;
		display: grid;
		place-items: center;
		background: rgb(5 9 8 / 55%);
		color: rgb(233 226 207 / 80%);
		font-size: 0.8rem;
		font-weight: 700;
	}

	/* ------------------------------ centre ----------------------------- */
	.center {
		position: absolute;
		z-index: 3;
		left: 50%;
		top: 58%;
		translate: -50% -50%;
		display: grid;
		justify-items: center;
		gap: 0.6rem;
		width: min(42rem, 56%);
	}

	/* ------------------------------- dock ------------------------------ */
	.seat-dock {
		flex: none;
		display: grid;
		grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr) minmax(14rem, 22rem);
		align-items: center;
		gap: 1rem;
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 1.2rem;
		background: linear-gradient(180deg, #161d18, #0c100e);
		padding: 0.6rem 0.9rem;
		box-shadow: 0 -0.6rem 2rem rgb(0 0 0 / 40%);
	}
	.seat-dock.turn {
		border-color: rgb(242 220 145 / 45%);
	}
	.me {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}
	.tile.mine {
		width: 6.5rem;
		flex: none;
	}
	.me-text {
		display: grid;
		min-width: 0;
		gap: 0.1rem;
	}
	.me-text strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.me-text small {
		color: rgb(248 242 229 / 65%);
		font-size: 0.75rem;
	}
	.me-text .me-sub {
		color: #f2dc91;
		font-weight: 700;
	}
	.dock-hand {
		display: flex;
		justify-content: center;
		min-width: 0;
	}
	.dock-actions {
		display: grid;
		justify-items: end;
		gap: 0.4rem;
	}
	.turn-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-bottom: 0.2rem;
		color: #f2dc91;
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.focused-hand .backs :global(.deck-card) {
		animation: deal-back 300ms ease-out both;
	}
	.focused-hand .backs :global(.deck-card:nth-child(2)) {
		animation-delay: 70ms;
	}
	.focused-hand .backs :global(.deck-card:nth-child(3)) {
		animation-delay: 140ms;
	}
	.focused-hand .backs :global(.deck-card:nth-child(4)) {
		animation-delay: 210ms;
	}
	.focused-hand .backs :global(.deck-card:nth-child(5)) {
		animation-delay: 280ms;
	}
	@keyframes deal-back {
		from {
			opacity: 0;
			transform: translateY(3rem) scale(0.7);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.focused-hand .backs :global(.deck-card) {
			animation: none;
		}
	}
	.turn-indicator i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: #f2dc91;
	}
	.focused-hand .seat-dock {
		grid-template-columns: minmax(9rem, 12rem) minmax(0, 1fr) minmax(11rem, 16rem);
		margin-top: 1.5rem;
		overflow: visible;
	}
	.focused-hand .pos-top {
		top: max(7rem, 18%);
	}
	.focused-hand .me {
		align-self: stretch;
		align-items: flex-start;
		padding-top: 1rem;
	}
	.focused-hand .me-text {
		padding-top: 1rem;
	}
	.focused-hand .tile.mine {
		width: 6.5rem;
		background: transparent;
		box-shadow: none;
	}
	.focused-hand .mine .frame {
		overflow: visible;
		background: transparent;
	}
	.focused-hand .mine .frame::after {
		display: none;
	}
	.self-portrait {
		position: relative;
		translate: 0 -2.5rem;
	}

	/* ------------------------------ phones ----------------------------- */
	@media (min-width: 761px) and (max-width: 1100px) {
		.focused-hand .seat-dock {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.focused-hand .dock-hand {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.focused-hand .dock-actions {
			grid-column: 2;
			grid-row: 1;
		}
	}
	@media (max-width: 760px) {
		.arena {
			display: grid;
			grid-template-columns: repeat(var(--cols, 3), minmax(0, 1fr));
			grid-template-rows: auto 1fr;
			gap: 0.4rem;
		}
		.arena[data-seats='3'] {
			--cols: 2;
		}
		.felt {
			inset: 30% 2% 2% 2%;
			transform: perspective(1400px) rotateX(10deg);
			--rail: 0.8rem;
		}
		.seat-slot {
			/* Relative, not static: a talk bubble positions against its own seat. */
			position: relative;
			inset: auto;
			grid-row: 1;
			width: auto;
			translate: none;
		}
		.backs {
			display: none;
		}
		.plate {
			max-width: calc(100% - 0.8rem);
		}
		.seat-tags {
			top: auto;
			bottom: 0.4rem;
		}
		.center {
			position: relative;
			left: auto;
			top: auto;
			translate: none;
			grid-column: 1 / -1;
			grid-row: 2;
			align-self: center;
			justify-self: center;
			width: 100%;
			padding: 0.5rem;
		}
		.seat-dock {
			grid-template-columns: 1fr;
			gap: 0.5rem;
			padding: 0.5rem;
		}
		.focused-hand .seat-dock {
			grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
			gap: 0.3rem;
			margin-top: 0.75rem;
		}
		.focused-hand .me {
			grid-column: 1;
			grid-row: 1;
			gap: 0.75rem;
			align-items: center;
			padding-top: 0;
		}
		.focused-hand .dock-hand {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.focused-hand .center {
			gap: 0.3rem;
		}
		.focused-hand .dock-actions {
			grid-column: 2;
			grid-row: 1;
		}
		.focused-hand .me-text {
			padding-top: 0;
		}
		.focused-hand .tile.mine {
			width: 4rem;
		}
		.self-portrait {
			translate: 0 -0.75rem;
		}
		.self-portrait :global(.avatar-ring) {
			width: 4rem;
			height: 4rem;
		}
		.tile.mine {
			width: 3.6rem;
		}
		.dock-actions {
			justify-items: stretch;
		}
	}
	@media (max-height: 700px) {
		.focused-hand {
			overflow-y: auto;
		}
		.focused-hand .arena {
			flex: none;
			min-height: 23rem;
		}
	}
</style>
