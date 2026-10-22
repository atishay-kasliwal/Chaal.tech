<script lang="ts">
	import type { Snippet } from 'svelte';
	import BotPortrait from '#lib/bots/BotPortrait.svelte';
	import { CAST } from '#lib/bots/cast.js';
	import type { TrickUser } from './types.js';

	/** Between hands, on the felt: who is seated, filling empty seats with characters, ready, deal. */
	let {
		users,
		selfId,
		hostId,
		roomName,
		seats,
		busy,
		canStart,
		startLabel,
		act,
		children
	}: {
		users: TrickUser[];
		selfId: string;
		hostId: string;
		roomName: string;
		seats: number;
		busy: boolean;
		canStart: boolean;
		startLabel: string;
		act: (event: string, args: unknown[]) => Promise<void>;
		children?: Snippet;
	} = $props();

	const me = $derived(users.find((u) => u.id === selfId));
	const isHost = $derived(hostId === selfId);
	const empty = $derived(Math.max(0, seats - users.length));
	const freeCast = $derived(CAST.filter((c) => !users.some((u) => u.characterId === c.id)));
	let picking = $state(false);
	const range = (n: number) => Array.from({ length: n }, (_, i) => i);
</script>

<div class="lobby">
	{@render children?.()}
	<div class="seats-list">
		{#each users as u (u.id)}
			<span class="chip"
				>{u.id === selfId ? 'You' : u.username}{#if u.isBot}{#if isHost}<button
							class="x"
							aria-label="Remove {u.username}"
							onclick={() => act('removeBot', [u.id])}>×</button
						>{/if}{:else}<em>{u.ready ? 'ready' : 'not ready'}</em>{/if}</span
			>
		{/each}
		{#each range(empty) as i (i)}<span class="chip empty">Empty seat</span>{/each}
	</div>
	{#if isHost && empty > 0}
		{#if picking}
			<div class="cast" role="group" aria-label="Choose a character">
				{#each freeCast as c (c.id)}
					<button
						class="who-btn"
						disabled={busy}
						onclick={async () => {
							await act('addBot', [c.id]);
							if (empty <= 1) picking = false;
						}}
						><BotPortrait mascotId={`bot-${c.id}`} name={c.name} size={48} /><span>{c.name}</span
						></button
					>
				{/each}
			</div>
		{:else}
			<button class="ghost" onclick={() => (picking = true)}
				>Fill {empty === 1 ? 'the empty seat' : `${empty} empty seats`} with a character</button
			>
		{/if}
	{/if}
	<div class="row">
		{#if me && !me.isBot}<button class="ghost" onclick={() => act('ready', [!me.ready])}
				>{me.ready ? 'Ready ✓' : 'I’m ready'}</button
			>{/if}
		{#if isHost}<button
				class="cta"
				disabled={!canStart || busy}
				onclick={() => act('start', [roomName])}>{startLabel}</button
			>{/if}
	</div>
</div>

<style>
	.lobby {
		display: grid;
		justify-items: center;
		gap: 0.7rem;
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 1.2rem;
		background: rgb(8 12 10 / 72%);
		padding: 1rem 1.2rem;
		text-align: center;
		backdrop-filter: blur(6px);
		box-shadow: 0 1rem 2rem rgb(0 0 0 / 45%);
	}
	.seats-list,
	.cast,
	.row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 8%);
		padding: 0.35rem 0.75rem;
		font-size: 0.8rem;
		font-weight: 700;
	}
	.chip em {
		color: rgb(248 242 229 / 60%);
		font-size: 0.7rem;
		font-style: normal;
		font-weight: 600;
	}
	.chip.empty {
		border: 1px dashed rgb(255 255 255 / 30%);
		background: transparent;
		color: rgb(248 242 229 / 60%);
	}
	.x {
		color: rgb(248 242 229 / 60%);
		cursor: pointer;
	}
	.who-btn {
		display: grid;
		justify-items: center;
		gap: 0.2rem;
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 6%);
		padding: 0.4rem;
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}
	.who-btn:hover {
		background: rgb(255 255 255 / 12%);
	}
	.ghost {
		border: 1px solid rgb(255 255 255 / 16%);
		border-radius: 999px;
		background: rgb(255 255 255 / 5%);
		padding: 0.55rem 1rem;
		font-size: 0.82rem;
		font-weight: 700;
		cursor: pointer;
	}
	.ghost:hover {
		background: rgb(255 255 255 / 12%);
	}
	.cta {
		border-radius: 999px;
		background: #f2dc91;
		padding: 0.6rem 1.4rem;
		color: #211c2e;
		font-weight: 800;
		cursor: pointer;
		transition: translate 0.2s;
	}
	.cta:hover:not(:disabled) {
		translate: 0 -2px;
	}
	.cta:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.lobby :global(h2) {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 800;
	}
	.lobby :global(.fine) {
		color: rgb(248 242 229 / 80%);
		font-size: 0.82rem;
	}
</style>
