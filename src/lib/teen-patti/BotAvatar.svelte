<script lang="ts">
	import Mascot from '#lib/mascots/Mascot.svelte';
	/** A friendly face for a bot seat, stable per bot name. No camera, no network. */
	let {
		name,
		level,
		mascotId,
		size = 210,
		reaction = null,
		watch = null,
		thinking = false
	}: { name: string; level: string; mascotId?: string; size?: number; reaction?: string | null; watch?: string | null; thinking?: boolean } = $props();
	const faces = ['😎', '🤠', '🧐', '😏', '🤓', '🥸', '😄', '🤩', '😌', '🙃', '😼', '🦁'];
	const palettes = [
		['#3b2a6b', '#7a4fd0'],
		['#1f4d5c', '#2f9fa8'],
		['#5c2a2a', '#c4573f'],
		['#2b4a2a', '#5fa154'],
		['#4a3b1c', '#c9952f'],
		['#2a3557', '#5876c9']
	];
	const seed = $derived([...name].reduce((sum, char) => sum + char.charCodeAt(0), 0));
	const face = $derived(faces[seed % faces.length]);
	const palette = $derived(palettes[seed % palettes.length]);
</script>

<div class="bot-avatar" style:--from={palette[0]} style:--to={palette[1]} data-testid="bot-avatar">
	{#if mascotId}<Mascot id={mascotId} label={name} {size} {reaction} {watch} />{:else}<span class="face" class:thinking aria-hidden="true">{face}</span>{/if}
	<span class="badge-bot">Bot{mascotId ? '' : ` · ${level}`}</span>
	{#if thinking}
		<span class="dots" aria-label="thinking"><i></i><i></i><i></i></span>
	{/if}
</div>

<style>
	.bot-avatar {
		position: relative;
		display: grid;
		aspect-ratio: 4 / 3;
		width: 100%;
		place-items: center;
		overflow: hidden;
		border-radius: 0.85rem;
		background:
			radial-gradient(circle at 50% 38%, rgb(255 255 255 / 18%), transparent 55%),
			linear-gradient(150deg, var(--from), var(--to));
	}
	.face {
		font-size: clamp(1.8rem, calc(var(--seat-w, 12rem) * 0.28), 5rem);
		filter: drop-shadow(0 0.3rem 0.6rem rgb(0 0 0 / 35%));
	}
	.face.thinking {
		animation: tp-bob 1.2s ease-in-out infinite;
	}
	.badge-bot {
		position: absolute;
		bottom: 0.4rem;
		left: 0.4rem;
		border-radius: 999px;
		background: rgb(8 14 12 / 70%);
		padding: 0.1rem 0.5rem;
		color: #e9e2cf;
		font-size: 0.58rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.dots {
		position: absolute;
		bottom: 18%;
		display: flex;
		gap: 0.25rem;
	}
	.dots i {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 999px;
		background: #f7f0dd;
		animation: tp-dot 1s ease-in-out infinite;
	}
	.dots i:nth-child(2) {
		animation-delay: 0.15s;
	}
	.dots i:nth-child(3) {
		animation-delay: 0.3s;
	}
	@keyframes tp-bob {
		50% {
			transform: translateY(-6%) rotate(-4deg);
		}
	}
	@keyframes tp-dot {
		50% {
			opacity: 0.25;
			transform: translateY(-3px);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.face.thinking,
		.dots i {
			animation: none;
		}
	}
</style>
