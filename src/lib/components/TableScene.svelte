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
	<div class="table-surface" aria-hidden="true"></div>
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
		--table-gap: clamp(0.35rem, 1.2vw, 1rem);
		position: relative;
		isolation: isolate;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(20rem, 1.35fr) minmax(0, 1fr);
		grid-template-rows: minmax(7rem, 1fr) minmax(12rem, 1.4fr) minmax(7rem, 1fr);
		grid-template-areas:
			'upper-left top upper-right'
			'left center right'
			'lower-left bottom lower-right';
		gap: var(--table-gap);
		align-items: center;
		height: calc(100dvh - 14rem);
		min-height: 30rem;
		max-height: 58rem;
		margin-top: 0.15rem;
		padding: 0.5rem 0.45rem 0.65rem;
	}
	.table-surface {
		position: absolute;
		z-index: -1;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	.table-surface::before {
		position: absolute;
		inset: 13% 8%;
		border: 0.65rem solid #362514;
		border-radius: 50%;
		background:
			radial-gradient(ellipse at 50% 43%, rgb(62 132 86 / 22%), transparent 67%),
			radial-gradient(ellipse at center, #155238 0%, #0d422f 58%, #0a3528 100%);
		box-shadow:
			inset 0 0 0 1px rgb(239 197 112 / 38%),
			inset 0 0 2.5rem rgb(0 0 0 / 30%),
			0 0 0 1px rgb(233 189 109 / 40%),
			0 0 0 0.85rem #241a12,
			0 1.2rem 2.6rem rgb(0 0 0 / 42%);
		content: '';
	}
	.table-surface::after {
		position: absolute;
		inset: calc(13% + 0.6rem) calc(8% + 0.6rem);
		border: 1px solid rgb(239 197 112 / 17%);
		border-radius: 50%;
		content: '';
	}
	.table-center {
		grid-area: center;
		position: relative;
		z-index: 1;
		display: flex;
		min-width: 0;
		min-height: 11rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		border: 1px solid rgb(228 195 126 / 18%);
		border-radius: 1.5rem;
		padding: clamp(0.65rem, 1.2vw, 1rem);
		background: radial-gradient(
			ellipse at center,
			rgb(7 39 28 / 86%),
			rgb(8 45 32 / 25%) 74%,
			transparent
		);
		text-shadow: 0 1px 1px #0008;
		text-align: center;
	}
	.table-center :global(h2) {
		color: #f0d18c;
		text-shadow: 0 2px 14px rgb(0 0 0 / 40%);
	}
	.table-center :global([data-testid='center-game-actions']) {
		width: 100%;
		max-width: 21rem;
		margin-top: 0.2rem;
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
	.table-seat {
		grid-area: var(--seat-position);
		z-index: 2;
		min-width: 0;
		width: min(100%, 16.5rem);
		justify-self: center;
	}
	.table-seat.self {
		width: min(100%, 17rem);
	}
	.table-seat :global(.card) {
		border-radius: 1rem;
		box-shadow: 0 0.55rem 1.2rem rgb(0 0 0 / 38%);
	}
	.table-seat :global(.card-body) {
		gap: 0.35rem;
		padding: 0.5rem;
	}
	.table-seat.self :global([data-testid='game-actions']) {
		display: none;
	}
	.table-scene[data-game='rummy'] {
		height: calc(100dvh - 21rem);
		min-height: 25rem;
	}
	.table-scene[data-game='rummy'] .table-seat :global([data-testid='seat-video'] > div:first-child),
	.table-scene[data-game='rummy'] .table-seat :global(video) {
		height: 3.7rem;
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
			min-height: 27rem;
			padding-inline: 0;
		}
		.table-surface::before {
			inset: 13% 5%;
			border-width: 0.45rem;
		}
		.table-surface::after {
			inset: calc(13% + 0.45rem) calc(5% + 0.45rem);
		}
		.table-center {
			min-height: 11rem;
			border-radius: 1.5rem;
			padding: 1rem 0.65rem;
		}
		.table-seat,
		.table-seat.self {
			width: min(100%, 13.5rem);
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
		.table-center :global([data-testid='dealer-cards'] playing-card) {
			height: 4.25rem !important;
			width: 3rem !important;
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
			box-shadow: inset 0 0 0.6rem rgb(0 0 0 / 18%);
		}
		.table-surface::before {
			inset: 20% -18%;
			border-width: 0.35rem;
		}
		.table-surface::after {
			inset: calc(20% + 0.35rem) calc(-18% + 0.35rem);
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
			padding: 0.3rem;
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
			height: calc(100dvh - 27rem);
			min-height: 16rem;
			grid-template-rows: minmax(4.5rem, 1fr) minmax(7rem, 1.2fr) minmax(4.5rem, 1fr);
		}
		.table-scene[data-game='rummy']
			.table-seat
			:global([data-testid='seat-video'] > div:first-child),
		.table-scene[data-game='rummy'] .table-seat :global(video) {
			height: 1.9rem;
		}
	}

	@media (max-height: 700px) {
		.table-scene {
			height: calc(100dvh - 12rem);
			min-height: 23rem;
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
			height: calc(100dvh - 9rem);
			min-height: 0;
			grid-template-rows: minmax(0, 1fr) minmax(4rem, 1.2fr) minmax(0, 1fr);
		}
		.table-surface::before {
			inset: 20% 0;
		}
		.table-surface::after {
			inset: calc(20% + 0.35rem) 0.35rem;
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
	@media (max-width: 959px) and (max-height: 500px) {
		.table-center :global([data-game-action='teen-patti']) {
			display: none;
		}
	}
	@media (max-width: 639px) and (max-height: 700px) {
		.table-scene {
			height: calc(100dvh - 16rem);
			min-height: 18rem;
		}
		.table-scene[data-game='rummy'] {
			height: calc(100dvh - 23rem);
			min-height: 13rem;
			grid-template-rows: minmax(3.8rem, 1fr) minmax(6rem, 1.2fr) minmax(3.8rem, 1fr);
		}
	}
</style>
