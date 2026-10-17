<script lang="ts" module>
	export interface MatCard {
		card?: { rank: number; suit: string };
		open?: boolean;
		wild?: boolean;
		dim?: boolean;
		/** Lifted with a gold ring: part of the line being picked. */
		picked?: boolean;
		/** Closed card the player may tap to open. */
		tappable?: boolean;
		/** Red ring: the killer card. */
		killer?: boolean;
		/** Small tag under the card, e.g. the pot amount that opens it. */
		tag?: string;
		tagTone?: 'done' | 'danger' | '';
	}
	export interface MatLine {
		/** Row and column of the two end cards in a 3×3 grid. */
		from: [number, number];
		to: [number, number];
		color: string;
		faint?: boolean;
	}
	export interface MatPile {
		top: { rank: number; suit: string };
		label: string;
		live?: boolean;
		sold?: boolean;
	}
	export interface JokerTray {
		title: string;
		/** Joker ranks in words, e.g. "6 · 8". */
		ranks?: string;
		cards?: { rank: number; suit: string }[];
		/** The jokers they replaced, shown small and faded. */
		before?: { rank: number; suit: string }[];
		note?: string;
		danger?: string;
		/** Rules shown as tiles, e.g. the three ways to make a joker. */
		rules?: { icon: string; name: string; text: string }[];
	}
</script>

<script lang="ts">
	import TpCard from './TpCard.svelte';

	let {
		layout,
		cards = [],
		lines = [],
		piles = [],
		caption = '',
		prompt = '',
		promptTone = '',
		progress,
		tray,
		actions = [],
		onCardClick,
		onLineClick
	}: {
		layout: 'grid' | 'row' | 'piles' | 'none';
		cards?: MatCard[];
		lines?: MatLine[];
		piles?: MatPile[];
		caption?: string;
		prompt?: string;
		promptTone?: 'danger' | '';
		progress?: { label: string; value: number };
		tray?: JokerTray;
		actions?: { label: string; primary?: boolean; onclick?: () => void }[];
		/** Tap a closed card that may be opened. */
		onCardClick?: (index: number) => void;
		/** Tap one of the grid's eight lines (Chatai). */
		onLineClick?: (line: number) => void;
	} = $props();
	// The eight lines of the grid, as end cells, for tapping (same order as the server).
	const GRID_LINES: [number, number, number, number][] = [
		[0, 0, 0, 2],
		[1, 0, 1, 2],
		[2, 0, 2, 2],
		[0, 0, 2, 0],
		[0, 1, 2, 1],
		[0, 2, 2, 2],
		[0, 0, 2, 2],
		[0, 2, 2, 0]
	];

	// Card centres in the grid's own units: cards are 7 wide and 10 tall with a gap of 1.
	const cx = (column: number) => column * 8 + 3.5;
	const cy = (row: number) => row * 11 + 5;
	/**
	 * Prompts may mark words bold with <b>…</b>. Split them into plain and bold text, so names
	 * inside a prompt are always shown as text and never read as markup.
	 */
	const segments = (text: string) =>
		text.split(/<b>(.*?)<\/b>/).map((part, index) => ({ text: part, bold: index % 2 === 1 }));
	// The tall grid leaves no room above it, so its prompt sits in the side column.
	const sidePrompt = $derived(layout === 'grid' || layout === 'none');
</script>

{#snippet rich(text: string)}
	{#each segments(text) as part, index (index)}{#if part.bold}<b>{part.text}</b
			>{:else}{part.text}{/if}{/each}
{/snippet}

<div class="table-cards">
	{#if prompt && !sidePrompt}
		<p class="prompt" class:danger={promptTone === 'danger'}>{@render rich(prompt)}</p>
	{/if}
	<div class="spread">
		{#if layout !== 'none'}
			<div class="mat" class:grid-mat={layout === 'grid'}>
				{#if layout === 'piles'}
					<div class="piles">
						{#each piles as pile, index (index)}
							<div class="pile" class:live={pile.live} class:sold={pile.sold}>
								<div class="pile-stack">
									<span class="edge two"></span>
									<span class="edge one"></span>
									<span class="top-card"><TpCard card={pile.top} faceUp wild /></span>
								</div>
								<span class="pile-tag">{pile.label}</span>
							</div>
						{/each}
					</div>
				{:else}
					<div class="cards {layout}">
						{#each cards as slot, index (index)}
							<div class="slot">
								{#if slot.tappable && onCardClick}
									<button
										class="lift tappable"
										onclick={() => onCardClick(index)}
										aria-label="Open mat card {index + 1}"
									>
										<TpCard card={slot.card} faceUp={slot.open} />
									</button>
								{:else}
									<span
										class="lift"
										class:picked={slot.picked}
										class:tappable={slot.tappable}
										class:killer={slot.killer}
									>
										<TpCard card={slot.card} faceUp={slot.open} wild={slot.wild} dim={slot.dim} />
									</span>
								{/if}
								{#if slot.tag}<span class="tag {slot.tagTone ?? ''}">{slot.tag}</span>{/if}
							</div>
						{/each}
						{#if layout === 'grid' && (lines.length || onLineClick)}
							<svg viewBox="0 0 23 32" preserveAspectRatio="none" aria-hidden="true">
								{#if onLineClick}
									{#each GRID_LINES as [r1, c1, r2, c2], line (line)}
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<line
											class="hit"
											x1={cx(c1)}
											y1={cy(r1)}
											x2={cx(c2)}
											y2={cy(r2)}
											onclick={() => onLineClick(line)}
										/>
									{/each}
								{/if}
								{#each lines as line, index (index)}
									<line
										x1={cx(line.from[1])}
										y1={cy(line.from[0])}
										x2={cx(line.to[1])}
										y2={cy(line.to[0])}
										stroke={line.color}
										stroke-width={line.faint ? 0.25 : 0.7}
										stroke-dasharray={line.faint ? '0.6 0.6' : ''}
										stroke-linecap="round"
										opacity={line.faint ? 0.35 : 0.95}
									/>
								{/each}
							</svg>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
		<div class="side" class:hero={layout === 'none'}>
			{#if prompt && sidePrompt}
				<p class="prompt" class:danger={promptTone === 'danger'}>{@render rich(prompt)}</p>
			{/if}
			{#if tray}
				<aside class="tray">
					<p class="tray-title">{tray.title}</p>
					{#if tray.cards}
						<div class="tray-cards">
							{#each tray.cards as card, index (index)}<TpCard {card} faceUp wild />{/each}
						</div>
					{/if}
					{#if tray.ranks}<p class="ranks">{tray.ranks}</p>{/if}
					{#if tray.before}
						<div class="before">
							{#each tray.before as card, index (index)}<TpCard {card} faceUp dim />{/each}
							<span>before</span>
						</div>
					{/if}
					{#if tray.rules}
						<div class="rules">
							{#each tray.rules as rule (rule.name)}
								<div class="rule">
									<span class="rule-icon">{rule.icon}</span>
									<strong>{rule.name}</strong>
									<small>{rule.text}</small>
								</div>
							{/each}
						</div>
					{/if}
					{#if tray.note}<p class="note">{tray.note}</p>{/if}
					{#if tray.danger}<p class="danger-note">{tray.danger}</p>{/if}
				</aside>
			{/if}
			{#if progress}
				<div class="pot-progress">
					<span>{progress.label}</span>
					<span class="meter"><i style:transform="scaleX({progress.value})"></i></span>
				</div>
			{/if}
			{#if caption}<p class="caption">{@render rich(caption)}</p>{/if}
			{#if actions.length}
				<div class="mat-actions">
					{#each actions as action (action.label)}
						<button class:primary={action.primary} onclick={action.onclick}>{action.label}</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.table-cards {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.55rem;
	}
	.spread {
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.side {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.6rem;
		max-width: 16rem;
	}
	/* No mat (the jokers or the rules are the whole show): the side column takes the centre. */
	.side.hero {
		max-width: min(30rem, 100%);
		gap: 0.9rem;
	}
	.side.hero .prompt {
		padding: 0.5rem 1.3rem;
		font-size: 1.05rem;
		white-space: nowrap;
	}
	.side.hero .tray {
		--card-h: clamp(4.6rem, 12vh, 8rem);
		gap: 0.7rem;
		padding: 1rem 1.4rem 1.1rem;
	}
	.side.hero .tray-title {
		font-size: 0.85rem;
	}
	.side.hero .tray-cards {
		gap: 0.7rem;
	}
	.side.hero .before {
		--card-h: clamp(2.8rem, 6vh, 3.8rem);
		gap: 0.4rem;
		font-size: 0.8rem;
	}
	.side.hero .mat-actions button {
		padding: 0.65rem 1.5rem;
		font-size: 1rem;
	}
	.rules {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
	}
	.rule {
		display: grid;
		justify-items: center;
		gap: 0.2rem;
		border: 1px solid rgb(244 214 140 / 22%);
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.6rem 0.5rem;
		text-align: center;
	}
	.rule-icon {
		font-size: 1.6rem;
		line-height: 1;
	}
	.rule strong {
		color: #f7dc95;
		font-size: 1.05rem;
	}
	.rule small {
		color: rgb(241 235 220 / 75%);
		font-size: 0.8rem;
		line-height: 1.3;
	}
	.side:empty {
		display: none;
	}
	/* A woven chatai laid on the cloth. */
	.mat {
		--card-h: clamp(3.8rem, 10vh, 6.8rem);
		position: relative;
		border-radius: 0.8rem;
		background:
			repeating-linear-gradient(90deg, rgb(70 40 12 / 30%) 0 2px, transparent 2px 7px),
			repeating-linear-gradient(0deg, rgb(255 236 196 / 16%) 0 2px, transparent 2px 7px),
			linear-gradient(135deg, #c9a266, #a37843);
		box-shadow:
			0 10px 24px rgb(0 0 0 / 50%),
			inset 0 0 0 2px rgb(80 45 15 / 60%),
			inset 0 0 0 5px rgb(255 230 180 / 22%);
		padding: 0.8rem;
	}
	.mat.grid-mat {
		--card-h: clamp(3.4rem, 9vh, 6.2rem);
	}
	.cards {
		position: relative;
		display: grid;
		gap: calc(var(--card-h) * 0.1);
	}
	.cards.grid {
		grid-template-columns: repeat(3, auto);
	}
	.cards.row {
		grid-auto-flow: column;
		gap: calc(var(--card-h) * 0.3);
	}
	.cards svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
	}
	/* Wide invisible strokes along each line, so a line is easy to tap. */
	.cards svg .hit {
		stroke: transparent;
		stroke-width: 2.6;
		stroke-linecap: round;
		pointer-events: stroke;
		cursor: pointer;
	}
	button.lift {
		padding: 0;
		border: 0;
		background: none;
	}
	.slot {
		display: grid;
		justify-items: center;
		gap: 0.35rem;
	}
	.lift {
		display: block;
		border-radius: calc(var(--card-h) * 0.07);
		transition: transform 200ms ease;
	}
	.lift.picked {
		transform: translateY(-4px) scale(1.05);
		outline: 3px solid #f4d68c;
		outline-offset: 1px;
		filter: drop-shadow(0 0 10px rgb(244 214 140 / 75%));
	}
	/* Closed cards you may open: a dark ring then a bright pulsing one, so they stand out on the mat. */
	.lift.tappable {
		box-shadow: 0 0 0 2px rgb(40 20 0 / 85%);
		outline: 3px solid #ffe58a;
		outline-offset: 2px;
		animation: beckon 1.4s ease-in-out infinite;
		cursor: pointer;
	}
	.lift.killer {
		outline: 3px solid #e0455a;
		outline-offset: 1px;
		filter: drop-shadow(0 0 10px rgb(224 69 90 / 70%));
	}
	@keyframes beckon {
		50% {
			transform: translateY(-3px);
			outline-color: #fff6cf;
			filter: drop-shadow(0 0 12px rgb(255 229 138 / 90%));
		}
	}
	.tag {
		border-radius: 999px;
		background: rgb(0 0 0 / 55%);
		padding: 0.1rem 0.55rem;
		color: #f1ebdc;
		font-size: 0.82rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.tag.done {
		color: #8fe0a8;
	}
	.tag.danger {
		color: #ff8b98;
	}
	.pot-progress {
		display: grid;
		gap: 0.25rem;
		min-width: 10rem;
		border-radius: 0.5rem;
		background: rgb(0 0 0 / 50%);
		padding: 0.3rem 0.6rem 0.4rem;
		color: #f1ebdc;
		font-size: 0.85rem;
		font-weight: 800;
	}
	.meter {
		display: block;
		overflow: hidden;
		height: 6px;
		border-radius: 999px;
		background: rgb(0 0 0 / 28%);
	}
	.meter i {
		display: block;
		height: 100%;
		transform-origin: left;
		background: linear-gradient(90deg, #f7dc95, #d9ac4c);
	}
	.piles {
		display: flex;
		gap: 2.2rem;
		padding: 0.3rem 0.8rem;
	}
	.pile {
		display: grid;
		justify-items: center;
		gap: 0.5rem;
	}
	.pile.sold {
		opacity: 0.45;
	}
	.pile-stack {
		position: relative;
		padding: 0 12px 6px 0;
	}
	/* Each card keeps its own stacking, so a back's layers never rise over the open card. */
	/* The closed cards under the open one: just their edges, peeking out to the side. */
	.edge {
		position: absolute;
		top: 0;
		left: 0;
		width: calc(var(--card-h) * 0.7);
		height: var(--card-h);
		border: 2px solid #f3eee2;
		border-radius: calc(var(--card-h) * 0.07);
		background: #1f3f8f;
		box-shadow: 0 2px 6px rgb(0 0 0 / 45%);
	}
	.edge.one {
		translate: 6px 3px;
	}
	.edge.two {
		translate: 12px 6px;
	}
	.top-card {
		position: relative;
		z-index: 2;
		display: block;
	}
	.pile.live .pile-stack {
		filter: drop-shadow(0 0 12px rgb(244 214 140 / 70%));
	}
	.pile-tag {
		border-radius: 999px;
		background: rgb(0 0 0 / 55%);
		padding: 0.15rem 0.6rem;
		color: #f1ebdc;
		font-size: 0.82rem;
		font-weight: 800;
		white-space: nowrap;
	}
	.pile.live .pile-tag {
		background: #f4d68c;
		color: #2d1f05;
	}
	.tray {
		--card-h: clamp(3.2rem, 7.5vh, 5rem);
		display: grid;
		justify-items: center;
		gap: 0.4rem;
		border: 1px solid rgb(244 214 140 / 30%);
		border-radius: 0.9rem;
		background: rgb(0 0 0 / 35%);
		padding: 0.6rem 0.8rem;
		min-width: 7rem;
	}
	.tray-title {
		color: #f4d68c;
		font-size: 0.75rem;
		font-weight: 800;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.tray-cards {
		display: flex;
		gap: 0.35rem;
	}
	.ranks {
		color: #f7dc95;
		font-size: 1.5rem;
		font-weight: 850;
	}
	.before {
		--card-h: 2.6rem;
		display: flex;
		align-items: center;
		gap: 0.2rem;
		opacity: 0.55;
		color: rgb(241 235 220 / 70%);
		font-size: 0.75rem;
	}
	.note {
		color: rgb(241 235 220 / 70%);
		font-size: 0.88rem;
		line-height: 1.45;
		text-align: center;
		max-width: 13rem;
	}
	.danger-note {
		color: #ff8b98;
		font-size: 0.88rem;
		font-weight: 800;
	}
	.prompt,
	.caption {
		border: 1px solid rgb(244 214 140 / 50%);
		border-radius: 1rem;
		background: rgb(8 14 11 / 85%);
		padding: 0.3rem 0.9rem;
		color: #f1ebdc;
		font-size: 0.92rem;
		font-weight: 700;
	}
	.prompt {
		border-radius: 1rem;
		text-align: center;
	}
	.prompt :global(b),
	.caption :global(b) {
		color: #f4d68c;
	}
	.prompt.danger {
		border-color: #e0455a;
		background: rgb(60 5 12 / 90%);
	}
	.prompt.danger :global(b) {
		color: #ff8b98;
	}
	.mat-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.5rem;
	}
	.mat-actions button {
		border: 1px solid rgb(244 214 140 / 50%);
		border-radius: 999px;
		padding: 0.45rem 0.95rem;
		color: #f4d68c;
		font-size: 0.92rem;
		font-weight: 800;
	}
	.mat-actions button.primary {
		border: none;
		background: linear-gradient(180deg, #f7dc95, #d9ac4c);
		color: #2d1f05;
	}
</style>
