<script lang="ts">
	import { characterFor } from './characters.js';

	let {
		characterId,
		size = 48,
		label = '',
		status
	}: {
		characterId?: string;
		size?: number;
		label?: string;
		status?: 'online' | 'table';
	} = $props();
	const character = $derived(characterFor(characterId));
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
	<span class="glyph">{character.glyph}</span>
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
			0 0 0 2px rgb(240 209 140 / 35%),
			0 0.4rem 1rem rgb(0 0 0 / 35%);
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
		border: 2px solid #101a16;
		border-radius: 999px;
	}
	.dot.online {
		background: #4ade80;
	}
	.dot.table {
		background: #f0d18c;
	}
</style>
