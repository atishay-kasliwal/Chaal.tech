<script lang="ts">
	import { ChevronLeft, ChevronRight, X, Shuffle, Eraser, Info } from '@lucide/svelte';
	import { VARIANT_CATALOG } from '#lib/variant-catalog.js';
	import {
		MYSTERY,
		LINEUP_HANDS,
		GAME_FAMILIES,
		familyOf,
		handsLabel,
		slotName,
		slotHint
	} from './lineup.js';

	/**
	 * Tonight's lineup. Owners build it like a playlist: tap games in the order you want them,
	 * nudge a slot with the arrows, add a Mystery slot, choose how many hands each game gets.
	 * Everyone else sees the night's progress; tapping a game explains it.
	 */
	let {
		lineup,
		hands = 1,
		at,
		current = '',
		editable = false,
		saving = false,
		onsave,
		oninfo
	}: {
		lineup: string[];
		hands?: number;
		/** Where the night is: the slot playing and how many hands it has had. */
		at?: { index: number; rulesVersion: string; played: number };
		/** The game being played right now. */
		current?: string;
		editable?: boolean;
		saving?: boolean;
		onsave?: (lineup: string[], hands: number) => void;
		/** Show how a game is played. */
		oninfo?: (version: string) => void;
	} = $props();

	let draft = $state<string[]>([]);
	let draftHands = $state(1);
	let synced = $state('');
	// Follow the saved lineup until the owner starts editing.
	$effect(() => {
		const saved = JSON.stringify([lineup, hands]);
		if (saved !== synced) {
			synced = saved;
			draft = [...lineup];
			draftHands = hands;
		}
	});
	const changed = $derived(JSON.stringify([draft, draftHands]) !== synced);
	/** The slot picked in the queue, to nudge or remove. */
	let selected = $state<number | null>(null);
	let family = $state<string>('all');

	const playingIndex = $derived(
		at &&
			lineup[at.index] !== undefined &&
			(at.rulesVersion === current || lineup[at.index] === MYSTERY)
			? at.index
			: lineup.indexOf(current)
	);
	const perGame = $derived(hands === 0 ? null : hands);
	const shown = $derived(
		VARIANT_CATALOG.filter(
			(variant) => family === 'all' || familyOf(variant.rulesVersion) === family
		)
	);
	/** Positions (1-based) of a game in the queue, for its badge. */
	const positions = (version: string) =>
		draft.flatMap((slot, index) => (slot === version ? [index + 1] : []));

	function toggle(version: string) {
		const where = draft.lastIndexOf(version);
		if (where >= 0 && version !== MYSTERY) {
			draft = draft.filter((_, index) => index !== where);
			selected = null;
		} else if (draft.length < 30) draft = [...draft, version];
	}
	function move(index: number, by: number) {
		const to = index + by;
		if (to < 0 || to >= draft.length) return;
		const next = [...draft];
		[next[index], next[to]] = [next[to], next[index]];
		draft = next;
		selected = to;
	}
	function remove(index: number) {
		draft = draft.filter((_, i) => i !== index);
		selected = null;
	}
	function shuffle() {
		const next = [...draft];
		for (let i = next.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[next[i], next[j]] = [next[j], next[i]];
		}
		draft = next;
		selected = null;
	}
</script>

<div class="lineup" class:editable>
	<!-- The night, in order. -->
	<ol class="queue" aria-label="Tonight’s lineup in play order">
		{#each editable ? draft : lineup as slot, index (`${slot}-${index}`)}
			{@const done = !editable && playingIndex >= 0 && index < playingIndex}
			{@const now = !editable && index === playingIndex}
			<li>
				<button
					class="chip"
					class:mystery={slot === MYSTERY}
					class:done
					class:now
					class:selected={editable && selected === index}
					onclick={() =>
						editable
							? (selected = selected === index ? null : index)
							: slot !== MYSTERY && oninfo?.(slot)}
					aria-pressed={editable ? selected === index : undefined}
				>
					<span class="pos">{done ? '✓' : now ? '▶' : index + 1}</span>
					{slot === MYSTERY ? '🎲 ' : ''}{slotName(slot)}
					{#if now && at && perGame}<small>{Math.min(at.played, perGame)}/{perGame}</small>{/if}
				</button>
				{#if editable && selected === index}
					<span class="nudge">
						<button onclick={() => move(index, -1)} disabled={index === 0} aria-label="Earlier"
							><ChevronLeft size={14} /></button
						>
						<button
							onclick={() => move(index, 1)}
							disabled={index === draft.length - 1}
							aria-label="Later"><ChevronRight size={14} /></button
						>
						<button onclick={() => remove(index)} aria-label="Remove"><X size={14} /></button>
					</span>
				{/if}
			</li>
		{:else}
			<li class="empty">
				{editable
					? 'Tap games below in the order you want to play them.'
					: 'No lineup tonight: any game can come up.'}
			</li>
		{/each}
	</ol>

	{#if !editable}
		{#if lineup.length}
			<p class="pace">
				Each game: <strong>{handsLabel(hands)}</strong>{#if oninfo}<span
						>· tap a game for its rules</span
					>{/if}
			</p>
		{/if}
	{:else}
		<div class="controls">
			<div class="hands" role="radiogroup" aria-label="Hands per game">
				{#each LINEUP_HANDS as value (value)}
					<button
						role="radio"
						aria-checked={draftHands === value}
						class:on={draftHands === value}
						onclick={() => (draftHands = value)}>{value === 0 ? 'Round' : value}</button
					>
				{/each}
				<span class="hands-label">{handsLabel(draftHands)} each</span>
			</div>
			<span class="tools">
				<button onclick={shuffle} disabled={draft.length < 2}><Shuffle size={14} /> Shuffle</button>
				<button onclick={() => ((draft = []), (selected = null))} disabled={!draft.length}
					><Eraser size={14} /> Clear</button
				>
			</span>
		</div>

		<div class="families" role="tablist" aria-label="Game families">
			{#each [{ id: 'all', label: 'All' }, ...GAME_FAMILIES] as item (item.id)}
				<button
					role="tab"
					aria-selected={family === item.id}
					class:on={family === item.id}
					onclick={() => (family = item.id)}>{item.label}</button
				>
			{/each}
		</div>

		<div class="tiles">
			<button class="tile mystery" onclick={() => toggle(MYSTERY)}>
				{#if positions(MYSTERY).length}<span class="badges"
						>{#each positions(MYSTERY) as n (n)}<i>{n}</i>{/each}</span
					>{/if}
				<strong>🎲 Mystery</strong>
				<small>A surprise game when its turn comes</small>
			</button>
			{#each shown as variant (variant.rulesVersion)}
				{@const at = positions(variant.rulesVersion)}
				<button
					class="tile fam-{familyOf(variant.rulesVersion)}"
					class:picked={at.length > 0}
					onclick={() => toggle(variant.rulesVersion)}
				>
					{#if at.length}<span class="badges"
							>{#each at as n (n)}<i>{n}</i>{/each}</span
						>{/if}
					<strong>{slotName(variant.rulesVersion)}</strong>
					<small>{slotHint(variant.rulesVersion)}</small>
					{#if oninfo}<span
							class="info"
							role="button"
							tabindex="0"
							aria-label="How {slotName(variant.rulesVersion)} works"
							onclick={(event) => {
								event.stopPropagation();
								oninfo(variant.rulesVersion);
							}}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.stopPropagation();
									oninfo(variant.rulesVersion);
								}
							}}><Info size={13} /></span
						>{/if}
				</button>
			{/each}
		</div>

		<div class="save-bar">
			<span>{draft.length} game{draft.length === 1 ? '' : 's'} · {handsLabel(draftHands)} each</span
			>
			<button class="save" disabled={!changed || saving} onclick={() => onsave?.(draft, draftHands)}
				>{saving ? 'Saving…' : 'Save lineup'}</button
			>
		</div>
	{/if}
</div>

<style>
	.lineup {
		display: grid;
		gap: 0.9rem;
		color: #f8f2e5;
	}
	.queue {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.queue li {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
	}
	.queue .empty {
		color: rgb(248 242 229 / 60%);
		font-size: 0.9rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		border: 1px solid rgb(242 220 145 / 28%);
		border-radius: 999px;
		background: rgb(255 255 255 / 4%);
		padding: 0.3rem 0.75rem 0.3rem 0.35rem;
		color: #f8f2e5;
		font-size: 0.88rem;
		font-weight: 650;
		cursor: pointer;
		transition:
			background 160ms,
			border-color 160ms;
	}
	.chip .pos {
		display: grid;
		min-width: 1.4rem;
		height: 1.4rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(242 220 145 / 18%);
		color: #f2dc91;
		font-size: 0.75rem;
		font-weight: 800;
	}
	.chip small {
		color: #f2dc91;
		font-weight: 800;
	}
	.chip.done {
		opacity: 0.55;
	}
	.chip.now {
		border-color: #f2dc91;
		background: rgb(242 220 145 / 14%);
		box-shadow: 0 0 14px rgb(242 220 145 / 25%);
	}
	.chip.now .pos {
		background: #f2dc91;
		color: #211c2e;
	}
	.chip.selected {
		border-color: #f2dc91;
		background: rgb(242 220 145 / 16%);
	}
	.chip.mystery .pos {
		background: rgb(196 155 255 / 22%);
		color: #d9c2ff;
	}
	.nudge {
		display: inline-flex;
		gap: 0.15rem;
	}
	.nudge button {
		display: grid;
		width: 1.6rem;
		height: 1.6rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(255 255 255 / 8%);
		color: #f8f2e5;
	}
	.nudge button:disabled {
		opacity: 0.3;
	}
	.pace {
		color: rgb(248 242 229 / 70%);
		font-size: 0.85rem;
	}
	.pace strong {
		color: #f2dc91;
	}
	.pace span {
		margin-left: 0.3rem;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		border-top: 1px solid rgb(255 255 255 / 7%);
		padding-top: 0.8rem;
	}
	.hands {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
	}
	.hands button,
	.families button {
		border: 1px solid rgb(242 220 145 / 25%);
		border-radius: 999px;
		padding: 0.25rem 0.7rem;
		color: rgb(248 242 229 / 80%);
		font-size: 0.82rem;
		font-weight: 700;
	}
	.hands button.on,
	.families button.on {
		border-color: #f2dc91;
		background: #f2dc91;
		color: #211c2e;
	}
	.hands-label {
		margin-left: 0.3rem;
		color: rgb(248 242 229 / 60%);
		font-size: 0.8rem;
	}
	.tools {
		display: inline-flex;
		gap: 0.4rem;
	}
	.tools button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 6%);
		padding: 0.3rem 0.7rem;
		color: #f8f2e5;
		font-size: 0.8rem;
		font-weight: 700;
	}
	.tools button:disabled {
		opacity: 0.35;
	}
	.families {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 0.55rem;
	}
	.tile {
		position: relative;
		display: grid;
		gap: 0.2rem;
		align-content: start;
		min-height: 4.6rem;
		border: 1px solid rgb(255 255 255 / 9%);
		border-radius: 0.9rem;
		background: linear-gradient(180deg, rgb(255 255 255 / 5%), transparent), rgb(12 22 17 / 80%);
		padding: 0.65rem 0.75rem;
		text-align: left;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}
	.tile:hover {
		transform: translateY(-2px);
		border-color: rgb(242 220 145 / 40%);
	}
	.tile:active {
		transform: scale(0.97);
	}
	.tile strong {
		color: #f8f2e5;
		font-size: 0.92rem;
	}
	.tile small {
		color: rgb(248 242 229 / 60%);
		font-size: 0.75rem;
		line-height: 1.3;
	}
	.tile::before {
		position: absolute;
		top: 0.65rem;
		bottom: 0.65rem;
		left: 0;
		width: 3px;
		border-radius: 0 3px 3px 0;
		background: var(--fam, #f2dc91);
		content: '';
	}
	.fam-classic {
		--fam: #f2dc91;
	}
	.fam-jokers {
		--fam: #ff9f7a;
	}
	.fam-four {
		--fam: #7cc4ff;
	}
	.fam-table {
		--fam: #7be0a6;
	}
	.tile.mystery {
		--fam: #c49bff;
		background:
			radial-gradient(circle at 85% 20%, rgb(196 155 255 / 22%), transparent 60%),
			rgb(12 22 17 / 80%);
	}
	.tile.picked {
		border-color: #f2dc91;
		box-shadow:
			0 0 0 1px rgb(242 220 145 / 40%),
			0 6px 16px rgb(0 0 0 / 35%);
	}
	.badges {
		position: absolute;
		top: -0.45rem;
		right: -0.35rem;
		display: flex;
		gap: 0.15rem;
	}
	.badges i {
		display: grid;
		min-width: 1.35rem;
		height: 1.35rem;
		place-items: center;
		border-radius: 999px;
		background: #f2dc91;
		box-shadow: 0 2px 6px rgb(0 0 0 / 45%);
		color: #211c2e;
		font-size: 0.72rem;
		font-style: normal;
		font-weight: 850;
	}
	.info {
		position: absolute;
		right: 0.45rem;
		bottom: 0.4rem;
		display: grid;
		width: 1.4rem;
		height: 1.4rem;
		place-items: center;
		border-radius: 999px;
		color: rgb(248 242 229 / 55%);
	}
	.info:hover {
		background: rgb(255 255 255 / 8%);
		color: #f2dc91;
	}
	.save-bar {
		position: sticky;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.8rem;
		border-top: 1px solid rgb(255 255 255 / 8%);
		background: rgb(8 16 12 / 95%);
		padding: 0.7rem 0 0.2rem;
		color: rgb(248 242 229 / 70%);
		font-size: 0.85rem;
	}
	.save {
		border-radius: 999px;
		background: linear-gradient(180deg, #f2dc91, #e1ca89);
		padding: 0.5rem 1.3rem;
		color: #211c2e;
		font-weight: 800;
	}
	.save:disabled {
		opacity: 0.45;
	}

	.tile {
		background: var(--night);
	}
	.tile.mystery {
		background: #41334f;
	}
	@media (max-width: 600px) {
		.tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 8px;
		}
		.tile {
			min-width: 0;
			min-height: 88px;
			padding: 12px 10px;
		}
		.tile strong {
			font-size: 13px;
		}
		.tile small {
			font-size: 11px;
			line-height: 1.4;
		}
		.save-bar {
			position: sticky;
			bottom: 12px;
			z-index: 3;
			border: 1px solid var(--line);
			border-radius: 12px;
			background: var(--surface);
			padding: 12px;
			box-shadow: 0 8px 30px #0005;
		}
	}
</style>
