<script lang="ts">
	/**
	 * One row per group: the estimate as a dot, its 95% range as a whisker, zero as a line.
	 * Shows at a glance which differences are real and which are noise.
	 */
	export interface Row {
		key: string;
		label: string;
		value: number | null;
		low?: number | null;
		high?: number | null;
		detail?: string;
		dim?: boolean;
	}
	/** scale "row": each row on its own axis, for groups measured in different stakes. */
	let { rows, unit = 'boots a hand', scale = 'shared' }: { rows: Row[]; unit?: string; scale?: 'shared' | 'row' } = $props();
	const bound = $derived(
		Math.max(0.5, ...rows.flatMap((r) => [r.value, r.low, r.high]).filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)).map(Math.abs))
	);
	const rowBound = (r: Row) =>
		Math.max(0.5, ...[r.value, r.low, r.high].filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)).map((v) => Math.abs(v) * 1.15));
	const pos = (v: number, r?: Row) => 50 + (v / (scale === 'row' && r ? rowBound(r) : bound)) * 46;
	const fmt = (v: number | null | undefined) =>
		v === null || v === undefined ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 100) / 100)}`;
</script>

<ul class="ranges" aria-label="Estimates with 95% ranges, in {unit}">
	{#each rows as row (row.key)}
		<li class:dim={row.dim}>
			<span class="row-label">{row.label}{#if row.detail}<small>{row.detail}</small>{/if}</span>
			<span class="track" aria-hidden="true">
				<span class="zero"></span>
				{#if row.value !== null}
					{#if row.low !== null && row.low !== undefined && row.high !== null && row.high !== undefined}
						<span class="whisker" style:left="{pos(row.low, row)}%" style:width="{pos(row.high, row) - pos(row.low, row)}%"></span>
					{/if}
					<span class="dot" class:neg={row.value < 0} style:left="{pos(row.value, row)}%"></span>
				{/if}
			</span>
			<span class="value">{fmt(row.value)}</span>
		</li>
	{/each}
</ul>
<p class="legend">Dot: {unit}. Line: the range it could really be. Crossing the dashed zero means “can’t tell yet”.{scale === 'row' ? ' Each row has its own scale.' : ''}</p>

<style>
	.ranges {
		display: grid;
		gap: 0.55rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: minmax(7rem, 1.1fr) 2fr 3.2rem;
		align-items: center;
		gap: 0.7rem;
	}
	li.dim {
		opacity: 0.45;
	}
	.row-label {
		display: grid;
		font-size: 0.85rem;
	}
	.row-label small {
		color: #b1b9ae;
		font-size: 0.68rem;
	}
	.track {
		position: relative;
		height: 1.3rem;
	}
	.zero {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		border-left: 1px dashed rgb(241 235 220 / 30%);
	}
	.whisker {
		position: absolute;
		top: 50%;
		height: 3px;
		transform: translateY(-50%);
		border-radius: 3px;
		background: rgb(231 199 132 / 40%);
	}
	.dot {
		position: absolute;
		top: 50%;
		width: 0.7rem;
		height: 0.7rem;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: #e7c784;
	}
	.dot.neg {
		background: #e0806e;
	}
	.value {
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.legend {
		margin-top: 0.5rem;
		color: #b1b9ae;
		font-size: 0.7rem;
	}
	@media (max-width: 520px) {
		li {
			grid-template-columns: 1fr 3rem;
		}
		.track {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
