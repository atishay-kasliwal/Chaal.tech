<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import TwentyNineTable from '#lib/tricks/TwentyNineTable.svelte';
	import type { TwentyNineRoom } from '#lib/tricks/types.js';

	/**
	 * Development harness for 29 (the API answers 404 outside `vite dev`): you, a partner and two
	 * opponents, all Chaal characters but you. The engine and bots run on the dev server (./api), exactly as the room server runs
	 * them; this page only sends actions and draws its own seat's view. ?seed=N fixes decks and bot
	 * draws; ?bots=rohit-sharma,ms-dhoni,gg picks who sits down.
	 */
	const seed = page.url.searchParams.get('seed') ?? '7';
	const bots = page.url.searchParams.get('bots') ?? 'rohit-sharma,ms-dhoni,gg';
	const table = `${seed}:${bots}:${Math.random().toString(36).slice(2)}`;
	let view = $state<TwentyNineRoom | null>(null);
	let message = $state('');

	async function call(event: string, args: unknown[] = []) {
		const response = await fetch('/test-29/api', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ table, seed, bots, event, args })
		});
		if (!response.ok) {
			message = 'The practice table runs only in development.';
			return false;
		}
		const body = await response.json();
		view = body.view;
		message = body.error ?? '';
		return body.ok;
	}
	onMount(() => {
		void call('reset');
		// Bots play one move at a time, at a human pace.
		const timer = setInterval(() => {
			const v = view;
			if (!v || !v.isStarted || v.gameShow) return;
			const current = v.usersList.find((u) => u.id === v.currentPlayerId);
			if (current?.isBot) void call('tick');
		}, 700);
		return () => clearInterval(timer);
	});
</script>

<svelte:head><title>29 practice · Chaal</title></svelte:head>
{#if message}<p class="toast" role="alert">{message}</p>{/if}
{#if view}
	<TwentyNineTable
		room={view}
		selfId="you"
		connected={true}
		seated={true}
		send={call}
		onLeave={() => history.back()}
		onInvite={() => {}}
	/>
{/if}

<style>
	.toast {
		position: fixed;
		bottom: 16px;
		left: 50%;
		translate: -50% 0;
		padding: 10px 16px;
		border-radius: 12px;
		background: var(--red);
		color: #fff;
		z-index: 10;
	}
</style>
