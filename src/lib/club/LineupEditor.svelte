<script lang="ts">
	import { GripVertical, ChevronUp, ChevronDown, X, Plus } from '@lucide/svelte';
	import { VARIANT_CATALOG, VARIANT_BY_VERSION, type RulesVersion } from '#lib/variant-catalog.js';

	/**
	 * Tonight's lineup: the games in play order. Owners drag to reorder (or use the arrows on a
	 * phone), remove with ×, add from the list, then save. Everyone else sees it read-only.
	 */
	let {
		lineup,
		current = '',
		editable = false,
		saving = false,
		onsave
	}: {
		lineup: string[];
		/** The game being played right now, highlighted. */
		current?: string;
		editable?: boolean;
		saving?: boolean;
		onsave?: (lineup: string[]) => void;
	} = $props();

	let draft = $state<string[]>([]);
	let synced = $state('');
	// Follow the saved lineup until the owner starts editing.
	$effect(() => {
		const saved = JSON.stringify(lineup);
		if (saved !== synced) {
			synced = saved;
			draft = [...lineup];
		}
	});
	const changed = $derived(JSON.stringify(draft) !== JSON.stringify(lineup));
	const nameOf = (version: string) =>
		VARIANT_BY_VERSION[version as RulesVersion]?.selectionLabel.split(' — ')[0] ?? version;
	const hintOf = (version: string) =>
		VARIANT_BY_VERSION[version as RulesVersion]?.selectionLabel.split(' — ')[1] ?? '';
	const at = $derived(draft.indexOf(current));
	const nextIndex = $derived(draft.length ? (at + 1) % draft.length : -1);

	function move(from: number, to: number) {
		if (to < 0 || to >= draft.length || from === to) return;
		const next = [...draft];
		const [item] = next.splice(from, 1);
		next.splice(to, 0, item);
		draft = next;
	}
	const remove = (index: number) => (draft = draft.filter((_, i) => i !== index));
	let adding = $state('');
	function add() {
		if (!adding) return;
		draft = [...draft, adding];
		adding = '';
	}

	// Drag and drop between rows.
	let dragging = $state<number | null>(null);
	let over = $state<number | null>(null);
</script>

<div class="lineup">
	{#if !draft.length}
		<p class="empty">
			{editable
				? 'No lineup yet: every game is open. Add games below to set the order for tonight.'
				: 'No lineup tonight: any game can be picked.'}
		</p>
	{:else}
		<ol>
			{#each draft as version, index (index + version)}
				<li
					class:now={index === at}
					class:next={index === nextIndex && index !== at}
					class:dragging={dragging === index}
					class:over={over === index && dragging !== index}
					draggable={editable}
					ondragstart={(event) => {
						dragging = index;
						event.dataTransfer?.setData('text/plain', String(index));
					}}
					ondragover={(event) => {
						if (dragging === null) return;
						event.preventDefault();
						over = index;
					}}
					ondrop={(event) => {
						event.preventDefault();
						if (dragging !== null) move(dragging, index);
						dragging = over = null;
					}}
					ondragend={() => (dragging = over = null)}
				>
					{#if editable}<span class="grip" aria-hidden="true"><GripVertical size={16} /></span>{/if}
					<span class="num">{index + 1}</span>
					<span class="game">
						<strong>{nameOf(version)}</strong>
						{#if hintOf(version)}<small>{hintOf(version)}</small>{/if}
					</span>
					{#if index === at}<span class="tag now-tag">Now</span>{:else if index === nextIndex}<span
							class="tag">Next</span
						>{/if}
					{#if editable}
						<span class="row-tools">
							<button
								type="button"
								aria-label="Move {nameOf(version)} up"
								disabled={index === 0}
								onclick={() => move(index, index - 1)}><ChevronUp size={15} /></button
							>
							<button
								type="button"
								aria-label="Move {nameOf(version)} down"
								disabled={index === draft.length - 1}
								onclick={() => move(index, index + 1)}><ChevronDown size={15} /></button
							>
							<button
								type="button"
								aria-label="Remove {nameOf(version)}"
								onclick={() => remove(index)}><X size={15} /></button
							>
						</span>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}

	{#if editable}
		<div class="add">
			<select bind:value={adding} aria-label="Add a game">
				<option value="">Add a game…</option>
				{#each VARIANT_CATALOG as option (option.rulesVersion)}
					<option value={option.rulesVersion}>{option.selectionLabel}</option>
				{/each}
			</select>
			<button type="button" class="add-btn" disabled={!adding} onclick={add}
				><Plus size={15} /> Add</button
			>
		</div>
		<div class="save-row">
			{#if changed}
				<button type="button" class="ghost" onclick={() => (draft = [...lineup])}
					>Undo changes</button
				>
			{/if}
			<button
				type="button"
				class="save"
				disabled={!changed || saving}
				onclick={() => onsave?.([...draft])}
				>{saving ? 'Saving…' : changed ? 'Save lineup' : 'Saved'}</button
			>
		</div>
		<p class="note">
			Drag to reorder. Whoever picks the next game can still choose something else.
		</p>
	{:else}
		<p class="note">Set by the club owner. Whoever picks the next game can still choose another.</p>
	{/if}
</div>

<style>
	.lineup {
		display: grid;
		/* minmax(0, …): long game names in the add list must not widen the drawer. */
		grid-template-columns: minmax(0, 1fr);
		gap: 0.7rem;
		color: #f1ebdc;
	}
	.empty,
	.note {
		color: rgb(241 235 220 / 60%);
		font-size: 0.82rem;
	}
	ol {
		display: grid;
		gap: 0.4rem;
	}
	li {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		border: 1px solid rgb(240 209 140 / 14%);
		border-radius: 0.85rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.55rem 0.6rem;
		transition:
			border-color 120ms ease,
			background 120ms ease,
			opacity 120ms ease;
	}
	li[draggable='true'] {
		cursor: grab;
	}
	li.dragging {
		opacity: 0.4;
	}
	li.over {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 12%);
	}
	li.now {
		border-color: rgb(244 214 140 / 55%);
		background: linear-gradient(100deg, rgb(244 214 140 / 16%), rgb(244 214 140 / 4%));
	}
	.grip {
		color: rgb(241 235 220 / 35%);
	}
	.num {
		display: grid;
		width: 1.5rem;
		height: 1.5rem;
		flex-shrink: 0;
		place-items: center;
		border-radius: 999px;
		background: rgb(255 255 255 / 7%);
		font-size: 0.72rem;
		font-weight: 750;
	}
	li.now .num {
		background: #f4d68c;
		color: #24180a;
	}
	.game {
		display: grid;
		min-width: 0;
		flex: 1;
		line-height: 1.2;
	}
	.game strong {
		font-size: 0.9rem;
	}
	.game small {
		overflow: hidden;
		color: rgb(241 235 220 / 50%);
		font-size: 0.72rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.tag {
		border-radius: 999px;
		background: rgb(255 255 255 / 8%);
		padding: 0.05rem 0.5rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.68rem;
		font-weight: 700;
	}
	.now-tag {
		background: rgb(244 214 140 / 20%);
		color: #f4d68c;
	}
	.row-tools {
		display: flex;
		gap: 0.1rem;
	}
	.row-tools button {
		display: grid;
		width: 1.7rem;
		height: 1.7rem;
		place-items: center;
		border-radius: 999px;
		color: rgb(241 235 220 / 65%);
		cursor: pointer;
	}
	.row-tools button:hover:not(:disabled) {
		background: rgb(255 255 255 / 8%);
		color: #f4d68c;
	}
	.row-tools button:disabled {
		opacity: 0.25;
		cursor: default;
	}
	.add {
		display: flex;
		gap: 0.4rem;
	}
	.add select {
		width: 100%;
		min-width: 0;
		flex: 1;
		border: 1px solid rgb(240 209 140 / 25%);
		border-radius: 0.7rem;
		background: rgb(0 0 0 / 30%);
		padding: 0.5rem;
		color: #f1ebdc;
		font-size: 0.85rem;
	}
	.add-btn,
	.ghost {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border: 1px solid rgb(240 209 140 / 30%);
		border-radius: 0.7rem;
		padding: 0.45rem 0.8rem;
		color: #f4d68c;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.add-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.save-row {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}
	.save {
		border-radius: 999px;
		background: linear-gradient(#f0d18c, #c9963d);
		padding: 0.55rem 1.2rem;
		color: #1c1406;
		font-weight: 750;
		cursor: pointer;
	}
	.save:disabled {
		background: rgb(255 255 255 / 10%);
		color: rgb(241 235 220 / 55%);
		cursor: default;
	}
</style>
