<script lang="ts">
	import { HandCoins, X } from '@lucide/svelte';
	import { money } from './format.js';

	/**
	 * Low on chips (under 10% of the buy-in): ask one friend at the table to send some.
	 * The friend gets a prompt and can give or decline; nothing moves until they give.
	 */
	let {
		room,
		selfId,
		connected,
		onask,
		oncancel
	}: {
		room: RoomData;
		selfId: string;
		connected: boolean;
		onask: (to: string, amount: number) => void;
		oncancel: () => void;
	} = $props();

	let open = $state(false);
	let to = $state('');
	let amount = $state(0);

	const amounts = $derived(room.chipRequestAmounts ?? []);
	const friends = $derived(
		room.usersList.filter((user) => user.id !== selfId && !user.bot && !user.hasLeft)
	);
	const pending = $derived(room.chipRequests?.find((request) => request.from === selfId));
	const nameOf = (id: string) =>
		room.usersList.find((user) => user.id === id)?.username ?? 'friend';

	$effect(() => {
		if (!friends.some((friend) => friend.id === to)) to = friends[0]?.id ?? '';
		if (!amounts.includes(amount)) amount = amounts[1] ?? amounts[0] ?? 0;
	});

	function send() {
		if (!to || !amount) return;
		onask(to, amount);
		open = false;
	}
</script>

{#if pending}
	<div class="chip-ask sent" role="status">
		<HandCoins size={16} />
		<span>Asked <strong>{nameOf(pending.to)}</strong> for {money(pending.amount)}</span>
		<button type="button" class="link" onclick={oncancel} disabled={!connected}>Cancel</button>
	</div>
{:else if amounts.length}
	{#if !friends.length}
		<p class="chip-ask hint">Low on chips. Invite a friend to ask them for more.</p>
	{:else if !open}
		<button type="button" class="chip-ask trigger" onclick={() => (open = true)}>
			<HandCoins size={16} />
			<span>Low on chips? <strong>Ask a friend</strong></span>
		</button>
	{:else}
		<div class="chip-ask panel">
			<div class="panel-head">
				<strong>Ask a friend for chips</strong>
				<button type="button" class="close" onclick={() => (open = false)} aria-label="Close">
					<X size={14} />
				</button>
			</div>
			<div class="pills" role="radiogroup" aria-label="Ask who">
				{#each friends as friend (friend.id)}
					<button
						type="button"
						role="radio"
						aria-checked={to === friend.id}
						class:on={to === friend.id}
						onclick={() => (to = friend.id)}>{friend.username}</button
					>
				{/each}
			</div>
			<div class="pills" role="radiogroup" aria-label="How much">
				{#each amounts as value (value)}
					<button
						type="button"
						role="radio"
						aria-checked={amount === value}
						class:on={amount === value}
						onclick={() => (amount = value)}>{money(value)}</button
					>
				{/each}
			</div>
			<button type="button" class="send" onclick={send} disabled={!connected || !to}>
				Ask {nameOf(to)} for {money(amount)}
			</button>
		</div>
	{/if}
{/if}

<style>
	.chip-ask {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.75rem;
		font-size: 0.8rem;
	}
	.trigger,
	.sent {
		border: 1px dashed rgb(240 200 110 / 45%);
		background: rgb(240 200 110 / 7%);
		padding: 0.45rem 0.7rem;
		color: #f4d68c;
	}
	.trigger {
		cursor: pointer;
	}
	.trigger:hover {
		background: rgb(240 200 110 / 14%);
	}
	.sent {
		border-style: solid;
	}
	.sent span {
		flex: 1;
		min-width: 0;
	}
	.hint {
		color: rgb(241 235 220 / 60%);
	}
	.link {
		color: #f4d68c;
		text-decoration: underline;
		cursor: pointer;
	}
	/* Floats above the dock so opening it never pushes the table around. */
	.panel {
		position: absolute;
		right: 0.5rem;
		bottom: calc(100% + 0.5rem);
		z-index: 20;
		width: min(22rem, calc(100vw - 1.5rem));
		flex-direction: column;
		align-items: stretch;
		border: 1px solid rgb(240 200 110 / 45%);
		background: rgb(10 18 15 / 97%);
		padding: 0.7rem 0.8rem;
		box-shadow: 0 1rem 2.5rem rgb(0 0 0 / 60%);
	}
	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		color: #f4d68c;
	}
	.close {
		display: grid;
		place-items: center;
		width: 1.4rem;
		height: 1.4rem;
		border-radius: 999px;
		color: rgb(241 235 220 / 70%);
		cursor: pointer;
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.pills button {
		border: 1px solid rgb(240 200 110 / 25%);
		border-radius: 999px;
		padding: 0.25rem 0.65rem;
		color: #f1ebdc;
		cursor: pointer;
	}
	.pills button.on {
		border-color: #f4d68c;
		background: rgb(240 200 110 / 18%);
		color: #f4d68c;
	}
	.send {
		border-radius: 0.6rem;
		background: #f4d68c;
		padding: 0.5rem;
		color: #24180a;
		font-weight: 700;
		cursor: pointer;
	}
	.send:disabled {
		opacity: 0.6;
		cursor: default;
	}
</style>
