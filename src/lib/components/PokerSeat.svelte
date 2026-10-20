<script lang="ts">
	import { IndianRupee } from '@lucide/svelte';
	import SeatVideo from './SeatVideo.svelte';
	import PlayingCard from './PlayingCard.svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';
	let {
		user,
		selfId,
		active,
		game = 'poker',
		showMedia,
		mediaParticipant
	}: {
		user: User;
		selfId: string;
		active: boolean;
		game?: 'poker' | 'blackjack';
		showMedia: boolean;
		mediaParticipant?: MediaParticipant;
	} = $props();
	function cardLabel(rank: number, suit: string) {
		const rankName =
			({ 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' } as Record<number, string>)[rank] ??
			String(rank);
		return `${rankName} of ${suit}`;
	}
</script>

<div
	class="player-seat poker-seat indicator w-full"
	data-testid="player-seat"
	data-player-id={user.id}
	data-active={active}
	data-self={user.id === selfId}
>
	{#if active}<span class="turn-marker badge indicator-item badge-primary z-20 font-bold shadow-sm"
			>Turn</span
		>{/if}
	<div
		class="card w-full shadow-2xl transition-all {active
			? 'bg-base-200 border-primary ring-primary ring-2'
			: 'bg-base-100 border-base-300'} relative overflow-hidden border"
	>
		<div class="card-body gap-2 p-3">
			<div class="border-base-300 flex items-center justify-between gap-2 border-b pb-2">
				<div class="card-title min-w-0 gap-1 text-sm">
					<span class="truncate">{user.username}</span>
					{#if user.id === selfId}<span class="badge badge-sm badge-outline">You</span>{/if}
					{#if game === 'blackjack' && user.status === 'bust'}<span
							class="badge badge-sm badge-error">Bust</span
						>{/if}
					{#if game === 'blackjack' && user.blackjackOutcome}<span
							class="badge badge-sm badge-success">{user.blackjackOutcome}</span
						>{/if}
					{#if game === 'poker' && user.folded}<span class="badge badge-sm badge-error">Folded</span
						>{/if}
					{#if user.isAllIn}<span class="badge badge-sm badge-warning">All in</span>{/if}
					{#if user.hasLeft || !user.connected}<span class="badge badge-sm badge-outline"
							>{user.hasLeft ? 'Left' : 'Disconnected'}</span
						>{/if}
				</div>
				<div class="shrink-0 text-right">
					<span class="bg-base-300 flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs"
						><IndianRupee class="h-3 w-3 opacity-60" />{user.balance}</span
					>
					<span class="text-base-content/60 text-[10px]">Bet: {user.streetBet ?? 0}</span>
				</div>
			</div>
			<div class="poker-hand-media grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2">
				<SeatVideo
					participant={showMedia && user.connected && !user.hasLeft ? mediaParticipant : undefined}
					name={user.username}
					playerId={user.id}
					local={user.id === selfId}
				/>
				<div
					class="flex justify-center gap-1"
					aria-label={`${user.username} ${game === 'blackjack' ? 'hand' : 'hole cards'}`}
					data-testid="hole-cards"
				>
					{#each user.cardsInHand.slice(0, game === 'blackjack' ? user.cardsInHand.length : 2) as card, index (`${card.rank}-${card.suit}-${index}`)}
						<div
							data-testid="hole-card"
							data-face-down={card.rank === 0}
							aria-label={card.rank === 0 ? 'Hidden hole card' : cardLabel(card.rank, card.suit)}
						>
							<PlayingCard
								rank={card.rank}
								suit={card.suit}
								faceDown={card.rank === 0}
								class="!h-24 !w-16"
							/>
						</div>
					{/each}
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.turn-marker {
		right: 0.75rem;
		translate: 0 -50%;
		border: 1px solid rgb(255 255 255 / 36%);
		background: linear-gradient(135deg, #f2dc91, #bd842e);
		color: #25190d;
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
	.player-seat :global([data-testid='hole-cards']) {
		max-width: 100%;
		flex-wrap: wrap;
		align-content: center;
		max-height: 7.5rem;
		overflow-y: auto;
	}
	.player-seat :global([data-testid='seat-video'] > div:first-child) {
		height: 6rem;
		font-size: 0.65rem;
		text-align: center;
		overflow-wrap: anywhere;
	}
	.player-seat :global(video) {
		height: 6rem;
		object-fit: cover;
	}
	@media (max-width: 1099px) {
		.poker-hand-media {
			position: relative;
			display: block;
		}
		.player-seat :global([data-testid='seat-video'] > div:first-child) {
			height: 3.6rem;
			font-size: 0.55rem;
		}
		.player-seat :global(video) {
			height: 3.6rem;
			object-fit: cover;
		}
		.player-seat :global([data-testid='seat-video'] > div:last-child) {
			min-height: 0.85rem;
			padding: 0.05rem 0.25rem;
			font-size: 0.48rem;
		}
		.poker-hand-media [data-testid='hole-cards'] {
			position: absolute;
			right: 0.2rem;
			bottom: 1rem;
			gap: 0.15rem;
			padding: 0.2rem;
			border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
			border-radius: 0.35rem;
			background: color-mix(in srgb, var(--color-base-100) 92%, transparent);
			box-shadow: 0 0.2rem 0.5rem #0008;
		}
		.poker-hand-media [data-testid='hole-card'] :global(playing-card) {
			height: 4rem !important;
			width: 2.7rem !important;
		}
	}
	@media (max-width: 639px) {
		.poker-hand-media [data-testid='hole-card'] :global(playing-card) {
			height: 3.25rem !important;
			width: 2.2rem !important;
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.player-seat :global(.card-body) {
			gap: 0.1rem;
			padding: 0.2rem;
		}
		.player-seat :global([data-testid='hole-cards']) {
			max-height: 5.5rem;
			overflow-y: auto;
		}
		.player-seat :global([data-testid='seat-video'] > div:first-child),
		.player-seat :global(video) {
			height: 1.5rem;
		}
		.player-seat :global([data-testid='seat-video'] > div:last-child) {
			display: none;
		}
		.poker-hand-media [data-testid='hole-cards'] {
			bottom: 0.2rem;
			padding: 0.1rem;
		}
		.poker-hand-media [data-testid='hole-card'] :global(playing-card) {
			height: 1.55rem !important;
			width: 1.05rem !important;
		}
	}

	.poker-seat > :global(.card) {
		overflow: visible;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}
	.poker-seat[data-active='true'] > :global(.card) {
		border: 0;
		background: transparent;
		box-shadow: none;
	}
	.poker-seat :global(.card-body) {
		gap: 0.2rem;
		padding: 0.2rem;
	}
	.poker-seat .border-b {
		border: 0;
		padding-bottom: 0;
	}
	.poker-seat .bg-base-300.rounded-md {
		border: 0;
		background: transparent;
		padding: 0.1rem 0.25rem;
		color: #f1d897;
	}
	.poker-hand-media {
		position: relative;
		display: block;
		min-width: 0;
		margin-top: 0.25rem;
	}
	.poker-seat :global([data-testid='seat-video']) {
		width: 100%;
		border: 0;
		border-radius: 0.8rem;
		background: #2c263b;
	}
	.poker-seat :global([data-testid='seat-video'] > div:first-child),
	.poker-seat :global(video) {
		height: 100%;
		object-fit: cover;
	}
	.poker-seat :global(.seat-video-status) {
		min-height: 0;
		padding: 0;
		background: transparent;
	}
	.poker-seat :global([data-testid='hole-cards']) {
		position: absolute;
		right: 0.5rem;
		bottom: 0.35rem;
		z-index: 5;
		max-height: none;
		flex-wrap: nowrap;
		overflow: visible;
		gap: 0.2rem;
		border: 0;
		background: transparent;
		box-shadow: none;
	}
	.poker-hand-media [data-testid='hole-card'] :global(playing-card) {
		height: 5.5rem !important;
		width: 3.7rem !important;
	}
	@media (max-width: 1099px) {
		.poker-seat :global(.card-body) {
			gap: 0.15rem;
			padding: 0.1rem;
		}
		.poker-seat :global([data-testid='hole-cards']) {
			right: 0.25rem;
			bottom: 0.2rem;
			gap: 0.1rem;
		}
		.poker-hand-media [data-testid='hole-card'] :global(playing-card) {
			height: 3.7rem !important;
			width: 2.5rem !important;
		}
	}
	@media (max-width: 639px) {
		.poker-seat :global(.card-title) {
			font-size: 0.58rem;
		}
		.poker-seat :global(.card-title .truncate) {
			max-width: 4.5rem;
		}
		.poker-seat :global(.bg-base-300.rounded-md) {
			font-size: 0.58rem;
		}
		.poker-hand-media [data-testid='hole-card'] :global(playing-card) {
			height: 2.8rem !important;
			width: 1.9rem !important;
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.poker-seat :global(.card-body) {
			gap: 0;
			padding: 0.05rem;
		}
		.poker-seat :global(.card-title),
		.poker-seat .bg-base-300.rounded-md {
			font-size: 0.5rem;
			line-height: 1;
		}
		.poker-seat .border-b {
			padding-bottom: 0;
		}
		.poker-seat :global([data-testid='seat-video']) {
			aspect-ratio: 3.2 / 1;
		}
		.poker-seat :global([data-testid='hole-cards']) {
			right: 0.15rem;
			bottom: 0.05rem;
		}
		.poker-hand-media [data-testid='hole-card'] :global(playing-card) {
			height: 2.25rem !important;
			width: 1.5rem !important;
		}
	}
</style>
