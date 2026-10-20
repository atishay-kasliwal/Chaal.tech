<script lang="ts">
	import type { Snippet } from 'svelte';
	import { arrangeSeats } from '#lib/seat-layout.js';
	let {
		players,
		selfId,
		gameType = 'teen-patti',
		seat,
		center
	}: {
		players: User[];
		selfId: string;
		gameType?: string;
		seat: Snippet<[User]>;
		center: Snippet;
	} = $props();
	const seats = $derived(arrangeSeats(players, selfId));
</script>

<section
	class="table-scene"
	data-testid="table-scene"
	data-count={players.length}
	data-game={gameType}
	aria-label="{gameType} table"
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
		--seat-gap: clamp(0.25rem, 0.8vw, 0.7rem);
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(12rem, 0.8fr) minmax(0, 1fr);
		grid-template-rows: minmax(9rem, 1fr) minmax(5.5rem, 0.38fr) minmax(9rem, 1fr);
		grid-template-areas:
			'upper-left top upper-right'
			'left center right'
			'lower-left bottom lower-right';
		gap: var(--seat-gap);
		align-items: center;
		height: calc(100dvh - 13.5rem);
		min-height: 24rem;
		max-height: 58rem;
		margin-top: 0.1rem;
		padding: 0.2rem 0.45rem;
	}
	.table-center {
		grid-area: center;
		z-index: 1;
		display: flex;
		min-width: 0;
		min-height: 0;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 0.15rem;
		text-align: center;
	}
	.table-center :global(h2) {
		margin-bottom: 0.1rem;
		color: rgb(242 220 145 / 78%);
		font-size: 0.95rem;
		line-height: 1.2;
	}
	.table-center :global([data-testid='center-game-actions']) {
		width: 100%;
		max-width: 22rem;
		margin-top: 0.3rem;
	}
	.table-center :global([data-testid='center-game-actions'] [data-testid='game-actions']) {
		min-height: 0;
		margin: 0;
		border: 0;
		padding: 0;
	}
	.table-center :global([data-testid='center-game-actions'] .btn-lg) {
		min-height: 2.35rem;
		height: 2.35rem;
		padding-inline: 0.75rem;
		font-size: 0.85rem;
	}
	.table-center :global(.bg-base-200) {
		background: transparent;
		box-shadow: none;
		color: rgb(242 220 145 / 92%);
	}
	.table-center :global([data-testid='community-cards']) {
		margin-block: 0.4rem;
	}
	.table-seat {
		grid-area: var(--seat-position);
		z-index: 2;
		min-width: 0;
		width: min(100%, 22rem);
		justify-self: center;
	}
	.table-seat.self {
		width: min(100%, 23rem);
	}
	.table-seat :global(.card) {
		overflow: visible;
		border: 0;
		border-radius: 0;
		background: transparent;
		box-shadow: none;
	}
	.table-seat :global(.card-body) {
		gap: 0.2rem;
		padding: 0.2rem;
	}
	.table-seat :global([data-active='true'] [data-testid='seat-video']) {
		box-shadow: 0 0 1.4rem rgb(220 173 87 / 34%);
	}
	.table-seat.self :global([data-testid='game-actions']) {
		display: none;
	}
	.table-scene[data-game='rummy'] {
		height: calc(100dvh - 18rem);
		min-height: 22rem;
	}
	@media (min-width: 1100px) and (max-height: 800px) {
		.table-scene {
			grid-template-rows: minmax(8.5rem, 1fr) minmax(4.5rem, 0.34fr) minmax(8.5rem, 1fr);
		}
		.table-seat,
		.table-seat.self {
			width: min(100%, 18.5rem);
		}
	}
	@media (max-width: 1099px) {
		.table-scene {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			grid-template-rows: minmax(6.5rem, 1fr) minmax(5rem, 0.38fr) minmax(6.5rem, 1fr);
			grid-template-areas:
				'upper-left top upper-right'
				'center center center'
				'lower-left bottom lower-right';
			height: calc(100dvh - 15.5rem);
			min-height: 23rem;
			padding-inline: 0.1rem;
		}
		.table-scene[data-count='4'] .table-seat[data-position='left'] {
			grid-area: upper-left;
		}
		.table-scene[data-count='4'] .table-seat[data-position='right'] {
			grid-area: upper-right;
		}
		.table-seat,
		.table-seat.self {
			width: min(100%, 14rem);
		}
		.table-seat :global(.card-body) {
			gap: 0.15rem;
			padding: 0.1rem;
		}
		.table-center :global([data-testid='dealer-cards'] playing-card) {
			height: 4rem !important;
			width: 2.8rem !important;
		}
	}
	@media (max-width: 639px) {
		.table-scene {
			--seat-gap: 0.15rem;
			grid-template-rows: minmax(3.75rem, 1fr) minmax(4.75rem, 0.38fr) minmax(3.75rem, 1fr);
			height: calc(100dvh - 18rem);
			min-height: 22rem;
			margin-top: 0.15rem;
		}
		.table-scene[data-count='2'] {
			grid-template-areas: 'top top top' 'center center center' 'bottom bottom bottom';
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
		.table-seat,
		.table-seat.self {
			width: 100%;
		}
		.table-center :global(h2) {
			font-size: 0.78rem;
		}
		.table-center :global([data-testid='community-cards'] playing-card) {
			height: 3.2rem !important;
			width: 2.25rem !important;
		}
		.table-center :global(.alert) {
			min-height: 0;
			padding: 0.4rem;
			font-size: 0.75rem;
		}
		.table-center :global([data-testid='center-game-actions'] .btn-lg) {
			min-height: 2rem;
			height: 2rem;
			padding-inline: 0.45rem;
			font-size: 0.72rem;
		}
		.table-center :global([data-game-action='teen-patti']) {
			display: none;
		}
		.table-scene[data-game='rummy'] {
			height: calc(100dvh - 22rem);
			min-height: 16rem;
		}
	}
	@media (max-height: 700px) {
		.table-scene {
			height: calc(100dvh - 12.5rem);
			min-height: 20rem;
			grid-template-rows: minmax(5.75rem, 1fr) minmax(4rem, 0.32fr) minmax(5.75rem, 1fr);
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.table-scene {
			height: calc(100dvh - 11rem);
			min-height: 0;
			grid-template-rows: minmax(0, 1fr) minmax(3rem, 0.22fr) minmax(0, 1fr);
			align-items: start;
		}
		.table-center :global(h2),
		.table-center :global(p) {
			display: none;
		}
		.table-center :global(.bg-base-200) {
			padding: 0.1rem 0.3rem;
			font-size: 0.62rem;
		}
		.table-center :global([data-testid='community-cards'] playing-card) {
			height: 2.5rem !important;
			width: 1.75rem !important;
		}
		.table-center :global([data-game-action='teen-patti']) {
			display: none;
		}
	}
	@media (max-width: 639px) and (max-height: 700px) {
		.table-scene {
			height: calc(100dvh - 15rem);
			min-height: 17rem;
		}
	}
</style>
