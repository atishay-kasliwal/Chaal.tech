<script lang="ts">
	import { ArrowDownToLine, Hand, Plus } from '@lucide/svelte';
	let {
		legalActions,
		action
	}: {
		legalActions: RoomData['legalActions'];
		action: (name: 'hit' | 'stand' | 'double') => void;
	} = $props();
</script>

<div class="mt-3 flex flex-wrap justify-center gap-2" data-testid="blackjack-actions">
	{#if legalActions.hit}<button class="btn btn-primary btn-sm" onclick={() => action('hit')}
			><Plus class="h-4 w-4" />Hit</button
		>{/if}
	{#if legalActions.stand}<button
			class="btn btn-outline btn-primary btn-sm"
			onclick={() => action('stand')}><Hand class="h-4 w-4" />Stand</button
		>{/if}
	{#if legalActions.double}<button class="btn btn-secondary btn-sm" onclick={() => action('double')}
			><ArrowDownToLine class="h-4 w-4" />Double</button
		>{/if}
</div>

<style>
	@media (max-width: 639px) {
		:global([data-testid='center-game-actions'] [data-testid='blackjack-actions']) {
			position: fixed;
			z-index: 60;
			inset: auto 0.5rem max(0.5rem, env(safe-area-inset-bottom));
			width: min(calc(100% - 1rem), 26rem);
			margin: 0 auto;
			padding: 0.55rem;
			border: 1px solid rgb(229 198 134 / 28%);
			border-radius: 0.9rem;
			background: rgb(10 20 17 / 96%);
			box-shadow: 0 0.8rem 2.2rem rgb(0 0 0 / 55%);
			backdrop-filter: blur(16px);
		}
	}
</style>
