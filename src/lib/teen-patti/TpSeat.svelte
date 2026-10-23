<script lang="ts">
	import { Crown, WifiOff } from '@lucide/svelte';
	import SeatVideo from '#lib/components/SeatVideo.svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';
	import TpCard from './TpCard.svelte';
	import CasinoChip from '#lib/components/CasinoChip.svelte';
	import ChipStack from '#lib/components/ChipStack.svelte';
	import BotAvatar from './BotAvatar.svelte';
	import { money, balanceLabel, coversBoot } from './format.js';
	import { onMount } from 'svelte';
	import Mascot from '#lib/mascots/Mascot.svelte';
	import { club } from '#lib/club/club.svelte.js';
	import { MASCOT_SIZE } from '#lib/mascots/size.js';
	import { mascotFor, mascots, reactions } from '#lib/mascots/mascots.svelte.js';
	import TalkBubble from '#lib/mascots/TalkBubble.svelte';
	import { restingFace, WATCH_ACTIVE } from '#lib/mascots/table-reactions.js';
	import type {
		PublicPresenceTurn,
		PublicPresenceGeometry
	} from '#lib/mascots/presence/table-bridge.js';

	let {
		user,
		boot,
		active,
		host,
		inHand,
		showdown,
		winner,
		loser,
		handLabel,
		remaining,
		total,
		dealKey,
		showMedia,
		mediaParticipant,
		onspotlight,
		onremove,
		presencePreview = false,
		talkSide = 'above',
		publicFeed = [],
		publicTurn = null,
		publicHandKey = null,
		publicGeometry = { seats: [], pot: { x: 50, y: 50 } }
	}: {
		user: User;
		boot: number;
		active: boolean;
		host: boolean;
		/** Dealt into the current or just-finished hand. */
		inHand: boolean;
		showdown: boolean;
		winner: boolean;
		loser: boolean;
		handLabel: string | null;
		remaining: number;
		total: number;
		dealKey: string | null;
		showMedia: boolean;
		mediaParticipant?: MediaParticipant;
		/** Open this player's video large. */
		onspotlight?: () => void;
		/** Host only, between hands: take this bot off the table. */
		onremove?: () => void;
		presencePreview?: boolean;
		/** Where a character's line shows: above the tile, or below it for seats along the top. */
		talkSide?: 'above' | 'below';
		publicFeed?: readonly unknown[];
		publicTurn?: PublicPresenceTurn | null;
		publicHandKey?: string | null;
		publicGeometry?: PublicPresenceGeometry;
	} = $props();

	/** Phones have less felt between seats and pot, so bets draw at most two stacks there. */
	let narrow = $state(false);
	onMount(() => {
		mascots.load();
		const query = window.matchMedia('(max-width: 639px)');
		const update = () => (narrow = query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	const away = $derived(user.hasLeft || !user.connected);
	const mascot = $derived(user.bot ? null : mascotFor(user.id));
	const mascotSize = $derived(club.settings.mascotSize ?? MASCOT_SIZE.default);
	const face = $derived(reactions.byPlayer[user.id]?.pose ?? restingFace({ away }));
	const revealed = $derived(user.cardsInHand.some((card) => card.rank > 0));
	const progress = $derived(total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0);
	const seconds = $derived(Math.ceil(remaining / 1000));
	const urgency = $derived(progress > 0.5 ? 'calm' : progress > 0.2 ? 'warn' : 'hurry');
	const status = $derived(
		away
			? user.hasLeft
				? 'Left'
				: 'Away'
			: !inHand
				? !coversBoot(user, boot)
					? 'Out of chips'
					: user.ready === false
						? 'Sitting out'
						: null
				: user.isPacked
					? 'Packed'
					: user.isBlind
						? 'Blind'
						: 'Seen'
	);
</script>

<div
	class="tp-seat"
	class:active
	class:packed={inHand && user.isPacked}
	class:winner
	class:loser
	class:away
	data-testid="player-seat"
	data-player-id={user.id}
	data-bot-id={user.botId}
	data-bot-style={user.botStyleId}
	data-active={active}
	aria-label="{user.username}{active ? ', their turn' : ''}{status ? ', ' + status : ''}"
>
	<div
		class="ring {urgency}"
		style:--p={active ? progress : 0}
		role={active ? 'timer' : undefined}
		aria-label={active ? `${seconds} seconds left` : undefined}
	>
		<div class="frame">
			<button
				class="spot"
				onclick={onspotlight}
				aria-label="Show {user.username}’s video large"
				title="Tap to see {user.username} large"
			></button>
			{#if user.bot}
				<BotAvatar
					name={user.username}
					level={user.bot}
					mascotId={user.botMascotId}
					thinking={active}
					size={mascotSize * 2.1}
					reaction={face}
					watch={active ? '.pot' : WATCH_ACTIVE}
					{presencePreview}
					publicSeatId={user.id}
					{publicFeed}
					{publicTurn}
					{publicHandKey}
					{publicGeometry}
				/>
			{:else}
				<SeatVideo
					participant={showMedia && !away ? mediaParticipant : undefined}
					name={user.username}
					playerId={user.id}
				/>
			{/if}
			{#if onremove}
				<button
					class="remove-bot"
					onclick={onremove}
					aria-label="Remove {user.username}"
					title="Remove bot">×</button
				>
			{/if}
			{#if status}
				<span class="seat-status" data-status={status.toLowerCase().replaceAll(' ', '-')}
					>{status}</span
				>
			{/if}
			<!-- Name tag: top right of the tile, with a chip beside the stack size. -->
			<div class="plate">
				<span class="name" title={user.username}>
					{#if host}<Crown class="crown h-3 w-3" aria-label="Host" />{/if}
					{user.username}
				</span>
				<span class="balance" class:hidden-balance={user.balance === null}
					><CasinoChip denomination={100} size="0.95em" decorative />{balanceLabel(user)}</span
				>
			</div>
			{#if active && total > 0}
				<span class="clock {urgency}">{seconds}s</span>
			{/if}
			{#if away && !user.hasLeft}
				<span class="away-icon"><WifiOff class="h-4 w-4" /></span>
			{/if}
			{#if inHand && user.cardsInHand.length}
				<div
					class="hand"
					class:big={revealed && showdown}
					role="group"
					aria-label="{user.username} cards"
				>
					{#key dealKey}
						{#each user.cardsInHand as card, index (index)}
							<TpCard
								{card}
								faceUp={revealed}
								flip={revealed}
								deal={revealed ? -1 : index}
								dim={user.isPacked && !revealed}
								highlight={winner && revealed}
								wild={user.wildCards?.includes(index) ?? false}
							/>
						{/each}
					{/key}
				</div>
				{#if handLabel && showdown}
					<p class="hand-label" class:win={winner}>{handLabel}</p>
				{/if}
			{/if}
		</div>
		{#if mascot && !user.bot}
			<!-- Straddles the tile's right border, half over the video, dipping just below its bottom edge. -->
			<span class="peek" style:--size="{mascotSize}px">
				<Mascot
					id={mascot}
					size={mascotSize}
					reaction={face}
					watch={active ? '.pot' : WATCH_ACTIVE}
					label={user.username}
				/>
			</span>
		{/if}
	</div>

	{#if user.bot}<TalkBubble playerId={user.id} name={user.username} side={talkSide} />{/if}

	{#if inHand && (user.handBet ?? 0) > 0 && !showdown}
		<span class="bet" aria-label="{money(user.handBet)} in the pot">
			<ChipStack
				amount={user.handBet ?? 0}
				size="var(--bet-chip)"
				height={4}
				stacks={narrow ? 2 : 3}
			/><span class="bet-amount">{money(user.handBet)}</span>
		</span>
	{/if}
</div>

<style>
	.tp-seat {
		--card-h: clamp(1.9rem, calc(var(--seat-w, 12rem) * 0.19), 3.6rem);
		--bet-chip: 2.8rem;
		position: relative;
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		transition:
			opacity 300ms ease,
			filter 300ms ease;
	}
	.ring {
		--ring-color: var(--tp-felt-glow);
		position: relative;
		width: 100%;
		border-radius: 1.05rem;
		padding: 3px;
		/* Turn timer sweeps over a brushed-gold bezel. */
		background:
			conic-gradient(var(--ring-color) calc(var(--p) * 1turn), transparent 0) border-box,
			linear-gradient(
					160deg,
					rgb(255 236 200 / 45%),
					rgb(150 110 60 / 30%) 35%,
					rgb(40 28 16 / 60%) 70%,
					rgb(200 160 100 / 35%)
				)
				border-box;
		/* The tile stands off the felt and casts a shadow onto it. */
		box-shadow:
			0 1.3rem 2rem -0.7rem rgb(0 0 0 / 80%),
			0 0.35rem 0.7rem rgb(0 0 0 / 40%);
		transition: box-shadow 300ms ease;
	}
	.ring.calm {
		--ring-color: #7fd49b;
	}
	.ring.warn {
		--ring-color: #f2dc91;
	}
	.ring.hurry {
		--ring-color: #f0715f;
	}
	.active .ring {
		box-shadow:
			0 1.3rem 2rem -0.7rem rgb(0 0 0 / 80%),
			0 0 0 1px rgb(255 255 255 / 6%),
			0 0 1.8rem rgb(233 191 98 / 40%);
	}
	.winner .ring {
		background: linear-gradient(135deg, #f2dc91, #e1ca89);
		box-shadow: 0 0 2rem rgb(242 220 145 / 55%);
	}
	/* The mascot straddles the tile's right border: half over the video, half outside,
	   starting at the bottom edge and dipping a little below it. Offsets are in cell sizes, since each sheet
	   cell leaves a margin around the figure. */
	.peek {
		position: absolute;
		z-index: 4;
		right: calc(var(--size) * -0.5 + var(--mascot-inset, 0px));
		bottom: calc(var(--size) * -0.32);
	}
	.frame {
		position: relative;
		overflow: hidden;
		border-radius: 0.85rem;
		background: #0e1714;
	}
	/* Glass over the video: a sheen across the top and a soft vignette at the bottom. */
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
		box-shadow:
			inset 0 1px 0 rgb(255 255 255 / 22%),
			inset 0 0 0 1px rgb(255 255 255 / 6%);
		content: '';
		pointer-events: none;
	}
	.tp-seat .frame :global(.seat-video) {
		aspect-ratio: 4 / 3;
		border-radius: 0.85rem;
	}
	.tp-seat .frame :global(.seat-video-status) {
		display: flex;
		inset-inline: 0.35rem;
		bottom: 0.35rem;
		font-size: 0.6rem;
	}
	.tp-seat .frame :global(.camera-off-label) {
		display: none;
	}
	.spot {
		position: absolute;
		inset: 0;
		z-index: 2;
		cursor: zoom-in;
	}
	.remove-bot {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		z-index: 4;
		display: grid;
		width: 1.6rem;
		height: 1.6rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(33 28 46 / 75%);
		color: #f0a898;
		font-size: 1rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
	}
	.remove-bot:hover {
		background: #8c3324;
		color: #fff;
	}
	.seat-status {
		position: absolute;
		z-index: 3;
		top: 0.4rem;
		left: 0.4rem;
		border-radius: 999px;
		background: rgb(33 28 46 / 78%);
		padding: 0.12rem 0.5rem;
		color: #e9e2cf;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		backdrop-filter: blur(6px);
	}
	.seat-status[data-status='blind'] {
		color: #a9d7ff;
	}
	.seat-status[data-status='seen'] {
		color: #f3d38a;
	}
	.seat-status[data-status='packed'],
	.seat-status[data-status='left'],
	.seat-status[data-status='away'],
	.seat-status[data-status='sitting-out'],
	.seat-status[data-status='out-of-chips'] {
		color: rgb(233 226 207 / 60%);
	}
	.clock {
		position: absolute;
		z-index: 3;
		top: 2.1rem;
		right: 0.4rem;
		border-radius: 999px;
		background: rgb(33 28 46 / 82%);
		padding: 0.12rem 0.5rem;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		font-weight: 800;
	}
	.clock.calm {
		color: #9be0b1;
	}
	.clock.warn {
		color: #f0cc78;
	}
	.clock.hurry {
		color: #ff8f7e;
		animation: tp-pulse 1s ease-in-out infinite;
	}
	.away-icon {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		background: rgb(5 9 8 / 55%);
		color: rgb(233 226 207 / 70%);
	}
	/* Name tag over the top-right of the tile: name, then chip and stack size. */
	.plate {
		position: absolute;
		z-index: 3;
		top: 0.4rem;
		right: 0.4rem;
		display: flex;
		max-width: calc(100% - 5.5rem);
		min-width: 0;
		align-items: center;
		gap: 0.4rem;
		border-radius: 999px;
		background: rgb(33 28 46 / 78%);
		padding: 0.15rem 0.55rem 0.15rem 0.6rem;
		line-height: 1.15;
		box-shadow: 0 2px 6px rgb(0 0 0 / 35%);
		backdrop-filter: blur(6px);
	}
	.name {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 0.25rem;
		overflow: hidden;
		color: #f8f2e5;
		font-size: 0.85rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name :global(.crown) {
		flex-shrink: 0;
		color: #f2dc91;
	}
	.balance {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 0.2rem;
		color: #f2dc91;
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.balance.hidden-balance {
		color: rgb(242 220 145 / 55%);
		font-style: italic;
		font-weight: 600;
	}
	/* Cards ride on the video so faces keep the whole tile. */
	.hand {
		position: absolute;
		right: 0.45rem;
		bottom: 0.45rem;
		z-index: 3;
		display: flex;
		justify-content: center;
	}
	.hand > :global(.tp-card + .tp-card) {
		margin-left: calc(var(--card-h) * -0.42);
	}
	.hand.big {
		--card-h: clamp(3rem, calc(var(--seat-w, 12rem) * 0.36), 7rem);
		right: 50%;
		bottom: 1.9rem;
		translate: 50% 0;
	}
	.hand.big > :global(.tp-card + .tp-card) {
		margin-left: calc(var(--card-h) * -0.22);
	}
	.hand-label {
		position: absolute;
		bottom: 0.4rem;
		left: 50%;
		z-index: 3;
		translate: -50% 0;
		white-space: nowrap;
		border-radius: 999px;
		background: rgb(33 28 46 / 70%);
		padding: 0.1rem 0.6rem;
		color: #e9e2cf;
		font-size: 0.75rem;
		font-weight: 650;
	}
	.hand-label.win {
		background: linear-gradient(135deg, #f2dc91, #e1ca89);
		color: #211c2e;
	}
	/* This hand's bet: real chips on the felt in front of the seat, amount beside them. */
	.bet {
		position: absolute;
		top: calc(100% + 0.35rem);
		left: 50%;
		translate: -50% 0;
		white-space: nowrap;
		display: inline-flex;
		align-items: flex-end;
		gap: 0.35rem;
		color: #f4e3b5;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.bet-amount {
		border-radius: 999px;
		background: rgb(24 20 34 / 62%);
		padding: 0.05rem 0.45rem;
	}
	.packed,
	.away {
		filter: grayscale(0.7) brightness(0.55);
	}
	.loser {
		opacity: 0.75;
	}
	@keyframes tp-pulse {
		50% {
			opacity: 0.55;
		}
	}
	@media (max-width: 639px) {
		.tp-seat {
			--bet-chip: 1.9rem;
		}
		.tp-seat {
			gap: 0.15rem;
		}
		.hand {
			right: 0.25rem;
			bottom: 0.25rem;
		}
		.hand.big {
			bottom: 1.4rem;
		}
		.name {
			font-size: 0.7rem;
		}
		.balance {
			font-size: 0.68rem;
		}
		.tp-seat .frame :global(.seat-video-status) {
			display: none;
		}
		.seat-status {
			top: 0.2rem;
			left: 0.2rem;
			padding: 0.05rem 0.35rem;
			font-size: 0.5rem;
		}
		.plate {
			top: 0.2rem;
			right: 0.2rem;
			max-width: calc(100% - 3.5rem);
			gap: 0.25rem;
			padding: 0.05rem 0.4rem;
		}
		.clock {
			top: 1.45rem;
			right: 0.2rem;
			padding: 0.05rem 0.35rem;
			font-size: 0.6rem;
		}
		.hand-label {
			font-size: 0.6rem;
		}
		.bet {
			font-size: 0.62rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.clock.hurry {
			animation: none;
		}
	}
</style>
