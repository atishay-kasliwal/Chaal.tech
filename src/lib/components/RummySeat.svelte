<script lang="ts">
	import { IndianRupee, Layers } from '@lucide/svelte';
	import SeatVideo from './SeatVideo.svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';
	let {
		user,
		selfId,
		active,
		showMedia,
		mediaParticipant
	}: {
		user: User;
		selfId: string;
		active: boolean;
		showMedia: boolean;
		mediaParticipant?: MediaParticipant;
	} = $props();
</script>

<div
	class="rummy-seat indicator w-full"
	data-testid="player-seat"
	data-player-id={user.id}
	data-active={active}
	data-self={user.id === selfId}
>
	{#if active}<span class="turn-marker badge indicator-item badge-primary z-20 font-bold">Turn</span
		>{/if}
	<div
		class="card w-full border {active
			? 'bg-base-200 border-primary ring-primary ring-2'
			: 'bg-base-100 border-base-300'}"
	>
		<div class="card-body gap-2 p-3">
			<div class="flex items-center justify-between gap-2">
				<div class="flex min-w-0 items-center gap-1 text-sm font-semibold">
					<span class="truncate">{user.username}</span>
					{#if user.id === selfId}<span class="badge badge-xs badge-outline">You</span>{/if}
				</div>
				<span
					class="bg-base-300 flex shrink-0 items-center gap-1 rounded px-2 py-1 font-mono text-xs"
					><IndianRupee class="h-3 w-3" />{user.balance}</span
				>
			</div>
			<div class="flex items-center justify-between gap-2">
				<SeatVideo
					participant={showMedia && user.connected && !user.hasLeft ? mediaParticipant : undefined}
					name={user.username}
					playerId={user.id}
					local={user.id === selfId}
				/>
				<div
					class="bg-base-200 flex shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1 text-xs"
					aria-label={`${user.cardCount ?? 13} cards in hand`}
				>
					<Layers class="text-primary h-4 w-4" />{user.cardCount ?? 13}
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
	.rummy-seat :global(.card) {
		border-color: rgb(229 198 134 / 18%);
		background: linear-gradient(150deg, rgb(20 31 27 / 97%), rgb(10 19 17 / 96%));
	}
	.rummy-seat[data-active='true'] :global(.card) {
		border-color: rgb(244 210 139 / 80%);
		box-shadow:
			0 0 0 1px rgb(244 210 139 / 24%),
			0 0 1.3rem rgb(220 173 87 / 25%),
			0 0.6rem 1.3rem #0008;
	}
	.rummy-seat[data-self='true'] :global(.card) {
		background: linear-gradient(150deg, rgb(29 39 33 / 98%), rgb(12 23 18 / 97%));
	}
	.rummy-seat :global([data-testid='seat-video']) {
		border-color: rgb(255 255 255 / 12%);
		background: #101715;
	}
	.rummy-seat :global([data-testid='seat-video'] > div:first-child),
	.rummy-seat :global(video) {
		height: 4rem;
		object-fit: cover;
	}
	@media (max-width: 1099px) {
		.rummy-seat :global(.card-body) {
			gap: 0.2rem;
			padding: 0.3rem;
		}
		.rummy-seat :global([data-testid='seat-video'] > div:first-child),
		.rummy-seat :global(video) {
			height: 2.25rem;
		}
		.rummy-seat :global([data-testid='seat-video'] > div:last-child) {
			display: none;
		}
	}
	.rummy-seat > :global(.card) {
		overflow: visible;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}
	.rummy-seat[data-active='true'] > :global(.card) {
		border: 0;
		background: transparent;
		box-shadow: none;
	}
	.rummy-seat :global(.card-body) {
		gap: 0.2rem;
		padding: 0.2rem;
	}
	.rummy-seat .card-body > div:last-child {
		position: relative;
		display: block;
		margin-top: 0.25rem;
	}
	.rummy-seat .card-body > div:last-child > :global([data-testid='seat-video']) {
		width: 100%;
		border: 0;
		border-radius: 0.8rem;
		background: #2c263b;
	}
	.rummy-seat .card-body > div:last-child > div:last-child {
		position: absolute;
		top: 0.35rem;
		right: 0.4rem;
		flex-direction: row;
		gap: 0.25rem;
		border: 0;
		background: rgb(5 10 8 / 70%);
		padding: 0.25rem 0.45rem;
		color: #f1d897;
	}
	.rummy-seat :global([data-testid='seat-video'] > div:first-child),
	.rummy-seat :global(video) {
		height: 100%;
	}
	@media (max-width: 1099px) {
		.rummy-seat :global(.card-body) {
			gap: 0.15rem;
			padding: 0.1rem;
		}
		.rummy-seat .card-body > div:last-child > div:last-child {
			top: 0.2rem;
			right: 0.2rem;
			padding: 0.1rem 0.25rem;
		}
	}
	@media (max-width: 639px) {
		.rummy-seat .card-body > div:first-child {
			font-size: 0.58rem;
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.rummy-seat :global(.card-body) {
			gap: 0;
			padding: 0.05rem;
		}
		.rummy-seat .card-body > div:first-child {
			font-size: 0.5rem;
			line-height: 1;
		}
		.rummy-seat .card-body > div:last-child {
			margin-top: 0;
		}
		.rummy-seat :global([data-testid='seat-video']) {
			aspect-ratio: 3.2 / 1;
		}
	}
</style>
