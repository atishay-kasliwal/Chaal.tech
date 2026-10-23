<script lang="ts">
	import { fade } from 'svelte/transition';
	import DeckCard from '#lib/components/DeckCard.svelte';

	/**
	 * "Setting up your table": shown while a new table loads and its bots take their seats, so
	 * nobody watches an empty room fill in. The steps tick over on their own; the last one waits for
	 * the table to be ready, then the screen fades into the table.
	 */
	let { ready, bots = [] }: { ready: boolean; bots?: string[] } = $props();

	const steps = $derived([
		'Shuffling the deck',
		'Laying out the felt',
		bots.length ? `Seating ${listNames(bots)}` : 'Pulling up the chairs',
		'Dealing you in'
	]);

	function listNames(names: string[]) {
		if (names.length < 2) return names.join('');
		return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
	}

	// Each step takes a beat; the last one completes only when the table is ready.
	let reached = $state(0);
	$effect(() => {
		const id = setInterval(() => {
			if (reached < steps.length - 1) reached += 1;
		}, 520);
		return () => clearInterval(id);
	});
	const done = (i: number) => i < reached || (ready && i === steps.length - 1 && reached === i);
</script>

<div class="ts-screen" role="status" aria-live="polite" out:fade={{ duration: 320 }}>
	<div class="ts-deck" aria-hidden="true">
		{#each [0, 1, 2] as i (i)}
			<span class="ts-card" style:--i={i}><DeckCard faceDown class="!h-full !w-auto" /></span>
		{/each}
	</div>
	<h2 class="ts-title">Setting up your table</h2>
	<ol class="ts-steps">
		{#each steps as step, i (i)}
			<li class:ts-on={i <= reached} class:ts-done={done(i)}>
				<span class="ts-tick" aria-hidden="true">{done(i) ? '✓' : ''}</span>
				{step}
			</li>
		{/each}
	</ol>
</div>

<style>
	.ts-screen {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 1.1rem;
		padding: 1rem;
		background:
			radial-gradient(ellipse 60% 45% at 50% 42%, rgb(22 92 60 / 55%), transparent 70%),
			radial-gradient(ellipse at 50% 0%, #2a2340, #120f1c 70%);
		color: #f8f2e5;
		text-align: center;
	}
	.ts-deck {
		position: relative;
		width: 9rem;
		height: 7rem;
	}
	.ts-card {
		position: absolute;
		left: 50%;
		top: 0;
		height: 6.5rem;
		translate: -50% 0;
		filter: drop-shadow(0 0.6rem 1rem rgb(0 0 0 / 45%));
		animation: ts-shuffle 1.6s calc(var(--i) * 0.18s) ease-in-out infinite;
	}
	@keyframes ts-shuffle {
		0%,
		100% {
			translate: -50% 0;
			rotate: 0deg;
		}
		30% {
			translate: calc(-50% + (var(--i) - 1) * 2.6rem) -0.3rem;
			rotate: calc((var(--i) - 1) * 12deg);
		}
		60% {
			translate: -50% 0.2rem;
			rotate: 0deg;
		}
	}
	.ts-title {
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 4vw, 2.2rem);
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.ts-steps {
		display: grid;
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
		text-align: left;
	}
	.ts-steps li {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: rgb(248 242 229 / 35%);
		font-size: 0.95rem;
		font-weight: 650;
		transition: color 0.3s;
	}
	.ts-steps li.ts-on {
		color: rgb(248 242 229 / 90%);
	}
	.ts-tick {
		display: grid;
		width: 1.3rem;
		height: 1.3rem;
		flex: none;
		place-items: center;
		border: 2px solid rgb(242 220 145 / 35%);
		border-radius: 999px;
		color: #211c2e;
		font-size: 0.75rem;
		font-weight: 900;
		transition:
			background 0.3s,
			border-color 0.3s;
	}
	.ts-on .ts-tick {
		border-color: #f2dc91;
		animation: ts-pulse 1s ease-in-out infinite;
	}
	.ts-done .ts-tick {
		background: #f2dc91;
		animation: none;
	}
	@keyframes ts-pulse {
		50% {
			box-shadow: 0 0 0 5px rgb(242 220 145 / 18%);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.ts-card,
		.ts-on .ts-tick {
			animation: none;
		}
	}
</style>
