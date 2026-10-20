<script lang="ts" module>
	export const DENOMINATIONS = [1000, 500, 200, 100, 50, 25, 20, 10, 5] as const;
	export type Denomination = (typeof DENOMINATIONS)[number];

	/** Each chip's body colour, matching static/chips artwork; the rim is painted from it. */
	export const CHIP_COLORS: Record<Denomination, string> = {
		5: '#34658a',
		10: '#147782',
		20: '#67448b',
		25: '#09634c',
		50: '#cd541b',
		100: '#333330',
		200: '#802938',
		500: '#244ca0',
		1000: '#aa2630'
	};

	/**
	 * Break an amount into real chips, largest first, the way a dealer would pay it.
	 * `spread` skips chips worth more than amount ÷ spread, so a pot looks like a pile.
	 */
	export function chipsFor(amount: number, max = 12, spread = 1): Denomination[] {
		const chips: Denomination[] = [];
		let left = Math.max(0, Math.floor(amount));
		for (const value of DENOMINATIONS) {
			if (value > 5 && value * spread > amount) continue;
			while (left >= value && chips.length < max) {
				chips.push(value);
				left -= value;
			}
		}
		// Anything under the smallest chip still shows one chip on the felt.
		if (!chips.length && amount > 0) chips.push(5);
		return chips;
	}
</script>

<script lang="ts">
	import { asset } from '$app/paths';

	/**
	 * Real chips lying on the felt: the chip artwork tilted into perspective as the face,
	 * a curved rim with the edge inserts below it, a gloss on top and a shadow on the cloth.
	 */
	let {
		amount,
		size = '1.6rem',
		height = 5,
		spread = 1,
		stacks: maxStacks = Infinity
	}: {
		amount: number;
		/** Chip diameter as a CSS length. */
		size?: string;
		/** Tallest a stack is drawn; the ×N badge gives the real count. */
		height?: number;
		/** Aim for at least this many chips by using smaller ones. */
		spread?: number;
		/** Most denominations drawn; small leftovers are dropped from the picture (the label shows the exact amount). */
		stacks?: number;
	} = $props();

	/** One stack per denomination, biggest value first, with its exact count. */
	const stacks = $derived.by(() => {
		const groups: { value: Denomination; count: number }[] = [];
		for (const value of chipsFor(amount, 10_000, spread)) {
			const last = groups.at(-1);
			if (last?.value === value) last.count++;
			else groups.push({ value, count: 1 });
		}
		return groups.slice(0, maxStacks);
	});
	const tallest = $derived(Math.max(1, ...stacks.map((stack) => Math.min(stack.count, height))));
</script>

<span class="chip-stacks" style:--chip={size} style:--tallest={tallest} aria-hidden="true">
	{#each stacks as { value, count } (value)}
		<span class="stack">
			{#each Array.from({ length: Math.min(count, height) }, (_, i) => i) as index (index)}
				<span
					class="chip"
					style:--i={index}
					style:--jitter="{((index * 37) % 7) - 3}%"
					style:--base={CHIP_COLORS[value]}
				>
					<span class="rim"></span>
					<img
						class="face"
						src={asset(`chips/probo-player-${value}.svg`)}
						alt=""
						draggable="false"
					/>
					<span class="gloss"></span>
				</span>
			{/each}
			{#if count > 1}
				<span class="chip-count" style:--n={Math.min(count, height)}>×{count}</span>
			{/if}
		</span>
	{/each}
</span>

<style>
	.chip-stacks {
		/* --face: height of a chip's top seen at an angle; --edge: thickness of one chip. */
		--tilt: 0.5;
		--face: calc(var(--chip) * var(--tilt));
		--edge: calc(var(--chip) * 0.15);
		display: inline-flex;
		align-items: flex-end;
		gap: calc(var(--chip) * -0.14);
		height: calc(var(--face) + var(--edge) * var(--tallest));
		vertical-align: middle;
	}
	.stack {
		position: relative;
		display: block;
		width: var(--chip);
		height: 100%;
	}
	/* Contact shadow on the cloth under each pile. */
	.stack::before {
		position: absolute;
		bottom: calc(var(--face) * -0.18);
		left: -8%;
		width: 116%;
		height: calc(var(--face) * 0.9);
		border-radius: 50%;
		background: radial-gradient(closest-side, rgb(0 0 0 / 60%), transparent);
		filter: blur(2px);
		content: '';
	}
	/* Middle piles sit slightly forward, like chips pushed together. */
	.stack:nth-child(even) {
		translate: 0 calc(var(--chip) * 0.1);
	}
	/* How many chips of this value: a small tag at the top-right of the stack. */
	.chip-count {
		position: absolute;
		bottom: calc(var(--face) + var(--edge) * var(--n) - var(--chip) * 0.3);
		left: 72%;
		z-index: 2;
		display: block;
		width: auto;
		height: auto;
		border-radius: 999px;
		background: rgb(33 28 46 / 88%);
		padding: 0.05rem 0.35rem;
		box-shadow:
			0 1px 3px rgb(0 0 0 / 55%),
			inset 0 0 0 1px rgb(247 220 149 / 25%);
		color: #f2dc91;
		font-size: max(0.6rem, calc(var(--chip) * 0.22));
		font-variant-numeric: tabular-nums;
		font-weight: 800;
		line-height: 1.3;
		white-space: nowrap;
	}
	.chip {
		position: absolute;
		bottom: calc(var(--i) * var(--edge));
		left: var(--jitter);
		width: var(--chip);
		height: calc(var(--face) + var(--edge));
	}
	/* The rim: a band as tall as the chip is thick, curving round the front of the face.
	   Cream edge inserts on the chip's colour, shaded dark at the sides like a cylinder. */
	.rim {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		height: calc(var(--face) / 2 + var(--edge));
		border-radius: 0 0 50% 50% / 0 0 calc(var(--face) / 2) calc(var(--face) / 2);
		background:
			linear-gradient(
				90deg,
				rgb(0 0 0 / 62%),
				rgb(0 0 0 / 18%) 18%,
				rgb(255 255 255 / 22%) 40%,
				rgb(255 255 255 / 6%) 58%,
				rgb(0 0 0 / 25%) 80%,
				rgb(0 0 0 / 68%)
			),
			repeating-linear-gradient(90deg, var(--base) 0 11%, #f2e5c9 11% 17%, var(--base) 17% 22%);
		box-shadow:
			inset 0 -1px 0 rgb(0 0 0 / 45%),
			inset 0 1px 0 rgb(255 255 255 / 10%);
	}
	/* Squash the round artwork into the ellipse of a chip lying on the table. */
	.face {
		position: absolute;
		bottom: var(--edge);
		left: 0;
		width: var(--chip);
		height: var(--chip);
		max-width: none;
		transform: scaleY(var(--tilt));
		transform-origin: bottom;
		user-select: none;
	}
	/* Lamp light catching the glossy top. */
	.gloss {
		position: absolute;
		bottom: var(--edge);
		left: 0;
		width: 100%;
		height: var(--face);
		border-radius: 50%;
		background:
			radial-gradient(ellipse 60% 55% at 38% 28%, rgb(255 255 255 / 30%), transparent 70%),
			radial-gradient(ellipse at 50% 50%, transparent 62%, rgb(0 0 0 / 22%) 100%);
		pointer-events: none;
	}
</style>
