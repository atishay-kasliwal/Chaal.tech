<script lang="ts">
	import PlayingCard from '#lib/components/PlayingCard.svelte';
	let { user, selfId, gameShow }: { user: User; selfId: string; gameShow: boolean } = $props();
</script>

<div
	class="relative"
	data-testid="card-fan"
	aria-label={`${user.username} cards${user.isPacked ? ', packed' : ''}`}
>
	<ol class="relative my-1 flex h-[3.25rem] justify-center -space-x-4 sm:h-[3.75rem] sm:-space-x-5">
		{#each user.cardsInHand as card, cIdx (cIdx)}
			<li
				class="relative cursor-pointer transition-transform hover:-translate-y-2 focus:-translate-y-2 focus:outline-none"
				style="z-index: {cIdx};"
			>
				{#if (!user.isBlind && user.id === selfId) || (gameShow && !user.isPacked)}
					<PlayingCard
						rank={card.rank}
						suit={card.suit}
						class="!h-[3.25rem] !w-[2.25rem] sm:!h-[3.75rem] sm:!w-[2.6rem]"
					/>
				{:else}
					<PlayingCard
						faceDown={true}
						class="!h-[3.25rem] !w-[2.25rem] sm:!h-[3.75rem] sm:!w-[2.6rem]"
					/>
				{/if}
			</li>
		{/each}
	</ol>
	{#if user.isPacked}
		<div
			class="bg-base-300/80 absolute inset-0 z-10 flex items-center justify-center rounded-lg backdrop-blur-[1px]"
		>
			<span
				class="text-base-content/50 border-base-content/20 rotate-[-15deg] rounded-lg border-2 p-1 text-sm font-black tracking-widest uppercase"
				>Packed</span
			>
		</div>
	{/if}
</div>
