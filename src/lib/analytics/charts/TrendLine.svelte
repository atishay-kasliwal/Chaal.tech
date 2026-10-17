<script lang="ts">
	/** Running total of boots over hands: the shape of someone's results at a glance. */
	let { points, label = 'Running total in boots' }: { points: { i: number; units: number }[]; label?: string } = $props();
	const W = 600;
	const H = 150;
	const P = 8;
	const values = $derived(points.map((p) => p.units));
	const lo = $derived(Math.min(0, ...values));
	const hi = $derived(Math.max(0, ...values));
	const span = $derived(hi - lo || 1);
	const x = (k: number) => P + (k / Math.max(1, points.length - 1)) * (W - 2 * P);
	const y = (v: number) => P + (1 - (v - lo) / span) * (H - 2 * P);
	const path = $derived(points.map((p, k) => `${k ? 'L' : 'M'}${x(k).toFixed(1)},${y(p.units).toFixed(1)}`).join(' '));
	const last = $derived(points.at(-1)?.units ?? 0);
</script>

{#if points.length > 1}
	<figure class="trend">
		<svg viewBox="0 0 {W} {H}" role="img" aria-label="{label}: ends at {last} boots after {points.at(-1)?.i} hands">
			<line x1={P} x2={W - P} y1={y(0)} y2={y(0)} class="zero" />
			<path d="{path} L{x(points.length - 1)},{y(0)} L{x(0)},{y(0)} Z" class="area" class:down={last < 0} />
			<path d={path} class="line" class:down={last < 0} />
			<circle cx={x(points.length - 1)} cy={y(last)} r="4" class="end" class:down={last < 0} />
		</svg>
		<figcaption>{label} · {points.at(-1)?.i} hands</figcaption>
	</figure>
{/if}

<style>
	.trend {
		margin: 0;
	}
	svg {
		display: block;
		width: 100%;
		height: auto;
	}
	.zero {
		stroke: rgb(241 235 220 / 22%);
		stroke-dasharray: 3 4;
	}
	.line {
		fill: none;
		stroke: #e7c784;
		stroke-width: 2.4;
		stroke-linejoin: round;
	}
	.area {
		fill: rgb(231 199 132 / 10%);
	}
	.line.down {
		stroke: #e0806e;
	}
	.area.down {
		fill: rgb(224 128 110 / 10%);
	}
	.end {
		fill: #e7c784;
	}
	.end.down {
		fill: #e0806e;
	}
	figcaption {
		margin-top: 0.3rem;
		color: #b1b9ae;
		font-size: 0.72rem;
	}
</style>
