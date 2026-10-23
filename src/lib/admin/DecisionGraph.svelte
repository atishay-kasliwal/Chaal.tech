<script lang="ts">
	import { deltaChips, signedDelta, type GraphNode, type NodeView } from './inspector.js';

	/**
	 * A policy's decision graph, drawn from its definition: the nodes run top to bottom, in order
	 * (server/bots/graph.mjs). Given a recorded decision's nodes, the route it took is lit, each
	 * visited node numbered, with what that node added to each move.
	 */
	let { nodes, policy = '' }: { nodes: (GraphNode | NodeView)[]; policy?: string } = $props();

	const view = $derived(
		nodes.map((node) => ({
			...node,
			visited: 'visited' in node ? node.visited : null,
			order: 'order' in node ? node.order : null,
			notes: 'notes' in node ? node.notes : [],
			chips: 'deltas' in node ? deltaChips(node.deltas).slice(0, 6) : [],
			total: 'total' in node ? node.total : null
		}))
	);
	const highlighted = $derived(view.some((node) => node.visited !== null));
	const lastVisited = $derived(view.findLastIndex((node) => node.visited));
</script>

<ol class="dg" class:dg-traced={highlighted} aria-label="Decision graph{policy ? ` for ${policy}` : ''}">
	{#each view as node, k (node.id)}
		{@const lit = node.visited === true}
		{@const next = view[k + 1]}
		<li class="dg-node" class:dg-lit={lit} class:dg-skip={node.visited === false}>
			<div class="dg-rail" aria-hidden="true">
				<svg class="dg-dot" viewBox="0 0 28 28" width="28" height="28">
					<circle cx="14" cy="14" r="12" />
					<text x="14" y="18.5" text-anchor="middle">{lit ? node.order : k + 1}</text>
				</svg>
				{#if next}
					<svg class="dg-edge" class:dg-edge-lit={lit && next.visited} viewBox="0 0 10 10" preserveAspectRatio="none">
						<line x1="5" y1="0" x2="5" y2="10" vector-effect="non-scaling-stroke" />
					</svg>
				{/if}
			</div>
			<div class="dg-body">
				<p class="dg-head">
					<code>{node.id}</code>
					<span class="dg-desc">{node.label}</span>
					{#if node.visited === false}<span class="dg-flag">skipped</span>{/if}
					{#if lit && k === lastVisited && k < view.length - 1}<span class="dg-flag dg-stop">stopped here</span>{/if}
				</p>
				{#if lit && node.notes.length}
					<ul class="dg-notes">
						{#each node.notes as note, n (n)}<li>{note}</li>{/each}
					</ul>
				{/if}
				{#if lit && node.chips.length}
					<ul class="dg-chips" aria-label="What {node.id} added">
						{#each node.chips as chip (chip.key)}
							<li class:dg-up={chip.v > 0} class:dg-down={chip.v < 0}>
								{chip.label} <strong>{signedDelta(chip.v)}</strong> to {chip.move}
							</li>
						{/each}
					</ul>
				{/if}
				{#if lit && node.total && Object.values(node.total).some((v) => v !== 0)}
					<p class="dg-total">
						Sum: {Object.entries(node.total)
							.map(([move, v]) => `${move} ${signedDelta(v)}`)
							.join(' · ')}
					</p>
				{/if}
			</div>
		</li>
	{/each}
</ol>

<style>
	.dg {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.dg-node {
		display: grid;
		grid-template-columns: 28px minmax(0, 1fr);
		gap: 14px;
		min-width: 0;
	}
	.dg-rail {
		display: grid;
		grid-template-rows: 28px 1fr;
		justify-items: center;
	}
	.dg-dot circle {
		fill: var(--surface);
		stroke: var(--line);
		stroke-width: 1.5;
	}
	.dg-dot text {
		fill: var(--muted);
		font-size: 12px;
		font-weight: 700;
		font-family: inherit;
	}
	.dg-lit .dg-dot circle {
		fill: var(--butter);
		stroke: var(--butter);
	}
	.dg-lit .dg-dot text {
		fill: var(--night);
	}
	.dg-edge {
		width: 10px;
		height: 100%;
		min-height: 14px;
	}
	.dg-edge line {
		stroke: var(--line);
		stroke-width: 2;
	}
	.dg-edge.dg-edge-lit line {
		stroke: var(--butter);
	}
	.dg-body {
		display: grid;
		gap: 6px;
		min-width: 0;
		padding: 3px 0 18px;
	}
	.dg-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		font-size: 14px;
		line-height: 1.35;
	}
	.dg-head code {
		font-weight: 700;
		color: var(--paper);
	}
	.dg-desc {
		color: var(--muted);
		overflow-wrap: anywhere;
	}
	.dg-traced .dg-skip {
		opacity: 0.45;
	}
	.dg-flag {
		padding: 1px 8px;
		border: 1px solid var(--line);
		border-radius: 100px;
		color: var(--muted);
		font-size: 11px;
		font-weight: 600;
	}
	.dg-flag.dg-stop {
		border-color: var(--butter);
		color: var(--butter);
	}
	.dg-notes {
		display: grid;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
		color: var(--paper);
		font-size: 13px;
		overflow-wrap: anywhere;
	}
	.dg-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.dg-chips li {
		padding: 3px 10px;
		border: 1px solid var(--line);
		border-radius: 100px;
		background: #0000002e;
		font-size: 12px;
		overflow-wrap: anywhere;
	}
	.dg-chips strong {
		font-variant-numeric: tabular-nums;
	}
	.dg-chips .dg-up strong {
		color: #8fe0ad;
	}
	.dg-chips .dg-down strong {
		color: #f3b0a5;
	}
	.dg-total {
		color: var(--muted);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		overflow-wrap: anywhere;
	}
</style>
