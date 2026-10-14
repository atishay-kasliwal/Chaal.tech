<script lang="ts">
	import GameActions from './GameActions.svelte';

	let {
		user,
		selfId,
		active,
		gameShow,
		legalActions,
		connected,
		twoRemaining,
		chal = $bindable(1),
		actions
	}: {
		user: User;
		selfId: string;
		active: boolean;
		gameShow: boolean;
		legalActions: RoomData['legalActions'];
		connected: boolean;
		twoRemaining: boolean;
		chal?: number;
		actions: {
			seeCardsHandler: () => void;
			packHandler: () => void;
			chalHandler: () => void;
			showHandler: () => void;
		};
	} = $props();
</script>

<div class="mobile-action-bar" data-testid="mobile-action-bar" aria-label="Your game actions">
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

<style>
	.mobile-action-bar {
		display: none;
	}
	@media (max-width: 639px), (max-width: 959px) and (max-height: 500px) {
		.mobile-action-bar {
			position: fixed;
			inset: auto 0.5rem calc(0.5rem + env(safe-area-inset-bottom));
			z-index: 50;
			display: block;
			width: min(calc(100% - 1rem), 34rem);
			margin-inline: auto;
			padding: 0.5rem 0.75rem;
			border: 1px solid color-mix(in srgb, var(--color-primary) 35%, transparent);
			border-radius: var(--radius-box);
			background: color-mix(in srgb, var(--color-base-100) 94%, transparent);
			box-shadow: 0 0.75rem 2rem rgb(0 0 0 / 0.45);
			backdrop-filter: blur(12px);
		}
		.mobile-action-bar :global([data-testid='game-actions']) {
			min-height: 0;
			margin: 0;
			border: 0;
			padding: 0;
		}
		.mobile-action-bar :global([data-testid='game-actions'] > div:first-child) {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.5rem;
		}
		.mobile-action-bar :global([data-testid='game-actions'] > div:first-child > div:first-child) {
			flex-wrap: nowrap;
			gap: 0.375rem;
		}
		.mobile-action-bar :global(.btn-lg) {
			min-height: 2.75rem;
			height: 2.75rem;
			padding-inline: 0.625rem;
			font-size: 0.875rem;
		}
		.mobile-action-bar :global(input[type='number']) {
			width: 3.25rem;
			min-height: 2.75rem;
		}
		.mobile-action-bar :global([data-testid='game-actions'] > button) {
			min-height: 2.75rem;
			margin-top: 0.5rem;
		}
		:global(.table-seat.self [data-testid='game-actions']) {
			display: none;
		}
	}
	@media (max-width: 359px) {
		.mobile-action-bar {
			padding-inline: 0.5rem;
		}
		.mobile-action-bar :global(.btn-lg) {
			gap: 0.25rem;
			padding-inline: 0.45rem;
			font-size: 0.8rem;
		}
	}
</style>
