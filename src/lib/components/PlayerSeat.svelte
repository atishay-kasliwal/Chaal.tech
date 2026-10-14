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
	aria-label={`${user.username}${user.id === selfId ? ', you' : ''}${active ? ', active turn' : ''}`}
>
	{#if active}
		<span class="turn-marker badge indicator-item badge-primary z-20 font-bold shadow-sm">Turn</span
		>
	{/if}
	<div
		class="card w-full shadow-2xl transition-all {active
			? 'bg-base-200 border-primary ring-primary ring-offset-base-100 ring-2 ring-offset-2'
			: 'bg-base-100 border-base-300'} relative overflow-hidden border"
	>
		<div class="card-body gap-2 p-3">
			<div class="border-base-300 flex min-w-0 items-center justify-between gap-2 border-b pb-2">
				<div class="card-title flex min-w-0 items-center gap-1 text-sm">
					<span class="truncate" title={user.username}>{user.username}</span>
					{#if user.id === selfId}
						<span class="badge badge-sm badge-outline">You</span>
					{/if}
					{#if user.hasLeft || !user.connected}
						<span class="badge badge-sm badge-outline"
							>{user.hasLeft ? 'Left' : 'Disconnected'}</span
						>
					{/if}
				</div>
				<div class="shrink-0 text-right">
					<span
						class="bg-base-300 flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs"
						aria-label={`${user.balance} chips`}
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
	.turn-marker {
		right: 0.75rem;
		translate: 0 -50%;
		border: 1px solid rgb(255 255 255 / 36%);
		background: linear-gradient(135deg, #f7df9d, #bd842e);
		color: #25190d;
		box-shadow: 0 0.2rem 0.6rem rgb(0 0 0 / 44%);
	}
	.player-seat :global(.card) {
		border-color: rgb(229 198 134 / 18%);
		background: linear-gradient(150deg, rgb(20 31 27 / 97%), rgb(10 19 17 / 96%));
		backdrop-filter: blur(8px);
	}
	.player-seat[data-active='true'] :global(.card) {
		border-color: rgb(244 210 139 / 80%);
		box-shadow:
			0 0 0 1px rgb(244 210 139 / 24%),
			0 0 1.3rem rgb(220 173 87 / 25%),
			0 0.6rem 1.3rem #0008;
	}
	.player-seat[data-self='true'] :global(.card) {
		background: linear-gradient(150deg, rgb(29 39 33 / 98%), rgb(12 23 18 / 97%));
	}
	.player-seat .border-b {
		border-color: rgb(229 198 134 / 18%);
	}
	.player-seat :global(.card-title) {
		color: #f3eee1;
	}
	.player-seat .bg-base-300.rounded-md {
		border: 1px solid rgb(235 199 123 / 25%);
		background: rgb(217 177 92 / 12%);
		color: #f1d897;
	}
	.player-seat :global([data-testid='seat-video']) {
		border-color: rgb(255 255 255 / 12%);
		background: #101715;
	}
	.player-seat :global([data-testid='seat-video'] > div:last-child) {
		background: rgb(7 13 11 / 80%);
		color: rgb(238 233 218 / 72%);
	}
	.seat-hand-media {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 6.5rem;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}
	.seat-hand-media :global([data-testid='seat-video']) {
		min-width: 0;
	}
	.seat-hand-media :global([data-testid='seat-video'] > div:first-child) {
		height: 5rem;
		font-size: 0.65rem;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.seat-hand-media :global([data-testid='seat-video'] > div:last-child) {
		font-size: 0.6rem;
	}
	.seat-hand-media :global(video) {
		height: 5rem;
		object-fit: contain;
	}
	.player-seat :global([data-testid='game-actions']) {
		margin-top: 0.25rem;
		min-height: 1.75rem;
		padding-top: 0.5rem;
	}
	@media (min-width: 1100px) and (max-height: 950px) {
		.player-seat :global([data-testid='game-actions'] .btn-lg) {
			min-height: 2.1rem;
			height: 2.1rem;
			padding-inline: 0.55rem;
			font-size: 0.85rem;
		}
		.player-seat :global([data-testid='game-actions'] > button) {
			min-height: 2.1rem;
			margin-top: 0.2rem;
		}
		.player-seat :global([data-testid='game-actions']) {
			margin-top: 0.1rem;
			padding-top: 0.25rem;
		}
	}
	@media (max-width: 1099px) {
		.seat-hand-media {
			position: relative;
			display: block;
		}
		.seat-hand-media :global([data-testid='seat-video'] > div:first-child) {
			height: 2.7rem;
			font-size: 0.55rem;
		}
		.seat-hand-media :global(video) {
			height: 2.7rem;
			object-fit: cover;
		}
		.seat-hand-media :global([data-testid='seat-video'] > div:last-child) {
			min-height: 0.85rem;
			padding: 0.05rem 0.25rem;
			font-size: 0.48rem;
		}
		.seat-hand-media :global([data-testid='card-fan']) {
			position: absolute;
			right: 0.2rem;
			bottom: 0.9rem;
			border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
			border-radius: 0.35rem;
			background: color-mix(in srgb, var(--color-base-100) 90%, transparent);
			box-shadow: 0 0.2rem 0.5rem #0008;
		}
		.seat-hand-media :global([data-testid='card-fan'] ol) {
			margin: 0;
			height: 2.25rem;
			padding: 0.1rem 0.25rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] playing-card) {
			height: 2rem !important;
			width: 1.35rem !important;
		}
	}
	@media (max-width: 639px) {
		.player-seat :global(.card-body) {
			gap: 0.15rem;
			padding: 0.25rem;
		}
		.player-seat [data-testid='hand-bet'] {
			display: none;
		}
		.player-seat :global(.card-title) {
			font-size: 0.62rem;
		}
		.player-seat :global(.card-title .truncate) {
			max-width: 4.5rem;
		}
		.player-seat .border-b {
			padding-bottom: 0.1rem;
		}
		.player-seat .bg-base-300.rounded-md {
			padding: 0.15rem 0.3rem;
			font-size: 0.62rem;
		}
		.player-seat :global([data-testid='game-actions']) {
			display: none;
		}
		.seat-hand-media :global([data-testid='seat-video'] > div:first-child),
		.seat-hand-media :global(video) {
			height: 2rem;
		}
		.seat-hand-media :global([data-testid='seat-video'] > div:last-child) {
			min-height: 0.65rem;
			font-size: 0.42rem;
		}
		.seat-hand-media :global([data-testid='card-fan']) {
			bottom: 0.7rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] ol) {
			height: 1.8rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] playing-card) {
			height: 1.55rem !important;
			width: 1.05rem !important;
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.player-seat :global(.card-body) {
			gap: 0.1rem;
			padding: 0.15rem;
		}
		.player-seat [data-testid='hand-bet'] {
			display: none;
		}
		.player-seat :global(.card-title) {
			font-size: 0.62rem;
		}
		.seat-hand-media :global([data-testid='seat-video'] > div:first-child),
		.seat-hand-media :global(video) {
			height: 1.5rem;
		}
		.seat-hand-media :global([data-testid='seat-video'] > div:last-child) {
			display: none;
		}
		.seat-hand-media :global([data-testid='card-fan'] ol) {
			height: 1.5rem;
		}
		.seat-hand-media :global([data-testid='card-fan'] playing-card) {
			height: 1.3rem !important;
			width: 0.9rem !important;
		}
		.seat-hand-media :global([data-testid='card-fan']) {
			bottom: 0.8rem;
		}
		.player-seat :global([data-testid='game-actions']) {
			display: none;
		}
	}
</style>
