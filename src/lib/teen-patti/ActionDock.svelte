<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Eye, EyeOff, Hand, Gavel, Coins, TrendingUp } from '@lucide/svelte';
	import SeatVideo from '#lib/components/SeatVideo.svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';
	import TpCard from './TpCard.svelte';
	import ChipAsk from './ChipAsk.svelte';
	import { money, signedMoney } from './format.js';
	import { jokerPair, PAIR_LABEL, cardText } from './table-cards.js';

	let {
		me,
		room,
		inHand,
		myTurn,
		waitingOn,
		remaining,
		total,
		connected,
		handLabel,
		net,
		dealKey,
		confirmingPack,
		showMedia,
		mediaParticipant,
		onsee,
		ondiscard,
		onjoker,
		onpack,
		onbet,
		onshow,
		onsitout,
		onbalancehidden,
		onaskchips,
		oncancelask,
		onpeek,
		onshowcards,
		waitingActions
	}: {
		me: User;
		room: RoomData;
		inHand: boolean;
		myTurn: boolean;
		waitingOn: string | null;
		remaining: number;
		total: number;
		connected: boolean;
		handLabel: string | null;
		net: number;
		dealKey: string | null;
		confirmingPack: boolean;
		showMedia: boolean;
		mediaParticipant?: MediaParticipant;
		onsee: () => void;
		ondiscard: (index: number) => void;
		/** Kiss-Miss-Bliss: turn two of your cards into one joker. */
		onjoker?: (indexes: [number, number]) => void;
		onpack: () => void;
		onbet: (amount: number) => void;
		onshow: () => void;
		onsitout: (sitOut: boolean) => void;
		onbalancehidden: (hidden: boolean) => void;
		onaskchips: (to: string, amount: number) => void;
		oncancelask: () => void;
		/** Look at your own cards after packing or after the hand. */
		onpeek: () => void;
		/** Show your cards to the whole table after packing or after the hand. */
		onshowcards: () => void;
		waitingActions?: Snippet;
	} = $props();

	const legal = $derived(room.legalActions);
	const live = $derived(room.isStarted && !room.gameShow);
	const playing = $derived(live && inHand && !me.isPacked);
	const low = $derived(legal.minBet ?? 0);
	const high = $derived(Math.min(legal.maxBet ?? 0, me.balance ?? 0));
	const canBet = $derived(myTurn && connected && !!legal.bet);
	const canRaise = $derived(canBet && high > low);
	const progress = $derived(total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0);
	const seconds = $derived(Math.ceil(remaining / 1000));
	const urgency = $derived(progress > 0.5 ? 'calm' : progress > 0.2 ? 'warn' : 'hurry');
	const revealed = $derived(me.cardsInHand.some((card) => card.rank > 0));
	const sittingOut = $derived(me.ready === false);
	const discarding = $derived(!!legal.discard && revealed);
	/** Folding Joker: the card you give up stays in hand, face down, as your joker. */
	const folding = $derived(room.rulesVersion === 'folding-joker-1');
	let chosen = $state<number | null>(null);
	$effect(() => {
		if (!discarding) chosen = null;
	});
	/** Kiss-Miss-Bliss: pairs the server allows as a joker, and the two cards picked so far. */
	const jokerMoves = $derived((legal.table ?? []).filter((move) => move.kind === 'joker'));
	let skipJoker = $state(false);
	let pair = $state<number[]>([]);
	$effect(() => {
		void dealKey;
		skipJoker = false;
		pair = [];
	});
	const pairing = $derived(revealed && jokerMoves.length > 0 && !skipJoker && !!onjoker);
	const pairOk = $derived(
		pair.length === 2 &&
			jokerMoves.some(
				(move) =>
					move.kind === 'joker' && move.indexes.join() === [...pair].sort((a, b) => a - b).join()
			)
	);
	const pairKind = $derived(
		pair.length === 2 ? jokerPair(me.cardsInHand[pair[0]], me.cardsInHand[pair[1]]) : null
	);
	const togglePair = (index: number) => {
		pair = pair.includes(index) ? pair.filter((i) => i !== index) : [...pair, index].slice(-2);
	};
</script>

<section
	class="tp-dock"
	class:my-turn={myTurn && playing}
	aria-label="Your seat and actions"
	data-testid="action-dock"
>
	<div class="me">
		<div class="me-video">
			<SeatVideo
				participant={showMedia ? mediaParticipant : undefined}
				name={me.username}
				playerId={me.id}
				local
			/>
		</div>
		<div class="me-info">
			<span class="me-name" title={me.username}>{me.username}</span>
			<span class="me-balance"
				>{money(me.balance)}<button
					type="button"
					class="privacy"
					class:on={me.balanceHidden}
					onclick={() => onbalancehidden(!me.balanceHidden)}
					disabled={!connected}
					aria-pressed={me.balanceHidden === true}
					title={me.balanceHidden
						? 'Hidden from the table. Tap to show your balance.'
						: 'Visible to the table. Tap to hide your balance.'}
					aria-label={me.balanceHidden
						? 'Show my balance to the table'
						: 'Hide my balance from the table'}
					>{#if me.balanceHidden}<EyeOff size={14} />{:else}<Eye size={14} />{/if}</button
				></span
			>
			<span class="me-net" class:up={net > 0} class:down={net < 0} title="Tonight’s result"
				>{signedMoney(net)} tonight</span
			>
		</div>
	</div>

	<div class="cards-zone">
		{#if inHand && me.cardsInHand.length}
			<div class="my-cards" class:blind={!revealed && playing}>
				{#key dealKey}
					{#each me.cardsInHand as card, index (index)}
						{#if pairing}
							<button
								class="pick"
								class:chosen={pair.includes(index)}
								onclick={() => togglePair(index)}
								aria-label="Pick card {index + 1} for your joker"
								aria-pressed={pair.includes(index)}
							>
								<TpCard {card} faceUp />
							</button>
						{:else if discarding}
							<button
								class="pick"
								class:chosen={chosen === index}
								onclick={() => (chosen = index)}
								aria-label="{folding ? 'Fold' : 'Throw away'} card {index + 1}"
								aria-pressed={chosen === index}
							>
								<TpCard {card} faceUp wild={me.wildCards?.includes(index) ?? false} />
							</button>
						{:else if me.folded && index === me.cardsInHand.length - 1}
							<!-- The folded card: set aside, its rank is your joker. -->
							<span class="folded-card" title="Folded: its rank is your joker">
								<TpCard {card} faceUp={revealed} dim />
								<span class="folded-tag">Joker</span>
							</span>
						{:else}
							<TpCard
								{card}
								faceUp={revealed}
								flip={revealed}
								deal={revealed ? -1 : index}
								dim={me.isPacked}
								wild={me.wildCards?.includes(index) ?? false}
							/>
						{/if}
					{/each}
				{/key}
				{#if !revealed && playing && room.rulesVersion === 'pot-blind-1'}
					<span class="see-overlay locked">Blind until the Show</span>
				{:else if !revealed && playing}
					<button
						class="see-overlay"
						onclick={onsee}
						disabled={!connected || !legal.see}
						data-testid="see-cards"
					>
						<Eye class="h-5 w-5" /> See cards
						<kbd>S</kbd>
					</button>
				{/if}
			</div>
			<p class="hand-name">
				{#if pairing}
					{#if pair.length < 2}
						Tap two cards to make your joker
						<button class="after-btn" onclick={() => (skipJoker = true)}>No joker</button>
					{:else if pairOk && pairKind}
						<button
							class="throw make"
							onclick={() => onjoker?.([...pair].sort((a, b) => a - b) as [number, number])}
							>{PAIR_LABEL[pairKind]}
							{cardText(me.cardsInHand[pair[0]])}-{cardText(me.cardsInHand[pair[1]])}: make joker</button
						>
					{:else}
						Not a {room.rulesVersion === 'kiss-miss-bliss-1'
							? 'Kiss, Miss or Bliss'
							: 'Kiss or Miss'}
					{/if}
				{:else if discarding}
					{#if chosen === null}
						{folding
							? 'Tap the card to fold: its rank becomes your joker'
							: 'Tap the card you want to throw away'}
						{#if !folding && handLabel?.startsWith('Best three')}<small class="best-keep"
								>{handLabel}</small
							>{/if}
					{:else}
						<button class="throw" onclick={() => chosen !== null && ondiscard(chosen)}
							>{folding ? 'Fold this card as my joker' : 'Throw this card away'}</button
						>
					{/if}
				{:else if live && me.isPacked}
					{#if revealed && handLabel}{handLabel}{/if}
				{:else if me.isPacked && !legal.peek && !legal.reveal}
					You packed this hand{#if handLabel}&nbsp;· {handLabel}{/if}
				{:else if legal.peek || legal.reveal}
					<span class="after-hand">
						{#if me.isPacked}<span>You packed</span>{:else if handLabel}<span>{handLabel}</span
							>{/if}
						{#if legal.peek}
							<button class="after-btn" onclick={onpeek} disabled={!connected}
								><Eye size={14} /> See my cards</button
							>
						{/if}
						{#if legal.reveal}
							<button class="after-btn gold" onclick={onshowcards} disabled={!connected}
								>Show to table</button
							>
						{/if}
					</span>
				{:else if revealed && handLabel}
					{handLabel}
				{:else if playing}
					{room.rulesVersion === 'pot-blind-1'
						? 'Everyone plays blind this hand'
						: 'Playing blind · bets cost half'}
				{/if}
			</p>
		{:else}
			<div class="sit-msg">
				{#if sittingOut}
					<p>You’re sitting out.</p>
				{:else if live}
					<p>You’ll be dealt in next hand.</p>
				{:else}
					<p>Waiting for the deal…</p>
				{/if}
			</div>
		{/if}
	</div>

	<div class="actions">
		{#if !room.isStarted && waitingActions}{@render waitingActions()}{/if}
		<ChipAsk {room} selfId={me.id} {connected} onask={onaskchips} oncancel={oncancelask} />
		<div class="turn-line">
			{#if playing && myTurn}
				<span class="turn-text {urgency}">Your turn</span>
				<span class="turn-secs {urgency}">{seconds}s</span>
			{:else if playing && waitingOn}
				<span class="wait-text">Waiting for <strong>{waitingOn}</strong>…</span>
			{:else if live && me.isPacked}
				<div class="packed-status">
					<span class="wait-text">Packed. Watch the rest of the hand</span>
					<div class="packed-controls">
						{#if legal.peek}
							<button class="after-btn" onclick={onpeek} disabled={!connected}
								><Eye size={14} /> See my cards</button
							>
						{/if}
						{#if legal.reveal}
							<button class="after-btn gold" onclick={onshowcards} disabled={!connected}
								>Show to table</button
							>
						{/if}
					</div>
				</div>
			{:else}
				<label class="sit-toggle">
					<input
						type="checkbox"
						class="toggle toggle-xs"
						checked={!sittingOut}
						disabled={!connected || !legal.ready}
						onchange={(event) => onsitout(!event.currentTarget.checked)}
					/>
					Deal me in
				</label>
			{/if}
		</div>
		{#if playing}
			<div class="bar" aria-hidden="true">
				<span class="fill {urgency}" style:transform="scaleX({myTurn ? progress : 0})"></span>
			</div>
			<div class="buttons" data-testid="game-actions">
				<button
					class="act pack"
					class:confirm={confirmingPack}
					onclick={onpack}
					disabled={!connected || !legal.pack}
				>
					<Hand class="h-4 w-4" />
					<span>{confirmingPack ? 'Tap again' : 'Pack'}</span>
					<kbd>P</kbd>
				</button>
				{#if legal.show}
					<button class="act show" onclick={onshow} disabled={!connected}>
						<Gavel class="h-4 w-4" />
						<span>Show <small>{money(low)}</small></span>
						<kbd>W</kbd>
					</button>
				{/if}
				<button class="act chaal" onclick={() => onbet(low)} disabled={!canBet}>
					<Coins class="h-4 w-4" />
					<span>{me.isBlind ? 'Blind' : 'Chaal'} <small>{money(low)}</small></span>
					<kbd>C</kbd>
				</button>
				<button class="act raise" onclick={() => onbet(high)} disabled={!canRaise}>
					<TrendingUp class="h-4 w-4" />
					<span>Raise <small>{money(high)}</small></span>
					<kbd>R</kbd>
				</button>
			</div>
		{/if}
		{#if playing}
			<label class="sit-toggle quiet">
				<input
					type="checkbox"
					class="toggle toggle-xs"
					checked={!sittingOut}
					disabled={!connected || !legal.ready}
					onchange={(event) => onsitout(!event.currentTarget.checked)}
				/>
				Deal me in next hand
			</label>
		{/if}
	</div>
</section>

<style>
	.tp-dock {
		/* Kept compact so the table and friends get most of the screen. */
		--card-h: clamp(4.8rem, 11vh, 7rem);
		/* Your hand is drawn larger and rises out of the dock toward the table. */
		--hand-h: calc(var(--card-h) * 1.6);
		position: relative;
		display: grid;
		grid-template-columns: clamp(8rem, 11vw, 11rem) minmax(0, 1fr) minmax(18rem, 25rem);
		align-items: center;
		gap: clamp(0.75rem, 2vw, 2rem);
		border: 1px solid rgb(240 209 140 / 14%);
		border-radius: 1.4rem;
		background:
			linear-gradient(180deg, rgb(255 255 255 / 4%), transparent 40%), rgb(14 22 19 / 92%);
		padding: 0.6rem 1rem;
		box-shadow: 0 -0.5rem 2.5rem rgb(0 0 0 / 35%);
		transition:
			border-color 300ms ease,
			box-shadow 300ms ease;
	}
	.tp-dock.my-turn {
		border-color: rgb(240 200 110 / 55%);
		box-shadow:
			0 -0.5rem 2.5rem rgb(0 0 0 / 35%),
			0 0 2.5rem rgb(233 191 98 / 18%);
	}
	.me {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.45rem;
	}
	.me-video {
		overflow: hidden;
		border-radius: 0.85rem;
	}
	.me-video :global(.seat-video) {
		aspect-ratio: 16 / 10;
	}
	/* Wide screens: your camera is bigger and, like your hand, rises out of the dock, staying a
	   little shorter and lower than the cards. */
	@media (min-width: 960px) {
		.tp-dock {
			grid-template-columns: clamp(10rem, 14.5vw, 14rem) minmax(0, 1fr) minmax(18rem, 25rem);
		}
		.me {
			align-self: end;
		}
		.me-video {
			position: relative;
			z-index: 3;
			width: min(100%, calc(var(--hand-h) * 0.8 * 1.6));
			margin-top: calc(var(--hand-h) * -0.34);
			box-shadow:
				0 0 0 1px rgb(240 209 140 / 22%),
				0 0.8rem 1.4rem rgb(0 0 0 / 50%);
		}
	}
	.me-video :global(.camera-off-label) {
		display: none;
	}
	.me-info {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.1rem;
		min-width: 0;
		line-height: 1.2;
	}
	.me-name {
		overflow: hidden;
		color: #f1ebdc;
		font-size: 0.9rem;
		font-weight: 650;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.me-balance {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: #f0d18c;
		font-size: 1.05rem;
		font-variant-numeric: tabular-nums;
		font-weight: 800;
	}
	/* Hide or show your balance to the rest of the table. */
	.privacy {
		display: grid;
		flex-shrink: 0;
		place-items: center;
		width: 1.3rem;
		height: 1.3rem;
		border-radius: 999px;
		color: rgb(240 209 140 / 60%);
		cursor: pointer;
	}
	.privacy:hover:not(:disabled) {
		background: rgb(240 209 140 / 12%);
		color: #f0d18c;
	}
	.privacy.on {
		color: #9fc9b0;
	}
	.me-net {
		grid-column: 1 / -1;
		color: rgb(241 235 220 / 55%);
		font-size: 0.72rem;
		font-variant-numeric: tabular-nums;
	}
	.me-net.up {
		color: #8fd6a5;
	}
	.me-net.down {
		color: #ee9a8c;
	}
	.cards-zone {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.my-cards {
		--card-h: var(--hand-h);
		position: relative;
		z-index: 3;
		display: flex;
		justify-content: center;
		/* Lift the hand so about 40% of it sits above the dock's top edge. */
		margin-top: calc(var(--hand-h) * -0.42);
		filter: drop-shadow(0 0.9rem 1.2rem rgb(0 0 0 / 55%));
	}
	.my-cards > :global(.tp-card) {
		transform-origin: 50% 120%;
	}
	.my-cards > :global(.tp-card + .tp-card) {
		margin-left: calc(var(--card-h) * -0.16);
	}
	.my-cards > :global(.tp-card:first-child:not(:last-child)) {
		rotate: -6deg;
	}
	.my-cards > :global(.tp-card:last-child:not(:first-child)) {
		rotate: 6deg;
	}
	.my-cards > :global(.tp-card:hover) {
		transform: translateY(-0.4rem);
	}
	.see-overlay {
		position: absolute;
		inset: -0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border-radius: 0.9rem;
		color: #fbf3df;
		font-size: 1.05rem;
		font-weight: 750;
		letter-spacing: 0.02em;
		cursor: pointer;
	}
	/* The whole hand is the button; only a pill sits on it, so the card backs stay visible. */
	.see-overlay::before {
		position: absolute;
		inset: 50% auto auto 50%;
		z-index: -1;
		width: 11.5em;
		height: 2.6em;
		translate: -50% -50%;
		border-radius: 999px;
		background: rgb(6 12 10 / 78%);
		box-shadow:
			0 0.4rem 1.2rem rgb(0 0 0 / 45%),
			inset 0 0 0 1px rgb(247 220 149 / 30%);
		content: '';
		transition: background 200ms ease;
	}
	.see-overlay:hover:not(:disabled)::before {
		background: rgb(6 12 10 / 90%);
	}
	.see-overlay {
		isolation: isolate;
	}
	.see-overlay:disabled {
		cursor: default;
	}
	.see-overlay.locked {
		cursor: default;
		font-size: 0.9rem;
	}
	.see-overlay.locked::before {
		width: 13em;
	}
	.pick {
		border-radius: calc(var(--card-h) * 0.08);
		cursor: pointer;
		transition: transform 160ms ease;
	}
	.pick + .pick {
		margin-left: calc(var(--card-h) * -0.16);
	}
	.pick:hover {
		transform: translateY(-0.3rem);
	}
	.pick.chosen {
		transform: translateY(-0.8rem) rotate(-4deg);
		filter: saturate(0.6);
		outline: 3px solid #e06a55;
		outline-offset: 2px;
	}
	.throw {
		border-radius: 999px;
		background: #b8432f;
		padding: 0.35rem 1rem;
		color: #fff2ee;
		font-size: 0.9rem;
		font-weight: 750;
		cursor: pointer;
	}
	/* Before throwing away: the best three you could keep, under the prompt. */
	.best-keep {
		display: block;
		color: #f4d68c;
		font-size: 0.8rem;
		font-weight: 700;
	}
	/* Kiss-Miss-Bliss: turning two cards into a joker is a gain, so it reads gold, not red. */
	.throw.make {
		background: linear-gradient(180deg, #f7dc95, #d9ac4c);
		color: #2d1f05;
	}
	/* After packing or after the hand: look at your cards, or show them to everyone. */
	.after-hand {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	.after-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid rgb(240 209 140 / 35%);
		border-radius: 999px;
		padding: 0.25rem 0.8rem;
		color: #f4d68c;
		font-size: 0.82rem;
		font-weight: 650;
		cursor: pointer;
	}
	.after-btn.gold {
		border-color: transparent;
		background: #f4d68c;
		color: #24180a;
	}
	.after-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.folded-card {
		position: relative;
		display: block;
		margin-left: calc(var(--card-h) * 0.12);
		rotate: 8deg;
		opacity: 0.85;
	}
	.folded-tag {
		position: absolute;
		bottom: 0.4rem;
		left: 50%;
		translate: -50% 0;
		border-radius: 999px;
		background: linear-gradient(150deg, #f7df9d, #c08a34);
		padding: 0.05rem 0.5rem;
		color: #24180a;
		font-size: 0.7rem;
		font-weight: 800;
		box-shadow: 0 2px 6px rgb(0 0 0 / 45%);
	}
	.hand-name {
		min-height: 1.4rem;
		color: #f4e3b5;
		font-size: 0.95rem;
		font-weight: 650;
		text-align: center;
	}
	.sit-msg {
		display: grid;
		min-height: calc(var(--card-h) * 0.8);
		place-items: center;
		color: rgb(241 235 220 / 60%);
		font-size: 0.95rem;
	}
	.actions {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.55rem;
	}
	.turn-line {
		display: flex;
		min-height: 1.5rem;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.turn-text {
		font-size: 1.1rem;
		font-weight: 800;
	}
	.packed-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.65rem;
	}
	.packed-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.turn-secs {
		font-size: 1.1rem;
		font-variant-numeric: tabular-nums;
		font-weight: 800;
	}
	.calm {
		color: #9be0b1;
	}
	.warn {
		color: #f0cc78;
	}
	.hurry {
		color: #ff8f7e;
	}
	.wait-text {
		color: rgb(241 235 220 / 65%);
		font-size: 0.92rem;
	}
	.wait-text strong {
		color: #f1ebdc;
	}
	.bar {
		height: 0.3rem;
		overflow: hidden;
		border-radius: 999px;
		background: rgb(255 255 255 / 8%);
	}
	.fill {
		display: block;
		height: 100%;
		transform-origin: left;
		border-radius: inherit;
		background: currentColor;
		transition: transform 260ms linear;
	}
	.buttons {
		display: grid;
		grid-auto-columns: minmax(0, 1fr);
		grid-auto-flow: column;
		gap: 0.5rem;
	}
	.act {
		position: relative;
		display: flex;
		min-height: 3.2rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.15rem;
		border: 1px solid rgb(241 235 220 / 16%);
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 5%);
		padding: 0.4rem 0.3rem;
		color: #f1ebdc;
		font-size: 0.92rem;
		font-weight: 750;
		line-height: 1.1;
		cursor: pointer;
		transition:
			transform 120ms ease,
			background 160ms ease,
			opacity 160ms ease;
	}
	.act span {
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.act small {
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		opacity: 0.85;
	}
	.act:hover:not(:disabled) {
		background: rgb(255 255 255 / 10%);
	}
	.act:active:not(:disabled) {
		transform: scale(0.97);
	}
	.act:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}
	.act.chaal {
		border-color: transparent;
		background: linear-gradient(160deg, #f4d68c, #c99236);
		color: #24180a;
		box-shadow: 0 0.35rem 1rem rgb(201 146 54 / 30%);
	}
	.act.chaal:hover:not(:disabled) {
		background: linear-gradient(160deg, #f8df9f, #d39d40);
	}
	.act.raise {
		border-color: rgb(240 200 110 / 55%);
		color: #f4d68c;
	}
	.act.show {
		border-color: rgb(127 200 255 / 45%);
		color: #b5dcff;
	}
	.act.pack {
		color: #f0a898;
	}
	.act.pack.confirm {
		border-color: #e06a55;
		background: rgb(224 106 85 / 22%);
		color: #ffd2c8;
	}
	kbd {
		position: absolute;
		top: 0.3rem;
		right: 0.4rem;
		font-family: inherit;
		font-size: 0.58rem;
		font-weight: 700;
		opacity: 0.45;
	}
	.see-overlay kbd {
		position: static;
		border: 1px solid rgb(255 255 255 / 30%);
		border-radius: 0.3rem;
		padding: 0 0.3rem;
	}
	.sit-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: rgb(241 235 220 / 75%);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.sit-toggle.quiet {
		align-self: flex-end;
		font-size: 0.72rem;
		opacity: 0.7;
	}
	@media (hover: none) {
		kbd {
			display: none;
		}
	}
	@media (max-width: 959px) {
		.tp-dock {
			--card-h: clamp(4.2rem, 9vh, 5.5rem);
			--hand-h: calc(var(--card-h) * 1.45);
			grid-template-columns: 7rem minmax(0, 1fr);
			grid-template-areas: 'me cards' 'actions actions';
			gap: 0.6rem 0.8rem;
			border-radius: 1.2rem 1.2rem 0 0;
			padding: 0.5rem 0.75rem calc(0.5rem + env(safe-area-inset-bottom));
		}
		.me {
			grid-area: me;
		}
		.my-cards {
			margin-top: calc(var(--hand-h) * -0.3);
		}
		.cards-zone {
			grid-area: cards;
		}
		.actions {
			grid-area: actions;
		}
		.me-info {
			grid-template-columns: 1fr;
		}
		.me-name {
			font-size: 0.75rem;
		}
		.me-balance {
			font-size: 0.9rem;
		}
		.me-net {
			font-size: 0.65rem;
		}
		.act {
			min-height: 2.9rem;
			font-size: 0.85rem;
		}
	}
	@media (max-width: 420px) {
		.tp-dock {
			grid-template-columns: 6rem minmax(0, 1fr);
		}
		.me-video :global(.seat-video-status) {
			display: none;
		}
		.act {
			font-size: 0.78rem;
		}
		.act small {
			font-size: 0.74rem;
		}
		.hand-name {
			font-size: 0.82rem;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.fill {
			transition: none;
		}
	}
</style>
