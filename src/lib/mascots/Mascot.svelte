<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { mascots, sheetCell, type Direction } from './mascots.svelte.js';

	/**
	 * A friend's mascot, drawn as aligned 3x3 sprite sheets (after koboyo's page-mascot):
	 * nine head directions and nine-cell expression sheets. The head turns toward whatever
	 * it is watching (an element, else the pointer), it blinks now and then, and a poke
	 * squashes it and gets a little reaction. Swapping cells moves background-position only.
	 */
	let {
		id,
		outfit = 'signature',
		size = 52,
		reaction = null,
		watch = null,
		label = '',
		poke = true
	}: {
		id: string;
		outfit?: string;
		size?: number;
		/** An expression to hold, by name (see SHEET_CELLS in catalog.ts). */
		reaction?: string | null;
		/** CSS selector of what to look at; falls back to the pointer. */
		watch?: string | null;
		label?: string;
		poke?: boolean;
	} = $props();

	mascots.load();

	let root = $state<HTMLElement>();
	let squash = $state<HTMLElement>();
	let direction = $state<Direction>('center');
	let blinking = $state(false);
	let poked = $state<string | null>(null);

	const shown = $derived(poked ?? reaction ?? (blinking ? 'blink' : null));
	const face = $derived(shown ? sheetCell(id, outfit, shown) : null);
	const dirSheet = $derived(mascots.sheet(id, outfit, 'directions'));
	const sheets = $derived(
		mascots
			.sheets(id, outfit)
			.filter(
				(sheet) => sheet.name === 'reactions' || sheet.name === 'game' || sheet.url === face?.url
			)
	);

	// Pick one of eight head turns from the angle to the target, with a dead zone so the
	// head settles when the target is close, and hysteresis so it doesn't flicker.
	const CLOCKWISE: Direction[] = [
		'right',
		'down-right',
		'down',
		'down-left',
		'left',
		'up-left',
		'up',
		'up-right'
	];
	const SECTOR = (Math.PI * 2) / 8;
	let sector = -1;
	let pointer: { x: number; y: number } | null = null;
	function aim() {
		if (!root) return;
		const target = watch
			? watch
					.split(',')
					.map((selector) => document.querySelector(selector.trim())?.getBoundingClientRect())
					.find(Boolean)
			: null;
		const point = target
			? { x: target.left + target.width / 2, y: target.top + target.height / 2 }
			: pointer;
		if (!point) return;
		const box = root.getBoundingClientRect();
		const dx = point.x - (box.left + box.width / 2);
		const dy = point.y - (box.top + box.height / 2);
		if (Math.hypot(dx, dy) < Math.max(40, size * 0.9)) {
			sector = -1;
			direction = 'center';
			return;
		}
		const angle = Math.atan2(dy, dx);
		const off = Math.atan2(Math.sin(angle - sector * SECTOR), Math.cos(angle - sector * SECTOR));
		if (sector !== -1 && Math.abs(off) < SECTOR / 2 + 0.12) return;
		sector = (Math.round(angle / SECTOR) + 8) % 8;
		direction = CLOCKWISE[sector];
	}

	$effect(() => {
		void watch;
		aim();
	});

	let timers: ReturnType<typeof setTimeout>[] = [];
	let blinkTimer: ReturnType<typeof setTimeout> | undefined;
	let boops = { count: 0, at: 0 };
	onMount(() => {
		const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
		const onMove = (event: PointerEvent) => {
			pointer = { x: event.clientX, y: event.clientY };
			if (!watch) aim();
		};
		if (finePointer) addEventListener('pointermove', onMove, { passive: true });
		// Watched seats move with layout; re-aim a few times a second.
		const tick = setInterval(() => watch && aim(), 400);
		const blink = () => {
			blinkTimer = setTimeout(
				() => {
					if (direction === 'center' && !reaction && !poked) {
						blinking = true;
						setTimeout(() => (blinking = false), 140);
					}
					blink();
				},
				2600 + Math.random() * 4200
			);
		};
		blink();
		return () => {
			removeEventListener('pointermove', onMove);
			clearInterval(tick);
		};
	});
	onDestroy(() => {
		clearTimeout(blinkTimer);
		timers.forEach(clearTimeout);
	});

	const PAYOFFS = [
		'heart',
		'sparkle',
		'delighted',
		'chai',
		'jalebi',
		'poha',
		'kulfi',
		'party',
		'side-eye',
		'nerd'
	];
	function boop() {
		timers.forEach(clearTimeout);
		timers = [];
		const now = Date.now();
		boops = { count: now - boops.at < 1600 ? boops.count + 1 : 1, at: now };
		if (boops.count >= 4) {
			boops.count = 0;
			poked = 'dizzy';
			timers.push(setTimeout(() => (poked = null), 1100));
		} else {
			poked = 'blink';
			timers.push(
				setTimeout(() => (poked = PAYOFFS[Math.floor(Math.random() * PAYOFFS.length)]), 120)
			);
			timers.push(setTimeout(() => (poked = null), 560));
		}
		if (
			matchMedia('(prefers-reduced-motion: reduce)').matches ||
			document.documentElement.hasAttribute('data-reduced-motion')
		)
			return;
		squash?.animate(
			[
				{ transform: 'scale(1, 1)', easing: 'ease-in' },
				{ transform: 'scale(1.10, 0.86)', offset: 0.18, easing: 'ease-out' },
				{ transform: 'scale(0.95, 1.08)', offset: 0.45, easing: 'ease-in-out' },
				{ transform: 'scale(1.03, 0.97)', offset: 0.72, easing: 'ease-in-out' },
				{ transform: 'scale(1, 1)' }
			],
			{ duration: 420, easing: 'linear' }
		);
	}

	const position = (index: number) => `${(index % 3) * 50}% ${Math.floor(index / 3) * 50}%`;
	const DIRS: Direction[] = [
		'up-left',
		'up',
		'up-right',
		'left',
		'center',
		'right',
		'down-left',
		'down',
		'down-right'
	];
</script>

{#if dirSheet}
	<svelte:element
		this={poke ? 'button' : 'span'}
		bind:this={root}
		class="mascot"
		style:--size="{size}px"
		type={poke ? 'button' : undefined}
		onclick={poke ? boop : undefined}
		aria-label={poke ? `Poke ${label || 'the mascot'}` : label || undefined}
		aria-hidden={poke || label ? undefined : 'true'}
		data-reaction={shown}
		role={poke ? undefined : 'img'}
	>
		<span class="squash" bind:this={squash}>
			<span
				class="layer"
				style:background-image="url({dirSheet})"
				style:background-position={position(DIRS.indexOf(direction))}
				style:opacity={face ? 0 : 1}
			></span>
			<!-- Preload gameplay sheets; food and fun sheets load when requested. -->
			{#each sheets as sheet (sheet.url)}
				<span
					class="layer"
					style:background-image="url({sheet.url})"
					style:background-position={face?.url === sheet.url ? position(face.index) : '0 0'}
					style:opacity={face?.url === sheet.url ? 1 : 0}
				></span>
			{/each}
		</span>
	</svelte:element>
{/if}

<style>
	.mascot {
		position: relative;
		display: block;
		flex: none;
		width: var(--size);
		height: var(--size);
		padding: 0;
		border: 0;
		background: transparent;
		appearance: none;
		user-select: none;
		-webkit-tap-highlight-color: transparent;
	}
	button.mascot {
		cursor: pointer;
	}
	.squash {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		transform-origin: 50% 78%;
	}
	.layer {
		position: absolute;
		inset: 0;
		background-size: 300% 300%;
		background-repeat: no-repeat;
	}
</style>
