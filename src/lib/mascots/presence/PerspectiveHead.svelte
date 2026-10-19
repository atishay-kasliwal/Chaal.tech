<script lang="ts">
	import { onMount } from 'svelte';
	import { createPerspectiveRenderer } from './perspective-renderer.js';
	import type { PresenceFrame } from './types.js';
	let { onready, onerror }: { onready: () => void; onerror: () => void } = $props();
	let canvas: HTMLCanvasElement;
	let renderer: Awaited<ReturnType<typeof createPerspectiveRenderer>> | null = null;
	let latest: PresenceFrame | null = null;
	let announced = false;
	function paint() {
		if (renderer && latest) {
			renderer.draw(latest);
			if (!announced) {
				announced = true;
				onready();
			}
		}
	}
	onMount(() => {
		let closed = false;
		const failed = (event: Event) => {
			event.preventDefault();
			if (!closed) onerror();
		};
		canvas.addEventListener('webglcontextlost', failed);
		void createPerspectiveRenderer(canvas)
			.then((created) => {
				if (closed) {
					created.dispose();
					return;
				}
				renderer = created;
				paint();
			})
			.catch(() => {
				if (!closed) onerror();
			});
		return () => {
			closed = true;
			canvas.removeEventListener('webglcontextlost', failed);
			renderer?.dispose();
		};
	});
	export function draw(frame: PresenceFrame) {
		latest = frame;
		paint();
	}
</script>

<canvas
	bind:this={canvas}
	width="360"
	height="360"
	data-testid="perspective-head"
	aria-hidden="true"
></canvas>

<style>
	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
</style>
