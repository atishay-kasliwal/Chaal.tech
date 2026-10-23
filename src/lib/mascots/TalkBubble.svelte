<script lang="ts">
	import { speech } from './mascots.svelte.js';

	/**
	 * A speech bubble from a seat tile: a character's table talk today, a friend mascot's quick line
	 * later (docs/ROADMAP.md). Place it inside a positioned seat element; it sits just outside the
	 * tile, above it (`side="above"`) or below it, so it never covers the seat's cards or buttons.
	 * The wrapper is a polite live region that stays mounted, so screen readers hear each new line.
	 */
	let {
		playerId,
		name,
		side = 'above',
		phoneSide = side
	}: {
		playerId: string;
		/** Who is talking, for screen readers ("Rohit: Easy runs"). */
		name: string;
		side?: 'above' | 'below';
		/** On phones (under 640px wide), where the seat tiles sit in a row along the top. */
		phoneSide?: 'above' | 'below';
	} = $props();

	const said = $derived(speech.byPlayer[playerId]);
</script>

<div
	class="tt-talk tt-{side} tt-phone-{phoneSide}"
	aria-live="polite"
	aria-atomic="true"
	data-testid="talk-slot"
>
	{#key said?.key}
		{#if said}
			<p
				class="tt-bubble"
				data-testid="talk-bubble"
				data-player-id={playerId}
				style:--tt-fade-at="{Math.max(0, said.ms - 400)}ms"
			>
				<span class="tt-sr">{`${name}: `}</span>{said.text}
			</p>
		{/if}
	{/key}
</div>

<style>
	.tt-talk {
		position: absolute;
		left: 50%;
		z-index: 30;
		display: flex;
		width: max-content;
		max-width: min(15rem, 100%, 80vw);
		translate: -50% 0;
		justify-content: center;
		pointer-events: none;
	}
	.tt-above {
		bottom: calc(100% + 0.55rem);
	}
	.tt-below {
		top: calc(100% + 0.55rem);
	}
	.tt-bubble {
		position: relative;
		margin: 0;
		border-radius: 0.9rem;
		background: #f7f1dc;
		padding: 0.35rem 0.75rem;
		color: #1d1a10;
		font-size: clamp(0.72rem, 1.05vw, 0.9rem);
		font-weight: 650;
		line-height: 1.25;
		text-align: center;
		overflow-wrap: anywhere;
		box-shadow: 0 0.4rem 1.2rem rgb(0 0 0 / 45%);
		animation:
			tt-in 220ms ease-out,
			tt-out 400ms ease-in var(--tt-fade-at, 3200ms) forwards;
	}
	/* The tail points at the tile. */
	.tt-bubble::after {
		position: absolute;
		left: 50%;
		width: 0.7rem;
		height: 0.7rem;
		background: inherit;
		content: '';
		rotate: 45deg;
		translate: -50% 0;
	}
	.tt-above .tt-bubble::after {
		bottom: -0.3rem;
	}
	.tt-below .tt-bubble::after {
		top: -0.3rem;
	}
	.tt-sr {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}
	@keyframes tt-in {
		from {
			opacity: 0;
			translate: 0 0.4rem;
			scale: 0.92;
		}
	}
	@keyframes tt-out {
		to {
			opacity: 0;
		}
	}
	@media (max-width: 639px) {
		.tt-phone-below {
			top: calc(100% + 0.45rem);
			bottom: auto;
		}
		.tt-phone-below .tt-bubble::after {
			top: -0.3rem;
			bottom: auto;
		}
		.tt-phone-above {
			top: auto;
			bottom: calc(100% + 0.45rem);
		}
		.tt-phone-above .tt-bubble::after {
			top: auto;
			bottom: -0.3rem;
		}
		.tt-bubble {
			padding: 0.25rem 0.55rem;
			font-size: 0.7rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.tt-bubble {
			animation: none;
		}
	}
</style>
