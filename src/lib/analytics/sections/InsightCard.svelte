<script lang="ts">
	/** One insight from the engine: the sentence, how strong the evidence is, and why it is shown. */
	import { EVIDENCE_LABEL } from '../format.js';
	import type { Insight } from '../types.js';
	let { insight, onOpenHand }: { insight: Insight; onOpenHand?: (id: string) => void } = $props();
</script>

<article class="insight" class:record={insight.type === 'record'}>
	<p>{insight.text}</p>
	<footer>
		<span class="tag">{EVIDENCE_LABEL[insight.confidence?.evidence] ?? 'Evidence'}</span>
		{#if insight.type !== 'record' && insight.confidence?.q !== null}
			<span class="muted tiny" title="Chance this is luck, after allowing for every pattern we checked">
				{insight.confidence.q < 0.01 ? 'Very unlikely to be luck' : 'Unlikely to be luck'}
			</span>
		{/if}
		{#if onOpenHand && insight.supportingHands?.length}
			<button class="link" onclick={() => onOpenHand(insight.supportingHands.at(-1) ?? '')}>See a hand</button>
		{/if}
	</footer>
</article>

<style>
	.insight {
		display: grid;
		gap: 0.6rem;
		border: 1px solid rgb(231 199 132 / 22%);
		border-radius: 1rem;
		background: linear-gradient(160deg, rgb(231 199 132 / 9%), transparent 60%);
		padding: 1rem 1.1rem;
	}
	.insight.record {
		border-color: rgb(241 235 220 / 12%);
		background: rgb(255 255 255 / 3%);
	}
	p {
		font-size: 0.98rem;
		line-height: 1.45;
	}
	footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}
	.tag {
		border-radius: 999px;
		background: rgb(231 199 132 / 14%);
		padding: 0.15rem 0.55rem;
		color: #e7c784;
		font-size: 0.68rem;
	}
	.link {
		margin-left: auto;
		color: #e7c784;
		font-size: 0.75rem;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
