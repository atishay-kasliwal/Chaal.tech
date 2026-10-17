<script lang="ts">
	import Mascot from '#lib/mascots/Mascot.svelte';
	import { onDestroy } from 'svelte';
	import { SHEET_CELLS, mascots, pick, reactions } from '#lib/mascots/mascots.svelte.js';

	/**
	 * Design preview for the friends' mascots on a mock table: each one peeks over the top
	 * edge of a camera tile, watches whoever's turn it is, and reacts to a made-up hand.
	 * Poke one to see it squash. Nothing here talks to a server.
	 */
	mascots.load();

	const friends = $derived(Object.keys(mascots.manifest));
	let active = $state<string | null>(null);
	let caption = $state('');
	let size = $state(100);
	let hold = $state<string | null>(null);
	const faces = Object.values(SHEET_CELLS).flat();

	let timers: ReturnType<typeof setTimeout>[] = [];
	onDestroy(() => {
		timers.forEach(clearTimeout);
		reactions.clear();
	});
	function playHand() {
		timers.forEach(clearTimeout);
		timers = [];
		reactions.clear();
		hold = null;
		if (friends.length < 2) return;
		const [a, b, c = a] = [...friends].sort(() => Math.random() - 0.5);
		const beats: [number, () => void][] = [
			[0, () => ((caption = 'New hand'), (active = a))],
			[1400, () => ((caption = `${a} plays blind`), reactions.show(a, 'blind', 2000))],
			[2800, () => ((caption = `${b}'s turn`), (active = b))],
			[
				3900,
				() => {
					caption = `${b} raises big`;
					reactions.show(b, 'smug', 2000);
					for (const f of friends)
						if (f !== b) reactions.show(f, pick(['shocked', 'surprised', 'nervous']), 1800);
				}
			],
			[
				6000,
				() => (
					(caption = `${c} packs`),
					(active = c),
					reactions.show(c, pick(['cry', 'bashful']), 1800)
				)
			],
			[8000, () => ((caption = 'Show!'), (active = null))],
			[
				9000,
				() => {
					caption = `${a} wins the pot`;
					reactions.show(a, pick(['starstruck', 'delighted', 'rich']), 3800);
					for (const f of friends)
						if (f !== a) reactions.show(f, pick(['dizzy', 'shocked', 'cry', 'laugh']), 3600);
				}
			],
			[13500, () => (caption = '')]
		];
		for (const [at, beat] of beats) timers.push(setTimeout(beat, at));
	}
</script>

<svelte:head><title>Mascots preview</title></svelte:head>

<main>
	<header>
		<h1>Club mascots</h1>
		<p>
			Each mascot sits on the right border of its camera tile and watches whoever's turn it is. Move
			your mouse when nobody is playing and they follow it. Poke one.
		</p>
	</header>

	{#if mascots.ready && !friends.length}
		<p class="note">No mascot art installed yet.</p>
	{:else}
		<section class="controls">
			<button class="primary" onclick={playHand}>Play a hand</button>
			<label>
				Size
				<input type="range" min="36" max="140" bind:value={size} />
				{size}px
			</label>
			<label>
				Hold a face
				<select bind:value={hold}>
					<option value={null}>none</option>
					{#each faces as face (face)}<option value={face}>{face}</option>{/each}
				</select>
			</label>
		</section>
		{#if caption}<p class="caption">{caption}</p>{/if}

		<section class="table">
			<div class="pot">Pot</div>
			<div class="seats">
				{#each friends as id (id)}
					<div
						class="seat"
						data-testid="player-seat"
						data-active={active === id}
						data-player-id={id}
					>
						<div class="ring" class:on={active === id}>
							<div class="frame">
								<span class="name">{id}</span>
								<span class="cam">camera</span>
							</div>
							<span class="peek" style:--size="{size}px">
								<Mascot
									{id}
									{size}
									reaction={hold ?? reactions.byPlayer[id]?.pose ?? null}
									watch={active && active !== id
										? `[data-player-id="${active}"] .frame`
										: active === id
											? '.pot'
											: null}
									label={id}
								/>
							</span>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		min-height: 100vh;
		padding: 1.25rem 1rem 3rem;
		background: #0b241a;
		color: #f3e7c9;
		font:
			15px/1.45 system-ui,
			sans-serif;
	}
	header h1 {
		margin: 0;
		font-size: 1.5rem;
	}
	header p,
	.note {
		margin: 0.25rem 0 1rem;
		max-width: 40rem;
		opacity: 0.75;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 1rem;
	}
	button,
	select {
		border: 1px solid #3c7a5f;
		border-radius: 999px;
		background: #0b2e21;
		color: inherit;
		padding: 0.35rem 0.8rem;
	}
	button.primary {
		border-color: #f0d18c;
		background: #f0d18c;
		color: #14281f;
		cursor: pointer;
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.caption {
		margin: 0.75rem 0 0;
		font-size: 1.1rem;
		font-weight: 700;
		color: #f0d18c;
	}
	.table {
		display: block;
		margin-top: 1rem;
		border-radius: 2rem;
		background: radial-gradient(ellipse at 50% 40%, #1f6b4d, #0d3a29 70%);
		padding: 5rem 86px 2rem 1.5rem;
	}
	.pot {
		width: max-content;
		margin: 0 auto 4rem;
		border-radius: 999px;
		background: rgb(0 0 0 / 35%);
		padding: 0.5rem 1.2rem;
		color: #f0d18c;
		font-weight: 700;
	}
	.seats {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(12rem, 100%), 1fr));
		gap: 5rem 1.25rem;
	}
	.ring {
		position: relative;
		border-radius: 1.05rem;
		padding: 3px;
		background: linear-gradient(160deg, rgb(255 236 200 / 45%), rgb(40 28 16 / 60%));
		transition: box-shadow 200ms;
	}
	.ring.on {
		box-shadow: 0 0 0 2px #f0d18c;
	}
	.frame {
		position: relative;
		overflow: hidden;
		aspect-ratio: 16 / 9;
		border-radius: 0.85rem;
		background:
			radial-gradient(ellipse at 45% 45%, rgb(150 120 95 / 55%), transparent 45%),
			linear-gradient(160deg, #3a3f46, #15181c);
	}
	.name {
		position: absolute;
		top: 0.4rem;
		right: 0.5rem;
		border-radius: 999px;
		background: rgb(8 14 12 / 78%);
		padding: 0.1rem 0.5rem;
		font-size: 0.75rem;
	}
	.cam {
		position: absolute;
		inset: auto 0 0.5rem;
		text-align: center;
		font-size: 0.7rem;
		opacity: 0.35;
	}
	.peek {
		position: absolute;
		z-index: 4;
		right: calc(var(--size) * -0.5);
		bottom: calc(var(--size) * -0.32);
	}
</style>
