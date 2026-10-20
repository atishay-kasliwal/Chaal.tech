<script lang="ts">
	import { CHARACTERS } from './characters.js';
	import CharacterAvatar from './CharacterAvatar.svelte';

	let { value = $bindable() }: { value: string } = $props();
</script>

<div class="picker" role="radiogroup" aria-label="Character">
	{#each CHARACTERS as character (character.id)}
		<label class:on={value === character.id}>
			<input type="radio" name="character" value={character.id} bind:group={value} />
			<CharacterAvatar characterId={character.id} size={44} />
			<span>{character.name}</span>
		</label>
	{/each}
</div>

<style>
	.picker {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		width: 100%;
		gap: 0.5rem;
	}
	label {
		display: grid;
		justify-items: center;
		gap: 0.3rem;
		border: 1px solid transparent;
		border-radius: 0.9rem;
		padding: 0.5rem 0.25rem;
		color: rgb(248 242 229 / 80%);
		font-size: 0.8rem;
		cursor: pointer;
	}
	label.on {
		border-color: #f2dc91;
		background: rgb(242 220 145 / 10%);
	}
	label:has(input:focus-visible) {
		outline: 2px solid #f2dc91;
	}
	input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
</style>
