<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { HOW_TO_PLAY } from './how-to-play.js';

	/**
	 * "Up next" card shown to everyone once the next game is settled: the game, its rules in plain
	 * words, and a countdown to the deal. Closing it only hides it for you.
	 */
	let {
		rulesVersion,
		name,
		badge,
		seconds,
		total,
		note = '',
		onclose
	}: {
		rulesVersion: string;
		name: string;
		/** How the game was chosen, e.g. "🎲 Random picked" or "Raju picked". */
		badge: string;
		/** Whole seconds left until the deal. */
		seconds: number;
		total: number;
		/** A line about the deck, e.g. who is cutting it. */
		note?: string;
		onclose: () => void;
	} = $props();

	const how = $derived(HOW_TO_PLAY[rulesVersion]);
	// The ring empties as the deal comes closer.
	const RADIUS = 21;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
	const offset = $derived(CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, seconds / total))));
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && onclose()} />

<div class="scrim" transition:fade={{ duration: 200 }} aria-hidden="true"></div>
<div
	class="next-card"
	role="dialog"
	aria-modal="false"
	aria-labelledby="next-card-name"
	in:fly={{ y: 16, duration: 320 }}
	out:fade={{ duration: 180 }}
	data-testid="next-game-card"
>
	<header>
		<span class="badge">{badge}</span>
		<span class="deal-clock" aria-label="Dealing in {seconds} seconds">
			<svg viewBox="0 0 50 50" aria-hidden="true">
				<circle class="track" cx="25" cy="25" r={RADIUS} />
				<circle
					class="left"
					cx="25"
					cy="25"
					r={RADIUS}
					stroke-dasharray={CIRCUMFERENCE}
					stroke-dashoffset={offset}
				/>
			</svg>
			<strong>{seconds}</strong>
		</span>
	</header>
	<p class="eyebrow">Up next</p>
	<h2 id="next-card-name">{name}</h2>
	{#if how}
		<p class="win">{how.win}</p>
		<ul>
			{#each how.points.slice(0, 4) as point (point)}<li>{point}</li>{/each}
		</ul>
	{/if}
	<footer>
		<span class="hint">{note || 'Dealing when the countdown ends'}</span>
		<button class="got-it" onclick={onclose}>Got it</button>
	</footer>
</div>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 20;
		background: radial-gradient(ellipse at center, rgb(0 0 0 / 35%), rgb(0 0 0 / 10%) 70%);
		pointer-events: none;
	}
	.next-card {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 21;
		width: min(30rem, calc(100% - 2rem));
		max-height: calc(100% - 2rem);
		overflow: auto;
		translate: -50% -50%;
		border-radius: 1.4rem;
		background:
			radial-gradient(ellipse 80% 55% at 50% 0%, rgb(244 214 140 / 16%), transparent 70%),
			linear-gradient(180deg, rgb(12 34 23 / 97%), rgb(6 18 12 / 97%));
		padding: 1.1rem 1.4rem 1.1rem;
		box-shadow:
			inset 0 0 0 1px rgb(240 200 120 / 45%),
			0 24px 60px rgb(0 0 0 / 60%);
		color: #f1ebdc;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}
	.badge {
		border-radius: 999px;
		background: rgb(244 214 140 / 14%);
		padding: 0.3rem 0.8rem;
		color: #f4d68c;
		font-size: 0.85rem;
		font-weight: 800;
	}
	.deal-clock {
		position: relative;
		display: grid;
		width: 3.2rem;
		height: 3.2rem;
		flex: none;
		place-items: center;
	}
	.deal-clock svg {
		position: absolute;
		inset: 0;
		rotate: -90deg;
	}
	.deal-clock circle {
		fill: none;
		stroke-width: 4;
	}
	.deal-clock .track {
		stroke: rgb(255 255 255 / 10%);
	}
	.deal-clock .left {
		stroke: #f4d68c;
		stroke-linecap: round;
		transition: stroke-dashoffset 900ms linear;
	}
	.deal-clock strong {
		color: #f7dc95;
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
	}
	.eyebrow {
		margin-top: 0.4rem;
		color: rgb(244 227 181 / 65%);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	h2 {
		color: #f7dc95;
		font-size: clamp(1.6rem, 3vw, 2.1rem);
		font-weight: 850;
		line-height: 1.15;
	}
	.win {
		margin-top: 0.35rem;
		font-size: 1.05rem;
		font-weight: 700;
	}
	ul {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.7rem;
		padding-left: 1.1rem;
		color: rgb(241 235 220 / 85%);
		font-size: 0.93rem;
		line-height: 1.4;
		list-style: disc;
	}
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 1rem;
	}
	.hint {
		color: rgb(241 235 220 / 55%);
		font-size: 0.8rem;
	}
	.got-it {
		border-radius: 999px;
		background: linear-gradient(180deg, #f7dc95, #d9ac4c);
		padding: 0.55rem 1.4rem;
		color: #2d1f05;
		font-weight: 800;
		cursor: pointer;
	}
</style>
