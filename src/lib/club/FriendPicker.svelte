<script lang="ts">
	import { onMount } from 'svelte';
	import { Check } from '@lucide/svelte';
	import CharacterAvatar from './CharacterAvatar.svelte';
	import { club } from './club.svelte.js';
	import { socket } from '#lib/stores/socket-store.svelte.js';

	/**
	 * Your club friends as tappable avatars, online first. Inviting is choosing people you
	 * already know; the server looks up their emails, so none pass through the browser.
	 */
	let {
		selected = $bindable([]),
		exclude = []
	}: {
		selected?: string[];
		/** Member IDs not to offer, e.g. friends already at this table. */
		exclude?: string[];
	} = $props();

	type Friend = { memberId: string; nickname: string; characterId: string };
	let members = $state<Friend[]>([]);
	let online = $state<string[]>([]);
	let atTable = $state<string[]>([]);
	let loaded = $state(false);
	let error = $state('');

	const friends = $derived(
		members
			.filter((m) => m.memberId !== club.member?.memberId && !exclude.includes(m.memberId))
			.sort(
				(a, b) =>
					Number(online.includes(b.memberId)) - Number(online.includes(a.memberId)) ||
					a.nickname.localeCompare(b.nickname)
			)
	);

	onMount(async () => {
		try {
			const response = await socket.authorizedFetch('/club');
			const body = await response.json();
			if (!response.ok) throw new Error(body.error);
			members = body.members ?? [];
			online = body.online ?? [];
			atTable = (body.tables ?? []).flatMap(
				(table: { connectedMembers: string[] }) => table.connectedMembers
			);
		} catch (failure) {
			error =
				failure instanceof Error && failure.message
					? failure.message
					: 'Can’t load your friends right now.';
		} finally {
			loaded = true;
		}
	});

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
	}
</script>

<div class="friends" role="group" aria-label="Invite friends">
	{#if !loaded}
		<p class="note">Loading your friends…</p>
	{:else if error}
		<p class="note">{error}</p>
	{:else if !friends.length}
		<p class="note">No other friends in the club yet. Ask the club owner to add them.</p>
	{:else}
		{#each friends as friend (friend.memberId)}
			{@const on = selected.includes(friend.memberId)}
			{@const status = atTable.includes(friend.memberId)
				? 'at a table'
				: online.includes(friend.memberId)
					? 'online'
					: ''}
			<button
				type="button"
				class="friend"
				class:on
				aria-pressed={on}
				onclick={() => toggle(friend.memberId)}
			>
				<span class="avatar">
					<CharacterAvatar characterId={friend.characterId} size={34} />
					{#if status === 'online'}<span class="dot" title="Online"></span>{/if}
					{#if on}<span class="tick"><Check size={12} strokeWidth={3} /></span>{/if}
				</span>
				<span class="who">
					<strong>{friend.nickname}</strong>
					{#if status}<small>{status}</small>{/if}
				</span>
			</button>
		{/each}
	{/if}
</div>

<style>
	.friends {
		display: flex;
		max-height: 13rem;
		flex-wrap: wrap;
		gap: 0.45rem;
		overflow-y: auto;
	}
	.note {
		color: #b6c6b8;
		font-size: 0.75rem;
	}
	.friend {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid rgb(226 184 98 / 22%);
		border-radius: 999px;
		background: rgb(6 12 10 / 35%);
		padding: 0.25rem 0.8rem 0.25rem 0.25rem;
		color: #f1ebdc;
		cursor: pointer;
		transition:
			border-color 150ms ease,
			background 150ms ease;
	}
	.friend:hover {
		border-color: rgb(226 184 98 / 50%);
	}
	.friend.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 16%);
	}
	.avatar {
		position: relative;
		display: grid;
	}
	.dot {
		position: absolute;
		right: -1px;
		bottom: -1px;
		width: 0.65rem;
		height: 0.65rem;
		border: 2px solid #14271f;
		border-radius: 999px;
		background: #5fd38a;
	}
	.tick {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: rgb(244 214 140 / 85%);
		color: #24180a;
	}
	.who {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.15;
	}
	.who strong {
		font-size: 0.82rem;
		font-weight: 650;
	}
	.who small {
		color: #8fd6a5;
		font-size: 0.65rem;
	}
</style>
