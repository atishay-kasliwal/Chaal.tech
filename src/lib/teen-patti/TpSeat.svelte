<script lang="ts">
	import { Crown, WifiOff } from '@lucide/svelte';
	import SeatVideo from '#lib/components/SeatVideo.svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';
	import TpCard from './TpCard.svelte';
	import { money } from './format.js';

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
		onspotlight
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
	} = $props();

	const away = $derived(user.hasLeft || !user.connected);
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
				? user.balance < boot
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
			<SeatVideo
				participant={showMedia && !away ? mediaParticipant : undefined}
				name={user.username}
			/>
			{#if status}
				<span class="seat-status" data-status={status.toLowerCase().replaceAll(' ', '-')}
					>{status}</span
				>
			{/if}
			{#if active && total > 0}
				<span class="clock {urgency}">{seconds}s</span>
			{/if}
			{#if away && !user.hasLeft}
				<span class="away-icon"><WifiOff class="h-4 w-4" /></span>
			{/if}
			{#if inHand && user.cardsInHand.length}
				<div class="hand" class:big={revealed && showdown} aria-label="{user.username} cards">
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
	</div>

	<div class="plate">
		<span class="name" title={user.username}>
			{#if host}<Crown class="crown h-3.5 w-3.5" aria-label="Host" />{/if}
			{user.username}
		</span>
		<span class="balance">{money(user.balance)}</span>
	</div>

	{#if inHand && (user.handBet ?? 0) > 0 && !showdown}
		<span class="bet" aria-label="{money(user.handBet)} in the pot">
			<span class="chip" aria-hidden="true"></span>{money(user.handBet)}
		</span>
	{/if}
</div>

<style>
	.tp-seat {
		--card-h: clamp(1.9rem, calc(var(--seat-w, 12rem) * 0.19), 3.6rem);
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
		width: 100%;
		border-radius: 1.05rem;
		padding: 3px;
		background: conic-gradient(var(--ring-color) calc(var(--p) * 1turn), rgb(255 255 255 / 7%) 0)
			border-box;
		transition: box-shadow 300ms ease;
	}
	.ring.calm {
		--ring-color: #7fd49b;
	}
	.ring.warn {
		--ring-color: #e9bf62;
	}
	.ring.hurry {
		--ring-color: #f0715f;
	}
	.active .ring {
		box-shadow:
			0 0 0 1px rgb(255 255 255 / 6%),
			0 0 1.6rem rgb(233 191 98 / 35%);
	}
	.winner .ring {
		background: linear-gradient(135deg, #f7df9d, #c08a34);
		box-shadow: 0 0 2rem rgb(240 200 110 / 55%);
	}
	.frame {
		position: relative;
		overflow: hidden;
		border-radius: 0.85rem;
		background: #0e1714;
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
	.seat-status {
		position: absolute;
		z-index: 3;
		top: 0.4rem;
		left: 0.4rem;
		border-radius: 999px;
		background: rgb(8 14 12 / 78%);
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
		top: 0.4rem;
		right: 0.4rem;
		border-radius: 999px;
		background: rgb(8 14 12 / 82%);
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
	.plate {
		display: flex;
		width: 100%;
		min-width: 0;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.4rem;
		padding-inline: 0.2rem;
		line-height: 1.15;
	}
	.name {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 0.25rem;
		overflow: hidden;
		color: #f1ebdc;
		font-size: 0.85rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.name :global(.crown) {
		flex-shrink: 0;
		color: #e9bf62;
	}
	.balance {
		flex-shrink: 0;
		color: #f0d18c;
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
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
		background: rgb(8 14 12 / 70%);
		padding: 0.1rem 0.6rem;
		color: #e9e2cf;
		font-size: 0.75rem;
		font-weight: 650;
	}
	.hand-label.win {
		background: linear-gradient(135deg, #f7df9d, #c08a34);
		color: #24180a;
	}
	.bet {
		position: absolute;
		top: calc(100% + 0.25rem);
		left: 50%;
		translate: -50% 0;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border-radius: 999px;
		background: rgb(6 12 10 / 62%);
		padding: 0.1rem 0.55rem 0.1rem 0.2rem;
		color: #f4e3b5;
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.chip {
		width: 0.95rem;
		height: 0.95rem;
		border-radius: 999px;
		background:
			radial-gradient(circle, #c7382f 0 38%, transparent 39%),
			repeating-conic-gradient(#f3e6c4 0 30deg, #c7382f 30deg 60deg);
		box-shadow: 0 1px 2px rgb(0 0 0 / 50%);
	}
	.packed,
	.away {
		opacity: 0.55;
		filter: saturate(0.4);
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
		.plate {
			flex-direction: column;
			align-items: center;
			gap: 0;
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
		.clock {
			top: 0.2rem;
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
