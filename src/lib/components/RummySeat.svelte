<script lang="ts">
	import { IndianRupee, Layers } from '@lucide/svelte';
	import SeatVideo from './SeatVideo.svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';
	let { user, selfId, active, showMedia, mediaParticipant }: {
		user: User;
		selfId: string;
		active: boolean;
		showMedia: boolean;
		mediaParticipant?: MediaParticipant;
	} = $props();
</script>

<div class="rummy-seat indicator w-full" data-testid="player-seat" data-player-id={user.id}>
	{#if active}<span class="turn-marker badge indicator-item badge-primary z-20 font-bold">Turn</span>{/if}
	<div class="card w-full border {active ? 'bg-base-200 border-primary ring-2 ring-primary' : 'bg-base-100 border-base-300'}">
		<div class="card-body gap-2 p-3">
			<div class="flex items-center justify-between gap-2">
				<div class="flex min-w-0 items-center gap-1 text-sm font-semibold">
					<span class="truncate">{user.username}</span>
					{#if user.id === selfId}<span class="badge badge-xs badge-outline">You</span>{/if}
				</div>
				<span class="flex shrink-0 items-center gap-1 rounded bg-base-300 px-2 py-1 font-mono text-xs"><IndianRupee class="h-3 w-3" />{user.balance}</span>
			</div>
			<div class="flex items-center justify-between gap-2">
				<SeatVideo participant={showMedia && user.connected && !user.hasLeft ? mediaParticipant : undefined} name={user.username} local={user.id === selfId} />
				<div class="flex shrink-0 flex-col items-center gap-1 rounded-lg bg-base-200 px-2 py-1 text-xs" aria-label={`${user.cardCount ?? 13} cards in hand`}><Layers class="h-4 w-4 text-primary" />{user.cardCount ?? 13}</div>
			</div>
		</div>
	</div>
</div>

<style>
	.turn-marker { right: .75rem; translate: 0 -50%; }
	.rummy-seat :global([data-testid='seat-video'] > div:first-child), .rummy-seat :global(video) { height: 4rem; object-fit: cover; }
	@media (max-width: 1099px) {
		.rummy-seat :global(.card-body) { gap: .2rem; padding: .3rem; }
		.rummy-seat :global([data-testid='seat-video'] > div:first-child), .rummy-seat :global(video) { height: 2.25rem; }
		.rummy-seat :global([data-testid='seat-video'] > div:last-child) { display:none; }
	}
</style>
