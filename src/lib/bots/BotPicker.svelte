<script lang="ts">
	import { onMount } from 'svelte';
	import { club } from '#lib/club/club.svelte.js';
	import BotPortrait from './BotPortrait.svelte';
	import type { ClubBot } from './types.js';
	let {
		occupied = [],
		selected = [],
		game = 'teen-patti',
		busy = false,
		onpick
	}: {
		occupied?: string[];
		selected?: string[];
		game?: string;
		busy?: boolean;
		onpick: (id: string) => void;
	} = $props();
	let bots = $state<ClubBot[]>([]);
	let error = $state('');
	let loading = $state(true);
	async function load() {
		loading = true;
		error = '';
		try {
			const { response, body } = await club.request('/bots');
			if (!response.ok) throw new Error(body.error ?? 'Could not load opponents');
			bots = body.bots;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not load opponents';
		} finally {
			loading = false;
		}
	}
	onMount(() => {
		void load();
	});
</script>

<div class="bot-picker" data-testid="bot-picker">
	{#if loading}<p role="status">Finding company…</p>
	{:else if error}<p role="alert">{error}</p>
		<button onclick={load}>Try again</button>
	{:else}
		<div class="choices">
			{#each bots as bot (bot.botId)}
				{@const seated = occupied.includes(bot.botId)}
				{@const supported = bot.style?.supportedGames.includes(game)}
				<button
					class:chosen={selected.includes(bot.botId)}
					disabled={busy || seated || !supported}
					aria-pressed={selected.includes(bot.botId)}
					onclick={() => onpick(bot.botId)}
					title={seated ? 'Already at the table' : !supported ? 'Teen Patti only' : bot.description}
				>
					<BotPortrait mascotId={bot.avatar?.mascotId} name={bot.name} size={84} />
					<strong>{bot.name}</strong><small
						>{seated
							? 'Already seated'
							: !supported
								? 'Teen Patti only'
								: bot.personality?.title}</small
					>
				</button>
			{/each}
		</div>
		{#if !bots.length}<p>No bots are available tonight.</p>{/if}
		<a class="all" href="/bots">Meet the characters ↗</a>
	{/if}
</div>

<style>
	.bot-picker {
		width: 100%;
		min-width: 0;
		color: #e6ddc7;
	}
	.choices {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding: 0.3rem 0.1rem 0.7rem;
		overscroll-behavior-x: contain;
	}
	.choices button {
		display: flex;
		flex: 0 0 105px;
		min-width: 0;
		flex-direction: column;
		align-items: center;
		border: 1px solid #ffffff18;
		background: #19251d;
		border-radius: 0.7rem;
		padding: 0.2rem 0.4rem 0.6rem;
		cursor: pointer;
	}
	.choices button:hover,
	.choices button.chosen {
		border-color: #d8b86e;
		background: #293526;
	}
	.choices button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	strong {
		font-size: 0.7rem;
		line-height: 1.4;
	}
	small {
		color: #aeb5a3;
		font-size: 0.58rem;
		line-height: 1.4;
		margin-top: 0.25rem;
	}
	.all {
		color: #c5b27d;
		font-size: 0.7rem;
	}
	p {
		font-size: 0.8rem;
	}
</style>
