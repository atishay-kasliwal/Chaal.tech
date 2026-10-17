<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { asset } from '$app/paths';
	import { Scissors, Lock } from '@lucide/svelte';
	import { club } from '#lib/club/club.svelte.js';

	/**
	 * Cut the deck: the 52 sealed cards fanned across the felt. Move along them to choose where
	 * to cut (or use the arrow keys), tap to cut; the two halves swap places, then the cut is sent.
	 */
	let {
		gameName,
		commitment = '',
		seconds,
		total,
		oncut
	}: {
		gameName: string;
		/** The sealed deck's fingerprint, shown short. */
		commitment?: string;
		seconds: number;
		total: number;
		oncut: (at: number) => void;
	} = $props();

	const CARDS = 52;
	let at = $state(26);
	/** idle → lift (the top part rises) → swap (halves trade places) → done. */
	let phase = $state<'idle' | 'lift' | 'swap' | 'done'>('idle');
	let fan: HTMLDivElement | undefined = $state();

	function pointTo(clientX: number) {
		if (!fan || phase !== 'idle') return;
		const box = fan.getBoundingClientRect();
		const ratio = (clientX - box.left) / box.width;
		at = Math.max(1, Math.min(CARDS - 1, Math.round(ratio * CARDS)));
	}
	function cut() {
		if (phase !== 'idle') return;
		phase = 'lift';
		setTimeout(() => (phase = 'swap'), 320);
		setTimeout(() => {
			phase = 'done';
			oncut(at);
		}, 1150);
	}
	function onkeydown(event: KeyboardEvent) {
		if (phase !== 'idle') return;
		if (event.key === 'ArrowLeft') at = Math.max(1, at - 1);
		else if (event.key === 'ArrowRight') at = Math.min(CARDS - 1, at + 1);
		else if (event.key === 'Enter' || event.key === ' ') cut();
		else return;
		event.preventDefault();
	}
	/** Where card `i` sits in the fan: before the cut its own place, after it the halves swapped. */
	const slot = (i: number) =>
		phase === 'swap' || phase === 'done' ? (i >= at ? i - at : i + (CARDS - at)) : i;
	const back = $derived(asset(`cards/back-${club.settings.look.cardBack}.svg`));
	const RADIUS = 21;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
</script>

<div class="scrim" transition:fade={{ duration: 200 }} aria-hidden="true"></div>
<div
	class="cut-card"
	role="dialog"
	aria-modal="false"
	aria-labelledby="cut-title"
	in:fly={{ y: 16, duration: 320 }}
	out:fade={{ duration: 180 }}
	data-testid="deck-cut"
>
	<header>
		<div>
			<p class="eyebrow">Up next · {gameName}</p>
			<h2 id="cut-title"><Scissors size={20} /> Cut the deck</h2>
		</div>
		<span class="deal-clock" aria-label="{seconds} seconds left">
			<svg viewBox="0 0 50 50" aria-hidden="true">
				<circle class="track" cx="25" cy="25" r={RADIUS} />
				<circle
					class="left"
					cx="25"
					cy="25"
					r={RADIUS}
					stroke-dasharray={CIRCUMFERENCE}
					stroke-dashoffset={CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, seconds / total)))}
				/>
			</svg>
			<strong>{seconds}</strong>
		</span>
	</header>

	<p class="why">
		The deck for this hand is already shuffled and sealed. You choose where it's cut, so nobody, not
		even the server, can decide who gets which cards.
	</p>

	<div
		class="fan"
		class:moving={phase !== 'idle'}
		bind:this={fan}
		role="slider"
		tabindex="0"
		aria-label="Where to cut the deck"
		aria-valuemin={1}
		aria-valuemax={CARDS - 1}
		aria-valuenow={at}
		onpointermove={(event) => pointTo(event.clientX)}
		onpointerdown={(event) => pointTo(event.clientX)}
		onclick={cut}
		{onkeydown}
	>
		{#each Array.from({ length: CARDS }, (_, i) => i) as i (i)}
			<img
				class="card"
				class:top={i < at}
				class:lifted={i < at && phase === 'lift'}
				src={back}
				alt=""
				draggable="false"
				style:--slot={slot(i)}
				style:--z={phase === 'idle' || phase === 'lift' ? i : slot(i)}
			/>
		{/each}
		{#if phase === 'idle'}
			<span class="cut-line" style:--at={at} aria-hidden="true"></span>
		{/if}
	</div>

	<footer>
		<span class="where">
			{#if phase === 'idle'}Cut after card <strong>{at}</strong>{:else}Cut at <strong>{at}</strong> ✓{/if}
		</span>
		{#if commitment}<span class="seal" title="Fingerprint of the sealed deck: {commitment}"
				><Lock size={12} /> Sealed #{commitment.slice(0, 8)}</span
			>{/if}
		<button class="cut-btn" onclick={cut} disabled={phase !== 'idle'}>
			<Scissors size={16} /> Cut here
		</button>
	</footer>
</div>

<style>
	.scrim {
		position: absolute;
		inset: 0;
		z-index: 20;
		background: radial-gradient(ellipse at center, rgb(0 0 0 / 40%), rgb(0 0 0 / 15%) 70%);
		pointer-events: none;
	}
	.cut-card {
		position: absolute;
		top: 50%;
		left: 50%;
		z-index: 21;
		display: grid;
		gap: 0.8rem;
		width: min(40rem, calc(100% - 2rem));
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
	.eyebrow {
		color: rgb(244 227 181 / 65%);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #f7dc95;
		font-size: 1.6rem;
		font-weight: 850;
	}
	.why {
		color: rgb(241 235 220 / 75%);
		font-size: 0.88rem;
		line-height: 1.45;
	}
	.fan {
		--card-w: clamp(3.4rem, 7vw, 4.6rem);
		--step: calc((100% - var(--card-w)) / 51);
		position: relative;
		height: calc(var(--card-w) * 1.45 + 2.4rem);
		margin: 0.6rem 0 0.2rem;
		cursor: crosshair;
		touch-action: none;
		outline: none;
	}
	.fan:focus-visible {
		border-radius: 0.6rem;
		box-shadow: 0 0 0 2px #f4d68c;
	}
	.card {
		position: absolute;
		top: 1.6rem;
		left: calc(var(--slot) * var(--step));
		z-index: var(--z);
		width: var(--card-w);
		border-radius: calc(var(--card-w) * 0.08);
		box-shadow: -2px 0 4px rgb(0 0 0 / 35%);
		transition:
			left 620ms cubic-bezier(0.45, 0, 0.2, 1),
			transform 300ms ease;
		pointer-events: none;
		user-select: none;
	}
	/* While choosing: the top part (above the cut) lifts a little, so you see what moves. */
	.fan:not(.moving) .card.top {
		transform: translateY(-0.55rem);
	}
	.card.lifted {
		transform: translateY(-1.6rem) rotate(-2deg);
	}
	.cut-line {
		position: absolute;
		top: 0.3rem;
		bottom: 0;
		left: calc(var(--at) * var(--step) + var(--card-w) * 0.15);
		z-index: 60;
		width: 3px;
		border-radius: 3px;
		background: #f4d68c;
		box-shadow: 0 0 12px #f4d68c;
		pointer-events: none;
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.where {
		color: rgb(241 235 220 / 80%);
		font-size: 0.95rem;
	}
	.where strong {
		color: #f7dc95;
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
	}
	.seal {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 6%);
		padding: 0.2rem 0.6rem;
		color: rgb(241 235 220 / 60%);
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
	}
	.cut-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border-radius: 999px;
		background: linear-gradient(180deg, #f7dc95, #d9ac4c);
		padding: 0.55rem 1.4rem;
		color: #2d1f05;
		font-weight: 800;
		cursor: pointer;
	}
	.cut-btn:disabled {
		opacity: 0.55;
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
	@media (prefers-reduced-motion: reduce) {
		.card {
			transition: none;
		}
	}
</style>
