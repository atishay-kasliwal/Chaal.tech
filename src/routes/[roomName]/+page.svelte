<script lang="ts">
	import { onMount } from 'svelte';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { displayToast } from '#lib/components/Toasts/index.js';
	import { goto } from '$app/navigation';
	import UsernameForm from './UsernameForm.svelte';
	import UsersTable from './UsersTable.svelte';
	import PokerSeat from '#lib/components/PokerSeat.svelte';
	import PlayingCard from '#lib/components/PlayingCard.svelte';
	import TableScene from '#lib/components/TableScene.svelte';
	import PokerActionBar from '#lib/components/PokerActionBar.svelte';
	import BlackjackActionBar from '#lib/components/BlackjackActionBar.svelte';
	import RummyActionBar from '#lib/components/RummyActionBar.svelte';
	import RummySeat from '#lib/components/RummySeat.svelte';
	import { VARIANT_BY_VERSION, VARIANT_CATALOG, type RulesVersion } from '#lib/variant-catalog.js';
	import RoomMedia from '#lib/components/RoomMedia.svelte';
	import TeenPattiTable from '#lib/teen-patti/TeenPattiTable.svelte';
	import type { MediaState } from '#lib/media/controller.js';
	let mediaState = $state.raw<MediaState | null>(null);
	import { LogOut, Play, Crown, Swords, Copy } from '@lucide/svelte';

	let { data } = $props();

	/** Username of the current player */
	let username = $state<string>('');

	/** To check whether user has been created and joined the room */
	let usernameCreated = $state<boolean>(false);

	let roomData = $state<RoomData | null>(null);
	let nextRulesVersion = $state<RulesVersion>('classic-1');
	let nextVariantMode = $state<'selected' | 'random'>('selected');
	let lastRulesVersion = '';

	/** Value to cut the deck at */
	let cutAt = $state<number>(0);

	/** Number of cards to deal to each player */
	let cardsToDeal = $derived(VARIANT_BY_VERSION[nextRulesVersion]?.cardsPerPlayer ?? 3);
	let raiseTo = $state(4);
	let blackjackWager = $state(2);
	let self = $derived(roomData?.usersList.find((user) => user.id === socket.playerId));
	let selfReady = $derived(self?.ready === true);
	let readyPlayers = $derived(
		roomData?.usersList.filter((user) => user.connected && !user.hasLeft && user.balance > 0) ?? []
	);
	let allReadyToStart = $derived(
		readyPlayers.length >= 2 && readyPlayers.every((user) => user.ready === true)
	);

	function rankLabel(rank: number) {
		return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } as Record<number, string>)[rank] ?? String(rank);
	}

	const isTeenPatti = $derived((roomData?.gameType ?? 'teen-patti') === 'teen-patti');

	/** Host preference, remembered on this device. */
	let autoDeal = $state(true);
	const autoDealKey = 'chaal-auto-deal-v1';
	$effect(() => {
		const value = autoDeal;
		try {
			localStorage.setItem(autoDealKey, value ? 'on' : 'off');
		} catch {
			/* Preference lasts for this tab when storage is blocked. */
		}
	});

	async function sendAction(event: string, args: unknown[] = []) {
		const result = await socket.command(event, args);
		if (!result.ok) displayToast(result.error || 'Action rejected', 'error');
		return result.ok;
	}
	async function leaveRoomHandler() {
		if (await sendAction('leaveRoom')) goto('/create-room');
	}
	async function toggleReady() {
		await sendAction('ready', [!selfReady]);
	}
	async function copyInviteLink() {
		try {
			await navigator.clipboard.writeText(`${window.location.origin}/${data.roomName}`);
			displayToast('Invite link copied', 'success');
		} catch {
			displayToast('Could not copy link. Copy the room code from the address bar.', 'error');
		}
	}
	/** Email invites ride the game socket so the server knows who is asking. */
	async function sendEmailInvites(emails: string[]) {
		if (!socket.connected) return { ok: false, error: 'Reconnect before sending invites' };
		try {
			return await socket.socket
				.timeout(15000)
				.emitWithAck(emails.length ? 'sendInvites' : 'listInvites', data.roomName, emails);
		} catch {
			return { ok: false, error: 'No reply from the game server. Share the link instead.' };
		}
	}
	/** Teen Patti deals: the server shuffles, so a random cut only adds ceremony. */
	function dealTeenPatti() {
		const seated = roomData?.usersList.length ?? 2;
		const cut = Math.floor(Math.random() * Math.max(1, 52 - cardsToDeal * seated));
		return sendAction('start', [
			data.roomName,
			cut,
			cardsToDeal,
			nextRulesVersion,
			nextVariantMode
		]);
	}
	function startGameHandler(e: Event) {
		e.preventDefault();
		void sendAction('start', [
			data.roomName,
			cutAt,
			cardsToDeal,
			nextRulesVersion,
			nextVariantMode
		]);
	}
	function pokerAction(action: 'fold' | 'check' | 'call' | 'raise') {
		void sendAction('pokerAction', action === 'raise' ? [action, raiseTo] : [action]);
	}
	function blackjackAction(action: 'hit' | 'stand' | 'double') {
		void sendAction('blackjackAction', [action]);
	}
	function rummyAction(
		action: 'draw-stock' | 'draw-discard' | 'discard' | 'declare',
		index?: number
	) {
		return sendAction('rummyAction', [action, ...(index === undefined ? [] : [index])]);
	}
	function setBlackjackWager() {
		void sendAction('blackjackBet', [blackjackWager]);
	}
	let lastRevision = -1;
	$effect(() => {
		const snapshot = socket.roomData;
		if (snapshot?.name !== data.roomName) return;
		roomData = snapshot;
		if (lastRulesVersion !== snapshot.rulesVersion) {
			nextRulesVersion = snapshot.rulesVersion as RulesVersion;
			lastRulesVersion = snapshot.rulesVersion;
		}
		const me = snapshot.usersList.find((user) => user.id === socket.playerId);
		usernameCreated = !!me && !me.hasLeft;
		username = me?.username || '';
		if (lastRevision !== snapshot.revision) {
			raiseTo = Math.min(
				snapshot.legalActions.minRaiseTo ?? 4,
				snapshot.legalActions.maxRaiseTo ?? 4
			);
			blackjackWager = me?.wager ?? 2;
			lastRevision = snapshot.revision;
		}
	});
	/** Practice tables from the create page: seat the requested bots, then deal once. */
	let practiceDone = false;
	$effect(() => {
		const room = roomData;
		if (practiceDone || !room || !usernameCreated || room.isStarted) return;
		if ((room.gameType ?? 'teen-patti') !== 'teen-patti' || room.hostId !== socket.playerId) return;
		const params = new URLSearchParams(window.location.search);
		const wanted = Math.min(5, Math.max(0, Number(params.get('bots')) || 0));
		const level = ['easy', 'normal', 'hard'].includes(params.get('level') ?? '')
			? params.get('level')
			: 'normal';
		if (!wanted) return;
		practiceDone = true;
		history.replaceState(history.state, '', window.location.pathname);
		void (async () => {
			for (let i = room.usersList.filter((u) => u.bot).length; i < wanted; i++) {
				const revision = socket.roomData?.revision;
				if (!(await sendAction('addBot', [level]))) return;
				// Wait for the new seat to arrive before the next command (revision-checked).
				for (let tries = 0; tries < 50 && socket.roomData?.revision === revision; tries++)
					await new Promise((resolve) => setTimeout(resolve, 40));
			}
			await dealTeenPatti();
		})();
	});
	onMount(() => {
		try {
			autoDeal = localStorage.getItem(autoDealKey) !== 'off';
		} catch {
			/* Default to dealing automatically. */
		}
		socket.enterRoom(data.roomName);
		return () => {
			socket.disconnect();
		};
	});
</script>

{#if usernameCreated && roomData && isTeenPatti}
	{@const room = roomData}
	<TeenPattiTable
		{room}
		selfId={socket.playerId}
		connected={socket.connected}
		{mediaState}
		bind:autoDeal
		send={sendAction}
		ondeal={dealTeenPatti}
		oninvite={copyInviteLink}
		onleave={leaveRoomHandler}
		emailInvites={sendEmailInvites}
	>
		{#snippet media()}
			{#key data.roomName + ':' + socket.playerId}
				<RoomMedia
					roomName={data.roomName}
					playerId={socket.playerId}
					connected={socket.connected}
					members={room.usersList}
					compact
					onstate={(state) => (mediaState = state)}
				/>
			{/key}
		{/snippet}
		{#snippet settings()}
			<div class="tp-settings" data-testid="next-round-controls">
				<p class="tp-settings-title">Next hand</p>
				<div class="join w-full" aria-label="Choose next-round mode">
					<button
						type="button"
						class="btn btn-sm join-item flex-1 {nextVariantMode === 'selected'
							? 'btn-primary'
							: 'btn-outline'}"
						onclick={() => (nextVariantMode = 'selected')}>Choose variant</button
					>
					<button
						type="button"
						class="btn btn-sm join-item flex-1 {nextVariantMode === 'random'
							? 'btn-primary'
							: 'btn-outline'}"
						onclick={() => (nextVariantMode = 'random')}>Random variant</button
					>
				</div>
				{#if nextVariantMode === 'selected'}
					<div class="tp-variants" role="radiogroup" aria-label="Next round variant">
						{#each VARIANT_CATALOG as variant (variant.rulesVersion)}
							<label class="tp-variant" class:on={nextRulesVersion === variant.rulesVersion}>
								<input
									type="radio"
									name="nextVariant"
									value={variant.rulesVersion}
									bind:group={nextRulesVersion}
									disabled={!socket.connected}
								/>
								<span>
									<strong>{variant.selectionLabel.split(' — ')[0]}</strong>
									<small>{variant.description}</small>
								</span>
							</label>
						{/each}
					</div>
				{:else}
					<p class="tp-note">
						The server picks a Teen Patti variant at random for each hand. Seats, chips and controls
						stay the same.
					</p>
				{/if}
				<p class="tp-note">
					Boot {room.boot ?? 1} · buy-in {room.table} · {Math.round((room.turnMs ?? 60000) / 1000)}s
					per turn, then auto-pack.
				</p>
			</div>
		{/snippet}
	</TeenPattiTable>
{:else}
	<div
		class="room-header bg-base-100/95 border-primary/20 rounded-b-box sticky top-0 z-50 flex flex-col items-center justify-between gap-4 border-b px-4 py-3 shadow-md backdrop-blur-md md:flex-row md:gap-0"
	>
		<div
			class="flex w-full flex-1 flex-col items-center justify-center md:items-start md:justify-start"
		>
			<h1 class="text-primary flex items-center gap-2 text-xl font-bold">
				<Crown class="text-accent h-5 w-5" />
				{usernameCreated ? username + ' @ ' : ''}{data.roomName}
			</h1>
			{#if roomData}
				{@const currentVariant = VARIANT_BY_VERSION[roomData.rulesVersion as RulesVersion]}
				<p class="text-primary/80 mt-1 text-xs" data-testid="variant-label">
					{roomData.gameType === 'texas-holdem'
						? 'Texas Hold’em Poker'
						: roomData.gameType === 'blackjack'
							? 'Blackjack · S17 · 3:2'
							: roomData.gameType === 'rummy'
								? '13-card Indian Rummy'
								: (currentVariant?.tableLabel ?? 'Unsupported variant')}
				</p>
				{#if roomData.variantState?.indicator}
					<p class="text-primary/70 mt-1 text-xs" data-testid="joker-indicator">
						Wild rank: {rankLabel(roomData.variantState.wildRank)}
					</p>
				{/if}
			{/if}
			{#if roomData?.isStarted && roomData?.usersList?.[roomData.currentPlayer]}
				<div
					class="room-waiting text-base-content/70 mt-1 flex items-center gap-1.5 text-xs font-medium"
				>
					<span class="loading loading-ring loading-xs text-warning"></span>
					Waiting on:
					<span class="text-warning font-bold"
						>{roomData.usersList[roomData.currentPlayer].username}</span
					>
				</div>
			{/if}
		</div>

		<div
			class="flex w-full flex-none flex-wrap items-center justify-center gap-3 md:w-auto md:justify-end"
		>
			{#if usernameCreated}
				<button
					class="btn btn-outline btn-primary btn-sm"
					onclick={copyInviteLink}
					aria-label="Copy invite link"
				>
					<Copy class="h-4 w-4" /> <span class="hidden sm:inline">Invite friends</span>
				</button>
				<button
					class="btn btn-outline btn-error btn-sm"
					onclick={leaveRoomHandler}
					aria-label="Leave"
				>
					<LogOut class="h-4 w-4" /> <span class="hidden sm:inline">Leave</span>
				</button>
			{/if}
		</div>
	</div>

	{#if usernameCreated && roomData}
		{#key data.roomName + ':' + socket.playerId}
			<RoomMedia
				roomName={data.roomName}
				playerId={socket.playerId}
				connected={socket.connected}
				members={roomData.usersList}
				preview={!roomData.isStarted}
				onstate={(state) => (mediaState = state)}
			/>
		{/key}
	{/if}

	{#if !socket.connected || socket.error}
		<div class="alert alert-info mt-4" role="status">
			<span>{socket.error || 'Reconnecting — game actions are paused.'}</span>
			<button class="btn btn-sm btn-outline" onclick={() => socket.connect()}>Reconnect</button>
		</div>
	{/if}

	{#if !usernameCreated}
		<UsernameForm bind:username bind:usernameCreated roomName={data.roomName} />
	{/if}

	{#if roomData?.isStarted}
		{@const table = roomData}
		<TableScene
			players={table.usersList}
			selfId={socket.playerId}
			gameType={table.gameType ?? 'teen-patti'}
		>
			{#snippet center()}
				<h2
					class="text-primary text-2xl font-extrabold tracking-tight"
					class:sr-only={!!table.result}
				>
					{table.gameType === 'texas-holdem'
						? 'Texas Hold’em'
						: table.gameType === 'blackjack'
							? 'Blackjack'
							: table.gameType === 'rummy'
								? 'Indian Rummy'
								: 'Teen Patti'}
				</h2>
				{#if table.gameType === 'texas-holdem'}
					{#if !table.result}<p class="text-base-content/60 mb-2 text-sm capitalize">
							{table.stage} · Blinds {table.smallBlind}/{table.bigBlind}
						</p>{/if}
					<div
						class="my-4 flex min-h-24 flex-wrap items-center justify-center gap-2"
						aria-label="Community cards"
						data-testid="community-cards"
					>
						{#each table.board ?? [] as card, index (`${card.rank}-${card.suit}-${index}`)}
							<PlayingCard rank={card.rank} suit={card.suit} class="!h-24 !w-16" />
						{/each}
						{#if !table.board?.length}<span class="text-base-content/40 text-xs"
								>Community cards appear here</span
							>{/if}
					</div>
					<div
						class="bg-base-200 mx-auto flex w-fit items-center gap-3 rounded-lg px-4 py-2 text-sm"
						class:hidden={!!table.result}
					>
						<span>Pot: <strong>{table.pot}</strong></span><span
							>To call: <strong>{table.legalActions.toCall ?? 0}</strong></span
						>
					</div>
					{#if table.result}
						<div class="alert alert-success mx-auto mt-4 max-w-sm" role="status">
							{table.result.winnerName} won {table.result.amount} chips
						</div>
						<div
							class="poker-next-round border-primary/20 bg-base-100/70 mx-auto mt-2 flex w-full max-w-md items-center justify-between gap-2 rounded-xl border p-2"
							data-testid="poker-next-round-controls"
						>
							<button
								class="btn btn-ghost btn-xs"
								onclick={toggleReady}
								disabled={!socket.connected}>{selfReady ? 'Ready ✓' : 'I’m ready'}</button
							>
							{#if table.hostId === socket.playerId}
								<button
									class="btn btn-primary btn-sm"
									onclick={startGameHandler}
									disabled={!socket.connected || !table.legalActions.start || !allReadyToStart}
									>Start next hand</button
								>
							{/if}
						</div>
					{/if}
					{#if table.isStarted && table.currentPlayer === table.usersList.findIndex((user) => user.id === socket.playerId)}
						<div
							class="mt-4 hidden flex-wrap items-center justify-center gap-2 md:flex"
							data-testid="poker-actions"
						>
							{#if table.legalActions.fold}<button
									class="btn btn-outline btn-error btn-sm"
									onclick={() => pokerAction('fold')}>Fold</button
								>{/if}
							{#if table.legalActions.check}<button
									class="btn btn-outline btn-primary btn-sm"
									onclick={() => pokerAction('check')}>Check</button
								>{/if}
							{#if table.legalActions.call}<button
									class="btn btn-secondary btn-sm"
									onclick={() => pokerAction('call')}>Call {table.legalActions.toCall}</button
								>{/if}
							{#if table.legalActions.raise}
								<label class="input input-sm w-28"
									><span class="sr-only">Raise to</span><input
										type="number"
										bind:value={raiseTo}
										min={table.legalActions.minRaiseTo}
										max={table.legalActions.maxRaiseTo}
									/></label
								>
								<button class="btn btn-primary btn-sm" onclick={() => pokerAction('raise')}
									>{(table.legalActions.maxRaiseTo ?? 0) < (table.legalActions.minRaiseTo ?? 0)
										? 'All in'
										: 'Raise'}</button
								>
							{/if}
						</div>
					{/if}
				{:else if table.gameType === 'blackjack'}
					<p class="text-base-content/60 mb-2 text-sm capitalize">
						{table.stage === 'players'
							? 'Players’ turn'
							: table.stage === 'dealer'
								? 'Dealer’s turn'
								: 'Dealer stands on soft 17'}
					</p>
					<div
						class="flex flex-wrap items-center justify-center gap-2"
						aria-label="Dealer hand"
						data-testid="dealer-cards"
					>
						{#each table.dealerCards ?? [] as card, index (`${card.rank}-${card.suit}-${index}`)}
							<PlayingCard
								rank={card.rank}
								suit={card.suit}
								faceDown={card.rank === 0}
								class="!h-20 !w-14 sm:!h-24 sm:!w-16"
							/>
						{/each}
					</div>
					<p class="mt-1 text-sm">
						Dealer total: {table.dealerTotal ?? '—'}
						<span class="text-base-content/50">· Pot: {table.pot}</span>
					</p>
					{#if table.currentPlayer === table.usersList.findIndex((user) => user.id === socket.playerId)}
						<div class="center-game-actions" data-testid="center-game-actions">
							<BlackjackActionBar legalActions={table.legalActions} action={blackjackAction} />
						</div>
					{/if}
					{#if table.result}
						<div class="alert alert-info mx-auto mt-3 max-w-sm" role="status">
							{table.result.winnerName === 'Dealer'
								? 'Dealer wins this round'
								: table.result.winnerName === 'Push'
									? 'Push — bets returned'
									: `${table.result.winnerName} wins`}
						</div>
						<div class="mt-2 flex justify-center gap-2">
							<button class="btn btn-ghost btn-xs" onclick={toggleReady}
								>{selfReady ? 'Ready ✓' : 'I’m ready'}</button
							>
							{#if table.hostId === socket.playerId}<button
									class="btn btn-primary btn-sm"
									onclick={startGameHandler}
									disabled={!table.legalActions.start || !allReadyToStart}>Deal again</button
								>{/if}
						</div>
					{/if}
				{:else if table.gameType === 'rummy'}
					<div class="flex items-center justify-center gap-4">
						<div class="text-center">
							<p class="text-base-content/50 mb-1 text-[10px] uppercase">Wild rank</p>
							<span class="badge badge-primary">{rankLabel(table.wildRank ?? 0)}</span>
						</div>
						<div class="text-center">
							<p class="text-base-content/50 mb-1 text-[10px] uppercase">Stock</p>
							<span class="badge badge-outline">{table.stockCount ?? 0}</span>
						</div>
						<div class="text-center">
							<p class="text-base-content/50 mb-1 text-[10px] uppercase">Discard</p>
							{#if table.discardPile?.[0]}<PlayingCard
									rank={table.discardPile[0].rank}
									suit={table.discardPile[0].suit}
									class="!h-14 !w-10"
								/>{:else}<span>—</span>{/if}
						</div>
					</div>
					<p class="mt-2 text-xs">
						{table.usersList[table.currentPlayer]?.username ?? 'Waiting'}’s turn
					</p>
					{#if table.result}
						<div class="alert alert-success mx-auto mt-2 max-w-sm" role="status">
							{table.result.winnerName} wins · {table.result.reason}
						</div>
						<div class="mt-2 flex justify-center gap-2">
							<button class="btn btn-ghost btn-xs" onclick={toggleReady}
								>{selfReady ? 'Ready ✓' : 'I’m ready'}</button
							>{#if table.hostId === socket.playerId}<button
									class="btn btn-primary btn-sm"
									onclick={startGameHandler}
									disabled={!table.legalActions.start || !allReadyToStart}>New round</button
								>{/if}
						</div>
					{/if}
				{/if}
			{/snippet}
			{#snippet seat(user)}
				{#if table.gameType === 'texas-holdem' || table.gameType === 'blackjack'}
					<PokerSeat
						{user}
						selfId={socket.playerId}
						active={user.id === table.usersList[table.currentPlayer]?.id}
						game={table.gameType === 'blackjack' ? 'blackjack' : 'poker'}
						showMedia={!!mediaState && ['connected', 'reconnecting'].includes(mediaState.status)}
						mediaParticipant={mediaState?.participants.find((p) => p.identity === user.id)}
					/>
				{:else if table.gameType === 'rummy'}
					<RummySeat
						{user}
						selfId={socket.playerId}
						active={user.id === table.usersList[table.currentPlayer]?.id}
						showMedia={!!mediaState && ['connected', 'reconnecting'].includes(mediaState.status)}
						mediaParticipant={mediaState?.participants.find((p) => p.identity === user.id)}
					/>
				{/if}
			{/snippet}
		</TableScene>
	{/if}

	{#if roomData?.isStarted && roomData.gameType === 'texas-holdem' && roomData.currentPlayer === roomData.usersList.findIndex((user) => user.id === socket.playerId)}
		<PokerActionBar legalActions={roomData.legalActions} bind:raiseTo action={pokerAction} />
	{/if}

	{#if roomData?.isStarted && roomData.gameType === 'rummy'}
		{@const me = roomData.usersList.find((user) => user.id === socket.playerId)}
		{#if me}
			<RummyActionBar
				user={me}
				stockCount={roomData.stockCount ?? 0}
				legalActions={roomData.legalActions}
				connected={socket.connected}
				action={rummyAction}
			/>
		{/if}
	{/if}

	{#if roomData && !roomData.isStarted}
		<div class="card bg-base-100 border-primary/20 mx-auto mt-6 max-w-lg shadow-xl">
			<div class="card-body p-6">
				<h2 class="card-title text-primary mb-4 justify-center">
					<Swords class="h-5 w-5" /> Game Settings
				</h2>
				{#if (!roomData.isStarted || roomData.gameShow) && self}
					<div
						class="bg-base-200 rounded-box flex flex-wrap items-center justify-between gap-3 p-4"
						data-testid="lobby-ready"
					>
						<div>
							<p class="font-semibold">Lobby readiness</p>
							<p class="text-base-content/60 text-xs" aria-live="polite">
								{readyPlayers.length} connected · {roomData.usersList.filter((user) => user.ready)
									.length} ready · {roomData.usersList.length}/6 seats
							</p>
						</div>
						<button
							class="btn btn-sm {selfReady ? 'btn-success' : 'btn-outline btn-primary'}"
							onclick={toggleReady}
							disabled={!socket.connected}
							data-testid="ready-toggle"
						>
							{selfReady ? 'Ready ✓' : 'I’m ready'}
						</button>
					</div>
				{/if}
				<form class="flex flex-col gap-4">
					{#if roomData.gameType === 'blackjack'}
						<div class="form-control w-full">
							<label class="label" for="blackjack-wager"
								><span class="label-text font-semibold">Your even wager</span></label
							>
							<div class="join w-full">
								<input
									id="blackjack-wager"
									class="input join-item w-full"
									type="number"
									min="2"
									step="2"
									max={self?.balance ?? 2}
									bind:value={blackjackWager}
									disabled={!roomData.legalActions.setBet || !self || !socket.connected}
								/>
								<button
									type="button"
									class="btn btn-secondary join-item"
									onclick={setBlackjackWager}
									disabled={!roomData.legalActions.setBet || !socket.connected}
									>Set wager · {self?.wager ?? 2}</button
								>
							</div>
							<p class="text-base-content/50 mt-1 text-xs">
								Dealer stands on soft 17. Natural blackjack pays 3:2.
							</p>
						</div>
					{/if}
					{#if roomData.gameType === 'rummy'}
						<p class="text-base-content/60 text-center text-sm">
							13 cards · two sequences required · one pure sequence required · maximum 6 players
						</p>
					{/if}
					<button
						class="btn btn-primary mt-4 w-full font-bold tracking-widest uppercase"
						onclick={startGameHandler}
						disabled={!socket.connected || !roomData.legalActions.start || !allReadyToStart}
					>
						<Play class="h-4 w-4" /> Start Game
					</button>
					{#if !roomData.isStarted && roomData.hostId === socket.playerId}
						<p class="text-base-content/50 text-center text-xs" role="status">
							{allReadyToStart
								? 'Everyone is ready. You can start the hand.'
								: 'At least two connected players must be ready before the host can start.'}
						</p>
					{/if}
				</form>
			</div>
		</div>
	{/if}

	{#if roomData && !roomData.isStarted}
		<UsersTable usersList={roomData.usersList} table={roomData.table} hostId={roomData.hostId} />
	{/if}
{/if}

<style>
	.tp-settings {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		border-top: 1px solid rgb(255 255 255 / 8%);
		padding-top: 0.9rem;
	}
	.tp-settings-title {
		color: rgb(241 235 220 / 60%);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.tp-variants {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.tp-variant {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
		border: 1px solid rgb(255 255 255 / 8%);
		border-radius: 0.7rem;
		padding: 0.55rem 0.7rem;
		cursor: pointer;
	}
	.tp-variant.on {
		border-color: rgb(240 200 110 / 60%);
		background: rgb(240 200 110 / 8%);
	}
	.tp-variant input {
		margin-top: 0.25rem;
		accent-color: #e2b862;
	}
	.tp-variant span {
		display: flex;
		flex-direction: column;
		font-size: 0.88rem;
	}
	.tp-variant small,
	.tp-note {
		color: rgb(241 235 220 / 55%);
		font-size: 0.75rem;
	}
	.room-header {
		padding-block: 0.5rem;
	}
	:global(.room-media-panel) {
		margin-top: 0.5rem;
		padding: 0.5rem;
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.room-header {
			position: relative;
			top: auto;
			gap: 0.2rem;
			padding-block: 0.25rem;
		}
		.room-waiting {
			display: none;
		}
		:global(.room-media-panel) {
			margin-top: 0.25rem;
			padding: 0.25rem 0.5rem;
		}
		:global(.room-media-title),
		:global(.room-media-status) {
			display: none;
		}
		:global(.room-media-panel .btn) {
			min-height: 1.45rem;
			height: 1.45rem;
			padding-inline: 0.35rem;
			font-size: 0.62rem;
		}
		:global(.room-media-panel .flex) {
			gap: 0.15rem;
		}
		:global(.room-media-panel .btn) {
			font-size: 0.55rem;
		}
	}
</style>
