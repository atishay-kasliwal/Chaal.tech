<script lang="ts">
	import { ArrowDownToLine, Hand, Plus } from '@lucide/svelte';
	let { legalActions, action }: {
		legalActions: RoomData['legalActions'];
		action: (name: 'hit' | 'stand' | 'double') => void;
	} = $props();
</script>

<div class="mt-3 flex flex-wrap justify-center gap-2" data-testid="blackjack-actions">
	{#if legalActions.hit}<button class="btn btn-primary btn-sm" onclick={() => action('hit')}><Plus class="h-4 w-4" />Hit</button>{/if}
	{#if legalActions.stand}<button class="btn btn-outline btn-primary btn-sm" onclick={() => action('stand')}><Hand class="h-4 w-4" />Stand</button>{/if}
	{#if legalActions.double}<button class="btn btn-secondary btn-sm" onclick={() => action('double')}><ArrowDownToLine class="h-4 w-4" />Double</button>{/if}
</div>
