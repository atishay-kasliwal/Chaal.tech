<script lang="ts">
	import type { Snippet } from 'svelte';
	import { arrangeSeats } from '#lib/seat-layout.js';
	let {
		players,
		selfId,
		seat,
		center
	}: { players: User[]; selfId: string; seat: Snippet<[User]>; center: Snippet } = $props();
	const seats = $derived(arrangeSeats(players, selfId));
</script>

<section
	class="table-scene"
	data-testid="table-scene"
	data-count={players.length}
	aria-label="Teen Patti table"
>
	<div class="table-center" data-testid="table-center">
		{@render center()}
	</div>
	{#each seats as entry (entry.user.id)}
		<div
			class="table-seat"
			class:self={entry.user.id === selfId}
			style:--seat-position={entry.position}
			data-position={entry.position}
			data-seat-number={entry.user.seatNumber}
			data-player-id={entry.user.id}
		>
			{@render seat(entry.user)}
		</div>
	{/each}
</section>

<style>
	.table-scene {
		--table-gap: clamp(0.35rem, 1.4vw, 1rem);
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(18rem, 1.3fr) minmax(0, 1fr);
		grid-template-rows: minmax(7rem, 1fr) minmax(12rem, 1.4fr) minmax(7rem, 1fr);
		grid-template-areas:
			'upper-left top upper-right'
			'left center right'
			'lower-left bottom lower-right';
		gap: var(--table-gap);
		align-items: center;
		height: calc(100dvh - 15.25rem);
		min-height: 32rem;
		max-height: 62rem;
		margin-top: 0.25rem;
		padding: 0.5rem 0.25rem 0.75rem;
	}
	.table-center {
		grid-area: center;
		position: relative;
		z-index: 1;
		display: flex;
		min-width: 0;
		min-height: 12rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--color-primary) 48%, transparent);
		border-radius: 50%;
		padding: 1.25rem;
		background:
			radial-gradient(
				ellipse at center,
				color-mix(in srgb, var(--color-base-200) 98%, transparent) 0%,
				var(--color-base-100) 72%
			),
			var(--color-base-200);
		box-shadow:
			inset 0 0 0.8rem color-mix(in srgb, var(--color-primary) 10%, transparent),
			0 0.75rem 2rem #0005;
		text-align: center;
	}
	.table-seat {
		grid-area: var(--seat-position);
		z-index: 2;
		min-width: 0;
		width: min(100%, 18rem);
		justify-self: center;
	}
	.table-seat.self {
		width: min(100%, 19rem);
	}
	.table-seat :global(.card) {
		border-radius: 0.85rem;
		box-shadow: 0 0.5rem 1.25rem #0005;
	}
	.table-seat :global(.card-body) {
		gap: 0.45rem;
		padding: 0.65rem;
	}
	.table-seat[data-showdown='true'] :global([data-testid='game-actions']) {
		display: none;
	}
	@media (min-width: 1100px) and (max-height: 950px) {
		.table-seat :global([data-testid='seat-video'] > div:first-child),
		.table-seat :global(video) {
			height: 4rem;
		}
		.table-seat :global([data-testid='card-fan'] ol) {
			height: 3rem;
		}
		.table-seat :global([data-testid='card-fan'] playing-card) {
			height: 2.75rem !important;
			width: 1.9rem !important;
		}
	}

	@media (max-width: 1099px) {
		.table-scene {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
			grid-template-rows: minmax(6rem, 1fr) minmax(11rem, 1.25fr) minmax(6rem, 1fr);
			grid-template-areas:
				'upper-left top upper-right'
				'center center center'
				'lower-left bottom lower-right';
			height: calc(100dvh - 17rem);
			min-height: 30rem;
			padding-inline: 0;
		}
		.table-center {
			min-height: 11rem;
			border-radius: 1.5rem;
			padding: 1rem 0.65rem;
		}
		.table-seat,
		.table-seat.self {
			width: 100%;
		}
		.table-scene[data-count='4'] .table-seat[data-position='left'] {
			grid-area: upper-left;
		}
		.table-scene[data-count='4'] .table-seat[data-position='right'] {
			grid-area: upper-right;
		}
		.table-seat :global(.card-body) {
			gap: 0.3rem;
			padding: 0.45rem;
		}
	}

	@media (max-width: 639px) {
		.table-scene {
			--table-gap: 0.3rem;
			height: calc(100dvh - 23rem);
			min-height: 24rem;
			grid-template-rows: minmax(5rem, 1fr) minmax(8rem, 1.2fr) minmax(5rem, 1fr);
			margin-top: 0.35rem;
		}
		.table-center {
			min-height: 8rem;
			border-radius: 1rem;
			padding: 0.65rem 0.35rem;
			box-shadow:
				inset 0 0 0.6rem color-mix(in srgb, var(--color-primary) 10%, transparent),
				0 0.35rem 1rem #0005;
		}
		.table-scene[data-count='2'] {
			grid-template-areas: 'top top top' 'center center center' 'bottom bottom bottom';
		}
		.table-scene[data-count='2'] .table-seat {
			width: min(100%, 19rem);
		}
		.table-scene[data-count='3'] {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			grid-template-areas:
				'upper-left upper-left upper-right upper-right'
				'center center center center'
				'. bottom bottom .';
		}
		.table-scene[data-count='4'] {
			grid-template-columns: repeat(4, minmax(0, 1fr));
			grid-template-areas:
				'top top left left'
				'center center center center'
				'right right bottom bottom';
		}
		.table-scene[data-count='4'] .table-seat[data-position='left'] {
			grid-area: left;
		}
		.table-scene[data-count='4'] .table-seat[data-position='right'] {
			grid-area: right;
		}
		.table-seat :global(.card-body) {
			padding: 0.35rem;
		}
		.table-center :global([data-testid='community-cards'] playing-card) {
			height: 3.8rem !important;
			width: 2.65rem !important;
		}
		.table-center :global(h2) {
			font-size: 1.1rem;
			line-height: 1.2;
		}
		.table-center :global(.alert) {
			min-height: 0;
			padding: 0.4rem;
			font-size: 0.75rem;
		}
	}

	@media (max-height: 700px) {
		.table-scene {
			height: calc(100dvh - 13rem);
			min-height: 25rem;
			grid-template-rows: minmax(5.25rem, 1fr) minmax(9rem, 1.3fr) minmax(5.25rem, 1fr);
		}
		.table-center {
			min-height: 9rem;
			padding: 0.55rem;
		}
		.table-seat :global(.card-body) {
			gap: 0.25rem;
			padding: 0.35rem;
		}
	}
	@media (max-width: 639px), (max-width: 959px) and (max-height: 500px) {
		.table-seat.self :global([data-testid='game-actions']) {
			display: none;
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.table-scene {
			height: calc(100dvh - 10rem);
			min-height: 0;
			grid-template-rows: minmax(0, 1fr) minmax(4rem, 1.2fr) minmax(0, 1fr);
		}
		.table-center {
			min-height: 3.5rem;
			padding: 0.25rem;
		}
		.table-center :global(h2) {
			font-size: 0.85rem;
			line-height: 1;
		}
		.table-center :global(p) {
			margin-block: 0.2rem !important;
			font-size: 0.62rem;
		}
		.table-center :global(.bg-base-200) {
			gap: 0.3rem;
			padding: 0.2rem 0.35rem;
			font-size: 0.62rem;
		}
		.table-seat :global(.card-body) {
			gap: 0.1rem;
			padding: 0.15rem;
		}
		.table-center :global([data-testid='community-cards'] playing-card) {
			height: 3rem !important;
			width: 2rem !important;
		}
	}
</style>
