<script lang="ts">
	import { Check, Coins, Flag, MoveUpRight } from '@lucide/svelte';
	let { legalActions, raiseTo = $bindable(4), action }: {
		legalActions: RoomData['legalActions'];
		raiseTo?: number;
		action: (name: 'fold' | 'check' | 'call' | 'raise') => void;
	} = $props();
</script>

<div class="bg-base-100/95 border-primary/20 fixed inset-x-0 bottom-0 z-40 border-t px-3 pt-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur md:hidden" data-testid="poker-mobile-actions">
	<div class="mx-auto flex max-w-xl items-center justify-center gap-2">
		{#if legalActions.fold}<button class="btn btn-outline btn-error btn-sm" onclick={() => action('fold')} aria-label="Fold"><Flag class="h-4 w-4" />Fold</button>{/if}
		{#if legalActions.check}<button class="btn btn-outline btn-primary btn-sm" onclick={() => action('check')} aria-label="Check"><Check class="h-4 w-4" />Check</button>{/if}
		{#if legalActions.call}<button class="btn btn-secondary btn-sm" onclick={() => action('call')} aria-label={`Call ${legalActions.toCall}`}><Coins class="h-4 w-4" />Call {legalActions.toCall}</button>{/if}
		{#if legalActions.raise}
			<label class="input input-sm w-20"><span class="sr-only">Raise to</span><input type="number" bind:value={raiseTo} min={legalActions.minRaiseTo} max={legalActions.maxRaiseTo} /></label>
			<button class="btn btn-primary btn-sm" onclick={() => action('raise')} aria-label={(legalActions.maxRaiseTo ?? 0) < (legalActions.minRaiseTo ?? 0) ? 'All in' : 'Raise'}><MoveUpRight class="h-4 w-4" />{(legalActions.maxRaiseTo ?? 0) < (legalActions.minRaiseTo ?? 0) ? 'All in' : 'Raise'}</button>
		{/if}
	</div>
</div>
