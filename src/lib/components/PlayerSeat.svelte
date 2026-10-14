<script lang="ts">
	import { IndianRupee } from '@lucide/svelte';
	import CardFan from './CardFan.svelte';
	import GameActions from './GameActions.svelte';
	import SeatVideo from './SeatVideo.svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';

	let {
		user,
		selfId,
		active,
		gameShow,
		legalActions,
		connected,
		twoRemaining,
		chal = $bindable(1),
		actions,
		showMedia,
		mediaParticipant
	}: {
		user: User;
		selfId: string;
		active: boolean;
		gameShow: boolean;
		legalActions: RoomData['legalActions'];
		connected: boolean;
		twoRemaining: boolean;
		chal?: number;
		showMedia: boolean;
		mediaParticipant?: MediaParticipant;
		actions: {
			seeCardsHandler: () => void;
			packHandler: () => void;
			chalHandler: () => void;
			showHandler: () => void;
		};
	} = $props();
</script>

<div
	class="player-seat indicator w-full"
	data-testid="player-seat"
	data-player-id={user.id}
	data-active={active}
	data-self={user.id === selfId}
	data-connected={user.connected && !user.hasLeft}
	data-showdown={gameShow}
	aria-label={user.username + (user.id === selfId ? ', you' : '') + (active ? ', active turn' : '')}
>
	{#if active}
		<span class="turn-marker badge indicator-item badge-primary z-20 font-bold shadow-sm">Turn</span>
	{/if}
	<div class="card relative w-full overflow-hidden border transition-all">
		<div class="card-body">
			<div class="seat-heading flex min-w-0 items-center justify-between gap-2">
				<div class="card-title flex min-w-0 items-center gap-1 text-sm">
					<span class="truncate" title={user.username}>{user.username}</span>
					{#if user.id === selfId}<span class="badge badge-sm badge-outline">You</span>{/if}
					{#if user.hasLeft || !user.connected}
						<span class="badge badge-sm badge-outline"
							>{user.hasLeft ? 'Left' : 'Disconnected'}</span
						>
					{/if}
				</div>
				<div class="seat-stack shrink-0 text-right">
					<span
						class="bg-base-300 flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs"
						aria-label={user.balance + ' chips'}
						><IndianRupee class="h-3 w-3 opacity-60" />{user.balance}</span
					>
					<span
						class="text-base-content/60 text-[10px]"
						data-testid="hand-bet"
						title={user.handBet === null
							? 'Contribution available from the next hand'
							: 'Total contributed this hand, including boot and Show fee'}
						>Hand bet: {user.handBet ?? '—'}</span
					>
				</div>
			</div>

			<div class="seat-hand-media">
				<SeatVideo
					participant={showMedia && user.connected && !user.hasLeft ? mediaParticipant : undefined}
					name={user.username}
					local={user.id === selfId}
				/>
				<CardFan {user} {selfId} {gameShow} />
			</div>

			<GameActions
				{user}
				{selfId}
				{active}
				{gameShow}
				{legalActions}
				{connected}
				{twoRemaining}
				bind:chal
				{actions}
			/>
		</div>
	</div>
</div>

<style>
	.player-seat {
		min-width: 0;
	}
	.turn-marker {
		right: 0.55rem;
		translate: 0 -50%;
		border: 0;
		background: linear-gradient(135deg, #f7df9d, #bd842e);
		color: #25190d;
		box-shadow: 0 0.2rem 0.6rem rgb(0 0 0 / 36%);
	}
	.player-seat > :global(.card) {
		overflow: visible;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
		backdrop-filter: none;
	}
	.player-seat :global(.card-body) {
		gap: 0.2rem;
		padding: 0.15rem;
	}
	.seat-heading {
		min-height: 1.65rem;
	}
	.player-seat :global(.card-title) {
		color: #f3eee1;
	}
	.seat-stack {
		line-height: 1.05;
	}
	.player-seat .bg-base-300.rounded-md {
		border: 0;
		background: transparent;
		padding: 0.1rem 0.25rem;
		color: #f1d897;
	}
	.seat-hand-media {
		position: relative;
		min-width: 0;
		margin-top: 0.15rem;
		overflow: visible;
	}
	.seat-hand-media :global([data-testid='seat-video']) {
		width: 100%;
		border: 0;
		border-radius: 0.8rem;
		background: #111a17;
	}
	.seat-hand-media :global(video),
	.seat-hand-media :global([data-testid='seat-video'] > div:first-child) {
		height: 100%;
		object-fit: cover;
	}
	.seat-hand-media :global([data-testid='card-fan']) {
		position: absolute;
		right: 0.45rem;
		bottom: 0.3rem;
		z-index: 5;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}
	.seat-hand-media :global([data-testid='card-fan'] ol) {
		height: 4.5rem;
		margin-block: 0;
	}
	.seat-hand-media :global([data-testid='card-fan'] playing-card) {
		height: 4.25rem !important;
		width: 2.95rem !important;
	}
	.player-seat :global([data-testid='game-actions']) {
		min-height: 1.5rem;
		margin-top: 0.1rem;
		border: 0;
		padding-top: 0.2rem;
	}
	.player-seat :global([data-testid='game-actions'] .btn-lg) {
		min-height: 2.1rem;
		height: 2.1rem;
		padding-inline: 0.55rem;
		font-size: 0.85rem;
	}
	@media (max-width: 1099px) {
		.seat-heading {
			min-height: 1.35rem;
		}
		.player-seat :global(.card-body) {
			gap: 0.1rem;
			padding: 0.1rem;
		}
		.seat-hand-media :global([data-testid='card-fan']) {
			right: 0.25rem;
			bottom: 0.2rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] ol) {
			height: 3.6rem;
			padding: 0;
		}
		.seat-hand-media :global([data-testid='card-fan'] playing-card) {
			height: 3.4rem !important;
			width: 2.35rem !important;
		}
		.player-seat :global([data-testid='game-actions']) {
			display: none;
		}
	}
	@media (max-width: 639px) {
		.seat-heading {
			min-height: 1.1rem;
		}
		.player-seat :global(.card-title) {
			font-size: 0.58rem;
		}
		.player-seat :global(.card-title .truncate) {
			max-width: 4.5rem;
		}
		.player-seat [data-testid='hand-bet'] {
			display: none;
		}
		.player-seat .bg-base-300.rounded-md {
			font-size: 0.58rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] ol) {
			height: 2.6rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] playing-card) {
			height: 2.35rem !important;
			width: 1.6rem !important;
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.seat-heading {
			min-height: 0.95rem;
		}
		.player-seat :global(.card-body) {
			gap: 0;
			padding: 0.05rem;
		}
		.player-seat :global(.card-title),
		.player-seat .bg-base-300.rounded-md {
			font-size: 0.5rem;
			line-height: 1;
		}
		.player-seat [data-testid='hand-bet'] {
			display: none;
		}
		.seat-hand-media {
			margin-top: 0;
		}
		.seat-hand-media :global([data-testid='seat-video']) {
			aspect-ratio: 3.6 / 1;
		}
		.seat-hand-media :global([data-testid='card-fan']) {
			right: 0.15rem;
			bottom: 1.65rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] ol) {
			height: 2.1rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] playing-card) {
			height: 1.9rem !important;
			width: 1.3rem !important;
		}
	}
</style>
