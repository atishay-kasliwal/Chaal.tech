<script lang="ts">
	import { Eye, EyeOff, Hand, Gavel } from '@lucide/svelte';

	let {
		user,
		selfId,
		active,
		gameShow,
		legalActions,
		connected,
		twoRemaining,
		chal = $bindable(1),
		actions
	}: {
		user: User;
		selfId: string;
		active: boolean;
		gameShow: boolean;
		legalActions: RoomData['legalActions'];
		connected: boolean;
		twoRemaining: boolean;
		chal?: number;
		actions: {
			seeCardsHandler: () => void;
			packHandler: () => void;
			chalHandler: () => void;
			showHandler: () => void;
		};
	} = $props();
</script>

<div
	class="border-base-300 mt-4 flex min-h-16 flex-col justify-end border-t pt-4"
	data-testid="game-actions"
>
	{#if gameShow}
		<div class="badge badge-accent badge-lg mx-auto font-bold">
			<Eye class="mr-1 h-4 w-4" /> Showdown
		</div>
	{:else if user.id === selfId && !user.isPacked}
		<div class="flex flex-wrap items-center justify-between gap-2">
			<div class="flex gap-2">
				<button
					onclick={actions.seeCardsHandler}
					disabled={!connected || !legalActions.see}
					class="btn btn-lg"
				>
					{#if user.isBlind}<Eye class="h-4 w-4" /> See{:else}<EyeOff class="h-4 w-4" /> Seen{/if}
				</button>
				{#if active}
					<button
						disabled={!connected || !legalActions.pack}
						onclick={actions.packHandler}
						class="btn btn-lg"
					>
						<Hand class="h-4 w-4" /> Pack
					</button>
				{/if}
			</div>

			{#if active}
				<div class="join">
					<input
						bind:value={chal}
						min={legalActions.minBet}
						max={legalActions.maxBet}
						type="number"
						class="input input-bordered input-sm join-item w-[80px] sm:w-[60px] text-center font-mono"
					/>
					<button
						onclick={actions.chalHandler}
						disabled={!connected || !legalActions.bet}
						class="btn btn-lg"
					>
						{user.isBlind ? 'Blind' : 'Chal'}
					</button>
				</div>
			{/if}
		</div>

		{#if active && twoRemaining && legalActions.show}
			<button
				onclick={actions.showHandler}
				disabled={!connected}
				class="btn btn-lg btn-accent mt-3 w-full font-bold"
			>
				<Gavel class="h-4 w-4" /> Show
			</button>
		{/if}
	{:else}
		<div class="text-base-content/60 text-center text-sm font-semibold">
			{#if !user.isPacked}
				{user.isBlind ? 'Playing Blind' : 'Cards Seen'}
			{/if}
		</div>
	{/if}
</div>
