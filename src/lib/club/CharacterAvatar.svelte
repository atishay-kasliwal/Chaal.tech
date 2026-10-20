<script lang="ts">
	import { club } from './club.svelte.js';
	import { characterFor } from './characters.js';

	let {
		characterId,
		photoDataUrl,
		memberId,
		playerId,
		size = 48,
		label = '',
		status
	}: {
		characterId?: string;
		photoDataUrl?: string | null;
		memberId?: string;
		playerId?: string;
		size?: number;
		label?: string;
		status?: 'online' | 'table';
	} = $props();
	const member = $derived(
		club.member &&
			((memberId && club.member.memberId === memberId) ||
				(playerId && club.member.playerId === playerId))
			? club.member
			: club.members.find(
					(m) => (memberId && m.memberId === memberId) || (playerId && m.playerId === playerId)
				)
	);
	const photo = $derived(photoDataUrl === undefined ? member?.photoDataUrl : photoDataUrl);
	let failedPhoto = $state('');
	const character = $derived(characterFor(characterId ?? member?.characterId));
</script>

<span
	class="avatar-ring"
	style:--size="{size}px"
	style:--from={character.from}
	style:--to={character.to}
	role={label ? 'img' : undefined}
	aria-label={label || undefined}
	aria-hidden={label ? undefined : 'true'}
>
	{#if photo?.startsWith('data:image/jpeg;base64,') && photo !== failedPhoto}
		<img class="photo" src={photo} alt="" onerror={() => (failedPhoto = photo ?? '')} />
	{:else}<span class="glyph">{character.glyph}</span>{/if}
	{#if status}<span class="dot {status}" title={status === 'table' ? 'At a table' : 'Online'}
		></span>{/if}
</span>

<style>
	.avatar-ring {
		position: relative;
		display: inline-grid;
		flex: none;
		width: var(--size);
		height: var(--size);
		place-items: center;
		border-radius: 999px;
		background: radial-gradient(circle at 35% 30%, var(--from), var(--to) 75%);
		box-shadow:
			0 0 0 2px rgb(242 220 145 / 35%),
			0 0.4rem 1rem rgb(0 0 0 / 35%);
	}
	.photo {
		width: 100%;
		height: 100%;
		object-fit: cover;
		border-radius: inherit;
	}
	.glyph {
		font-size: calc(var(--size) * 0.55);
		line-height: 1;
	}
	.dot {
		position: absolute;
		right: 2%;
		bottom: 2%;
		width: max(9px, calc(var(--size) * 0.22));
		height: max(9px, calc(var(--size) * 0.22));
		border: 2px solid #2c263b;
		border-radius: 999px;
	}
	.dot.online {
		background: #4ade80;
	}
	.dot.table {
		background: #f2dc91;
	}
</style>
