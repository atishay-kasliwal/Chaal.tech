<script lang="ts">
	/** Horizontal bars with an optional "expected" tick: distributions, and you against the club. */
	export interface Bar {
		key: string;
		label: string;
		value: number | null;
		expected?: number | null;
		text?: string;
		detail?: string;
		dim?: boolean;
	}
	let { bars, max, expectedLabel = 'expected' }: { bars: Bar[]; max?: number; expectedLabel?: string } = $props();
	const top = $derived(max ?? Math.max(0.0001, ...bars.flatMap((b) => [b.value ?? 0, b.expected ?? 0])));
</script>

<ul class="bars">
	{#each bars as bar (bar.key)}
		<li class:dim={bar.dim}>
			<span class="row-label">{bar.label}{#if bar.detail}<small>{bar.detail}</small>{/if}</span>
			<span class="track" aria-hidden="true">
				<span class="fill" style:width="{((bar.value ?? 0) / top) * 100}%"></span>
				{#if bar.expected !== null && bar.expected !== undefined}
					<span class="tick" style:left="{(bar.expected / top) * 100}%" title={expectedLabel}></span>
				{/if}
			</span>
			<span class="value">{bar.text ?? bar.value ?? '–'}</span>
		</li>
	{/each}
</ul>

<style>
	.bars {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: minmax(6.5rem, 1fr) 2fr 4.6rem;
		align-items: center;
		gap: 0.7rem;
		font-size: 0.85rem;
	}
	li.dim {
		opacity: 0.45;
	}
	.row-label {
		display: grid;
	}
	.row-label small {
		color: #b1b9ae;
		font-size: 0.68rem;
	}
	.track {
		position: relative;
		height: 0.75rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 5%);
	}
	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		border-radius: 999px;
		background: linear-gradient(90deg, #c9963d, #e7c784);
	}
	.tick {
		position: absolute;
		top: -0.2rem;
		bottom: -0.2rem;
		width: 2px;
		background: #f1ebdc;
		opacity: 0.8;
	}
	.value {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
</style>
