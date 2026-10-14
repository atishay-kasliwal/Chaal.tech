<script lang="ts">
	import { onMount } from 'svelte';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { displayToast } from '#lib/components/Toasts/index.js';
	import { goto } from '$app/navigation';
	import UsernameForm from './UsernameForm.svelte';
	import UsersTable from './UsersTable.svelte';
	import DeclareWinner from './DeclareWinner.svelte';
	import PlayerSeat from '#lib/components/PlayerSeat.svelte';
	import PokerSeat from '#lib/components/PokerSeat.svelte';
	import PlayingCard from '#lib/components/PlayingCard.svelte';
	import TableScene from '#lib/components/TableScene.svelte';
	import MobileActionBar from '#lib/components/MobileActionBar.svelte';
	import PokerActionBar from '#lib/components/PokerActionBar.svelte';
	import { VARIANT_BY_VERSION, VARIANT_CATALOG, type RulesVersion } from '#lib/variant-catalog.js';
	import RoomMedia from '#lib/components/RoomMedia.svelte';
	import type { MediaState } from '#lib/media/controller.js';
	let mediaState = $state.raw<MediaState | null>(null);
	import { fly } from 'svelte/transition';
	import { LogOut, Coins, Users, Play, Crown, Swords, Copy } from '@lucide/svelte';

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

	/** Stake / Chal value that player wants to wager */
	let chal = $state<number>(1);

	/** Users who are still in the game */
	const usersPlaying = $derived.by((): Array<User> => {
		if (roomData && roomData.usersList) {
			return roomData.usersList.filter(({ isPacked }) => !isPacked);
		}

		return [];
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
	function seeCardsHandler() {
		void sendAction('seeCards');
	}
	function chalHandler() {
		void sendAction('play', [false, chal]);
	}
	function showHandler() {
		void sendAction('show', [data.roomName]);
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
	function packHandler() {
		if (confirm('Do you want to Pack ?')) void sendAction('play', [true]);
	}
	function pokerAction(action: 'fold' | 'check' | 'call' | 'raise') {
		void sendAction('pokerAction', action === 'raise' ? [action, raiseTo] : [action]);
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
			chal = snapshot.legalActions.minBet ?? 1;
			raiseTo = Math.min(
				snapshot.legalActions.minRaiseTo ?? 4,
				snapshot.legalActions.maxRaiseTo ?? 4
			);
			lastRevision = snapshot.revision;
		}
	});
	onMount(() => {
		socket.enterRoom(data.roomName);
		return () => {
			socket.disconnect();
		};
	});
</script>

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
	<TableScene players={table.usersList} selfId={socket.playerId}>
		{#snippet center()}
			<h2
				class="text-primary text-2xl font-extrabold tracking-tight"
				class:sr-only={!!table.result}
			>
				{table.gameType === 'texas-holdem' ? 'Texas Hold’em' : 'Teen Patti'}
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
						<button class="btn btn-ghost btn-xs" onclick={toggleReady} disabled={!socket.connected}
							>{selfReady ? 'Ready ✓' : 'I’m ready'}</button
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
			{:else}
				{#if table.variantState?.indicator}
					{#if !table.result}<p class="text-primary mb-3 text-xs" data-testid="joker-indicator">
							Wild rank: {rankLabel(table.variantState.wildRank)}
						</p>{/if}
				{/if}
				{#if table && !table.result}
					<div
						class="bg-base-200 flex items-center gap-2 rounded-lg px-3 py-2 text-xs md:gap-4 md:px-4 md:text-sm"
					>
						<div class="flex items-center gap-1 font-semibold">
							<Coins class="text-primary h-4 w-4" /> Pot:
							<div class="grid overflow-hidden px-1">
								{#key table.pot}
									<span
										class="col-start-1 row-start-1"
										in:fly={{ y: -15, duration: 300 }}
										out:fly={{ y: 15, duration: 300 }}
									>
										{table.pot || 0}
									</span>
								{/key}
							</div>
						</div>
						<div class="divider divider-horizontal m-0"></div>
						<div class="flex items-center gap-1 font-semibold">
							<Users class="text-accent h-4 w-4" />
							{usersPlaying.length}
						</div>
					</div>
				{/if}
				{#if table.result}
					<div class="compact-winner"><DeclareWinner result={table.result} /></div>
					<div
						class="next-round-panel border-primary/20 bg-base-100/70 mx-auto mt-3 w-full max-w-md rounded-xl border p-3 text-left"
						data-testid="next-round-controls"
					>
						<p class="mb-2 text-xs font-bold tracking-wide uppercase">Next round</p>
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
							<select
								id="nextVariant"
								aria-label="Next round variant"
								class="select select-sm mt-2 w-full"
								bind:value={nextRulesVersion}
								disabled={!socket.connected || socket.playerId !== table.hostId}
							>
								{#each VARIANT_CATALOG as variant (variant.rulesVersion)}
									<option value={variant.rulesVersion}>{variant.selectionLabel}</option>
								{/each}
							</select>
						{:else}
							<p class="text-base-content/60 mt-2 text-xs">
								The server will pick a Teen Patti variant at random for the next hand.
							</p>
						{/if}
						<div class="mt-2 flex items-center justify-between gap-2">
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
									data-testid="next-round-start">Start next round</button
								>
							{/if}
						</div>
						{#if table.hostId === socket.playerId && !allReadyToStart}<p
								class="text-base-content/50 mt-1 text-[10px]"
							>
								Everyone must be ready before the next hand.
							</p>{/if}
					</div>
				{:else}
					<p class="text-base-content/60 mt-4 text-xs" aria-live="polite">
						{table.usersList[table.currentPlayer]?.username || 'Waiting'}’s turn
					</p>
				{/if}
			{/if}
		{/snippet}
		{#snippet seat(user)}
			{#if table.gameType === 'texas-holdem'}
				<PokerSeat
					{user}
					selfId={socket.playerId}
					active={user.id === table.usersList[table.currentPlayer]?.id}
					showMedia={!!mediaState && ['connected', 'reconnecting'].includes(mediaState.status)}
					mediaParticipant={mediaState?.participants.find((p) => p.identity === user.id)}
				/>
			{:else}
				<PlayerSeat
					{user}
					selfId={socket.playerId}
					active={user.id === table.usersList[table.currentPlayer]?.id}
					gameShow={table.gameShow}
					legalActions={table.legalActions}
					connected={socket.connected}
					twoRemaining={usersPlaying.length === 2}
					bind:chal
					showMedia={!!mediaState && ['connected', 'reconnecting'].includes(mediaState.status)}
					mediaParticipant={mediaState?.participants.find((p) => p.identity === user.id)}
					actions={{ seeCardsHandler, packHandler, chalHandler, showHandler }}
				/>
			{/if}
		{/snippet}
	</TableScene>
{/if}

{#if roomData?.isStarted && roomData.gameType === 'texas-holdem' && roomData.currentPlayer === roomData.usersList.findIndex((user) => user.id === socket.playerId)}
	<PokerActionBar legalActions={roomData.legalActions} bind:raiseTo action={pokerAction} />
{/if}

{#if roomData?.isStarted && roomData.gameType !== 'texas-holdem'}
	{@const me = roomData.usersList.find((user) => user.id === socket.playerId)}
	{#if me && !me.isPacked}
		<MobileActionBar
			user={me}
			selfId={socket.playerId}
			active={me.id === roomData.usersList[roomData.currentPlayer]?.id}
			gameShow={roomData.gameShow}
			legalActions={roomData.legalActions}
			connected={socket.connected}
			twoRemaining={usersPlaying.length === 2}
			bind:chal
			actions={{ seeCardsHandler, packHandler, chalHandler, showHandler }}
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
				{#if roomData.gameType !== 'texas-holdem'}
					<div class="form-control w-full" data-testid="variant-settings">
						<div class="label" id="next-hand-label">
							<span class="label-text font-semibold">Next hand</span>
						</div>
						<div class="join w-full" aria-label="Choose next-hand mode">
							<button
								type="button"
								class="btn join-item flex-1 {nextVariantMode === 'selected'
									? 'btn-primary'
									: 'btn-outline'}"
								onclick={() => (nextVariantMode = 'selected')}
								disabled={!socket.connected || roomData.hostId !== socket.playerId}
								>Choose variant</button
							>
							<button
								type="button"
								class="btn join-item flex-1 {nextVariantMode === 'random'
									? 'btn-primary'
									: 'btn-outline'}"
								onclick={() => (nextVariantMode = 'random')}
								disabled={!socket.connected || roomData.hostId !== socket.playerId}
								>Random variant</button
							>
						</div>
						{#if nextVariantMode === 'selected'}
							<select
								id="nextVariant"
								aria-label="Next hand variant"
								class="select mt-2 w-full"
								bind:value={nextRulesVersion}
								disabled={!socket.connected || roomData.hostId !== socket.playerId}
							>
								{#each VARIANT_CATALOG as variant (variant.rulesVersion)}
									<option value={variant.rulesVersion}>{variant.selectionLabel}</option>
								{/each}
							</select>
						{:else}
							<p class="text-base-content/50 mt-1 text-xs">
								The server chooses a different Teen Patti variant at random when the hand starts.
							</p>
						{/if}
						<p class="text-base-content/50 mt-1 text-xs">
							{nextVariantMode === 'selected'
								? VARIANT_BY_VERSION[nextRulesVersion]?.description
								: 'Every variant keeps the same room, seats, chips and controls.'}
						</p>
					</div>
				{/if}
				{#if roomData.gameType !== 'texas-holdem' && nextVariantMode === 'selected'}
					<div class="form-control w-full">
						<label class="label" for="cardsToDeal">
							<span class="label-text font-semibold"
								>Cards to Deal: <span class="text-primary">{cardsToDeal}</span></span
							>
						</label>
						<input
							value={cardsToDeal}
							min={cardsToDeal}
							max={cardsToDeal}
							disabled
							type="range"
							id="cardsToDeal"
							class="range range-primary"
						/>
					</div>
				{/if}
				{#if roomData.gameType !== 'texas-holdem' && nextVariantMode === 'random'}
					<p class="text-base-content/60 text-center text-xs">
						Cards per player are set by the randomly selected variant.
					</p>
				{/if}
				{#if roomData.gameType !== 'texas-holdem'}
					<div class="form-control w-full">
						<label class="label" for="cutAt">
							<span class="label-text font-semibold"
								>Cut At: <span class="text-primary">{cutAt}</span></span
							>
						</label>
						<input
							bind:value={cutAt}
							required
							type="range"
							id="cutAt"
							min="0"
							max={52 - cardsToDeal * (roomData?.usersList?.length || 1)}
							class="range range-primary"
						/>
					</div>
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

<style>
	.room-header {
		padding-block: 0.5rem;
	}
	:global(.room-media-panel) {
		margin-top: 0.5rem;
		padding: 0.5rem;
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.room-header {
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
	.compact-winner :global(.card) {
		margin-top: 0.35rem;
	}
	.compact-winner :global(.card-body) {
		gap: 0.15rem;
		padding: 0.45rem;
	}
	.compact-winner :global(.card-title) {
		margin-bottom: 0.15rem;
		font-size: 1rem;
	}
	.next-round-panel {
		padding: 0.6rem;
	}
</style>
