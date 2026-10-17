<script lang="ts">
	import { page } from '$app/state';
	import BotPicker from '#lib/bots/BotPicker.svelte';
	import type { ClubBot } from '#lib/bots/types.js';
	import { properName } from '#lib/names.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { displayToast } from '#lib/components/Toasts/index.js';
	import { validateRoomAccess } from '#lib/utils/room.js';
	import { type RulesVersion } from '#lib/variant-catalog.js';
	import {
		ArrowRight,
		ChevronDown,
		Settings2,
		Link2,
		Users,
		Copy,
		Share2,
		Check,
		Mail
	} from '@lucide/svelte';
	import { club } from '#lib/club/club.svelte.js';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import FriendPicker from '#lib/club/FriendPicker.svelte';
	import { profileModal } from '#lib/club/profile-modal.svelte.js';
	import { stageJoinName, roomCodeFrom, stageInviteFriends } from './player-name.js';
	import { track } from '#lib/analytics.js';

	/**
	 * Everything needed to get to a table: you (from your club profile), one tap to start (or play bots),
	 * or paste a friend's link. Settings exist, folded away, with sensible defaults.
	 */
	let { onclose }: { onclose?: () => void } = $props();

	// Members only reach this panel signed in; the table shows the club nickname.
	const name = $derived(club.member?.nickname ?? '');
	let busy = $state<'start' | 'bots' | 'join' | 'invite' | null>(null);
	let link = $state('');
	let inviteRoom = $state('');
	let inviteUrl = $state('');
	let copied = $state(false);
	/** Club friends picked in the invite card; invited once you are seated. */
	let pickedFriends = $state<string[]>([]);
	/** Set when an invite link was opened without a name on this device. */
	let joinCode = $state('');
	let showSettings = $state(false);

	// Table settings (folded away). Defaults come from the club owner's Admin page.
	let table = $state<number>(club.settings.table.chips);
	let boot = $state<number>(club.settings.table.boot);
	let potLimit = $state<number>(club.settings.table.potLimit);
	// Follow the club defaults as they load, until you open Table settings to change them.
	let customized = false;
	$effect(() => {
		if (showSettings) customized = true;
	});
	$effect(() => {
		const defaults = club.settings.table;
		if (customized || showSettings) return;
		table = defaults.chips;
		boot = defaults.boot;
		potLimit = defaults.potLimit;
	});
	let pickedBots = $state<string[]>([]);
	let botOptions = $state<ClubBot[]>([]);
	let botPickerOpen = $state(false);
	onMount(() => {
		void club.request('/bots').then(({response, body}) => {
			if (!response.ok) return;
			botOptions = body.bots;
			const requested = page.url.searchParams.get('bot');
			pickedBots = requested && botOptions.some(bot => bot.botId === requested) ? [requested] : botOptions.slice(0, 3).map(bot => bot.botId);
		}).catch(() => {});
	});
	const BOOTS = [5, 10, 20, 50, 100];
	const LIMITS = [0, 64, 128, 256, 512];
	// Every Teen Patti room opens with Classic. Variant choice belongs between hands.
	let rulesVersion: RulesVersion = 'classic-1';
	let gameType = $state<'teen-patti' | 'texas-holdem' | 'blackjack' | 'rummy'>('teen-patti');
	const minimumBuyIn = $derived(gameType === 'teen-patti' ? 1000 : 50);
	const summary = $derived(
		gameType === 'teen-patti'
			? `₹${table.toLocaleString('en-IN')} chips · boot ₹${boot} · ${potLimit ? `limit ₹${(potLimit * boot).toLocaleString('en-IN')}` : 'no limit'}`
			: { 'texas-holdem': 'Texas Hold’em', blackjack: 'Blackjack', rummy: 'Indian Rummy' }[gameType]
	);

	onMount(() => {
		const code = roomCodeFrom(new URLSearchParams(window.location.search).get('join') ?? '');
		if (code) joinCode = code;
		// Connect early so tapping Start is instant. The room page owns the socket afterwards.
		socket.connect();
	});

	function needName() {
		return !name;
	}

	async function create(withBots: boolean, forInvite = false) {
		if (busy || needName()) return;
		if (!Number.isSafeInteger(table) || table < minimumBuyIn) {
			showSettings = true;
			displayToast(
				`Starting chips must be at least ₹${minimumBuyIn.toLocaleString('en-IN')}`,
				'error'
			);
			return;
		}
		if (gameType === 'teen-patti' && boot * 20 > table) {
			showSettings = true;
			displayToast('Pick a smaller boot or more starting chips (boot ≤ 1/20 of chips)', 'error');
			return;
		}
		busy = forInvite ? 'invite' : withBots ? 'bots' : 'start';
		// Teen Patti rooms seat players ready, show the turn clock and use the chosen boot.
		const tableArgs = gameType === 'teen-patti' ? [{ boot, autoReady: true, potLimit }] : [];
		const result = await socket.command(
			'createRoom',
			['', table, rulesVersion, gameType, ...tableArgs],
			false
		);
		busy = null;
		if (!result.ok || !result.roomName) {
			displayToast(result.error || 'Could not start a table. Try again', 'error');
			return;
		}
		track('table_create', { game_type: gameType, with_bots: withBots, invite: forInvite });
		stageJoinName(result.roomName, name);
		if (forInvite) {
			inviteRoom = result.roomName;
			inviteUrl = new URL(`/${result.roomName}`, window.location.origin).href;
			copied = false;
			return;
		}
		onclose?.();
		const practice =
			withBots && gameType === 'teen-patti' ? `?bots=${pickedBots.join(',')}` : '';
		await goto(`/${result.roomName}${practice}`);
	}

	async function copyInvite() {
		try {
			await navigator.clipboard.writeText(inviteUrl);
			copied = true;
		} catch {
			displayToast('Select and copy the invite link below', 'error');
		}
	}

	async function shareInvite() {
		if (!navigator.share) return copyInvite();
		try {
			await navigator.share({
				title: 'Chalo, let’s play!',
				text: 'Join me for a game. Your seat is waiting!',
				url: inviteUrl
			});
		} catch (error) {
			if (!(error instanceof Error && error.name === 'AbortError')) await copyInvite();
		}
	}

	async function enterInviteTable() {
		stageInviteFriends(inviteRoom, pickedFriends);
		await join(inviteRoom);
	}

	async function join(code: string) {
		if (busy || needName()) return;
		busy = 'join';
		const access = await validateRoomAccess(code, socket);
		busy = null;
		if (access?.error) {
			displayToast(access.error, 'error');
			return;
		}
		stageJoinName(code, name);
		onclose?.();
		await goto(`/${code}`);
	}

	// A pasted invite link (or full 32-character code) joins on its own — no extra tap.
	$effect(() => {
		const code = roomCodeFrom(link);
		if (code && /^[0-9a-f]{32}$/.test(code)) void join(code);
	});
</script>

<div class="start-panel">
	<header class="head">
		<span class="suits" aria-hidden="true">♠ ♥ ♦ ♣</span>
		<h2>{joinCode ? 'Your seat is waiting' : 'Chalo, let’s play!'}</h2>
		<p>
			{joinCode ? 'One tap and you’re in.' : 'One tap and you’re at the table.'}
		</p>
	</header>

	<button type="button" class="playing-as" onclick={() => (profileModal.open = true)}>
		<CharacterAvatar
			photoDataUrl={club.member?.photoDataUrl}
			characterId={club.member?.characterId}
			size={40}
		/>
		<span><small>Playing as</small><strong>{properName(name)}</strong></span>
		<span class="edit">Edit</span>
	</button>

	{#if joinCode}
		<div class="actions">
			<button
				id="join-table-btn"
				class="big gold"
				onclick={() => join(joinCode)}
				disabled={!socket.connected || !!busy}
			>
				<span class="emoji" aria-hidden="true">♠</span>
				<span>
					{busy === 'join' ? 'Taking your seat…' : 'Join the table'}
					<small>Your friend is waiting</small>
				</span>
			</button>
			<button type="button" class="text-btn start-own" onclick={() => (joinCode = '')}
				>Start your own table instead</button
			>
		</div>
	{:else}
		<div class="actions">
			<button
				id="create-room-btn"
				class="big gold"
				onclick={() => create(false)}
				disabled={!socket.connected || !!busy}
			>
				<span class="emoji" aria-hidden="true">♠</span>
				<span>
					{busy === 'start' ? 'Starting…' : 'Start a table'}
					<small>Invite your friends next</small>
				</span>
			</button>
			{#if inviteRoom}
				<section class="invite-card" aria-label="Invite friends">
					<div class="invite-heading">
						<span class="invite-icon"><Users size={20} /></span>
						<div>
							<h3>Your table is ready</h3>
							<p>Good cards. Better company.</p>
						</div>
					</div>
					<label class="invite-link"
						><span>Send your friends this link</span><input
							aria-label="Your table invite link"
							readonly
							value={inviteUrl}
							onclick={(event) => event.currentTarget.select()}
						/></label
					>
					<div class="invite-tools">
						<button type="button" onclick={copyInvite}
							>{#if copied}<Check size={15} />{:else}<Copy size={15} />{/if}{copied
								? 'Copied!'
								: 'Copy link'}</button
						>
						<button type="button" onclick={shareInvite}><Share2 size={15} />Share invite</button>
					</div>
					<span class="invite-note" role="status"
						>{copied
							? 'Link copied. Send it to your friends.'
							: 'Anyone with the link can join your table.'}</span
					>
					<div class="invite-link">
						<span>Or invite your friends</span>
						<FriendPicker bind:selected={pickedFriends} />
					</div>
					<button type="button" class="enter-table" disabled={!!busy} onclick={enterInviteTable}
						>{#if pickedFriends.length}<Mail size={16} />Invite {pickedFriends.length === 1
								? '1 friend'
								: `${pickedFriends.length} friends`} &amp; go to table{:else}Go to table<ArrowRight
								size={16}
							/>{/if}</button
					>
				</section>
			{:else}
				<button
					type="button"
					class="invite-card invite-trigger"
					onclick={() => create(false, true)}
					disabled={!socket.connected || !!busy}
				>
					<span class="invite-icon"><Users size={21} /></span>
					<span class="invite-copy"
						><strong>{busy === 'invite' ? 'Getting your table ready…' : 'Invite friends'}</strong
						><small>A private table. Your favourite people.</small></span
					>
					<ArrowRight size={18} class="invite-arrow" />
				</button>
			{/if}
			{#if gameType === 'teen-patti'}
				<button
					class="big"
					data-testid="play-bots"
					onclick={() => create(true)}
					disabled={!socket.connected || !!busy || !pickedBots.length}
				>
					<span class="emoji" aria-hidden="true">🤖</span>
					<span>
						{busy === 'bots' ? 'Getting your table ready…' : 'Chaal'}
						<small>{pickedBots.length ? botOptions.filter(bot => pickedBots.includes(bot.botId)).map(bot => bot.name).join(', ') : 'Pick your company'}</small>
					</span>
				</button>
				<button class="text-btn" onclick={() => botPickerOpen = !botPickerOpen}>{botPickerOpen ? 'Done choosing' : 'Choose your opponents'}</button>
				{#if botPickerOpen}<BotPicker selected={pickedBots} onpick={id => pickedBots = pickedBots.includes(id) ? pickedBots.filter(bot => bot !== id) : [...pickedBots, id]} />{/if}
			{/if}
		</div>
	{/if}
	{#if !socket.connected}
		<p class="connect-status" role="status">
			{socket.error ? socket.error : 'Connecting to the table…'}
			{#if socket.error}<button class="text-btn" onclick={() => socket.connect()}>Retry</button
				>{/if}
		</p>
	{/if}

	{#if !joinCode}
		<div class="or"><span>or join a friend</span></div>
		<form
			class="join"
			onsubmit={(event) => {
				event.preventDefault();
				const code = roomCodeFrom(link);
				if (code) void join(code);
				else displayToast('Paste the invite link or room code your friend sent', 'error');
			}}
		>
			<Link2 class="h-4 w-4 opacity-60" />
			<input
				bind:value={link}
				id="roomName"
				type="text"
				placeholder="Paste invite link or code"
				autocomplete="off"
				spellcheck="false"
				aria-label="Invite link or room code"
			/>
			<button id="join-room-btn" type="submit" disabled={!link.trim() || !!busy} aria-label="Join">
				{busy === 'join' ? '…' : ''}<ArrowRight class="h-4 w-4" />
			</button>
		</form>

		<button
			class="settings-toggle"
			onclick={() => (showSettings = !showSettings)}
			aria-expanded={showSettings}
		>
			<Settings2 class="h-4 w-4" />
			<span>Table settings <small>{summary}</small></span>
			<ChevronDown class="chev h-4 w-4 {showSettings ? 'open' : ''}" />
		</button>
		{#if showSettings}
			<div class="settings">
				<label class="row">
					<span>Game</span>
					<select id="gameType" bind:value={gameType}>
						<option value="teen-patti">Teen Patti</option>
						<option value="texas-holdem">Texas Hold’em Poker</option>
						<option value="blackjack">Blackjack</option>
						<option value="rummy">13-card Indian Rummy</option>
					</select>
				</label>
				<p class="hint">
					{gameType === 'texas-holdem'
						? 'Poker rooms use standard Texas Hold’em rules.'
						: gameType === 'blackjack'
							? 'Dealer stands on soft 17. Natural blackjack pays 3:2.'
							: gameType === 'rummy'
								? '13-card Points Rummy: two sequences, one of them pure.'
								: 'Start with Classic Teen Patti. Choose the next variant or let the table pick one at random between hands.'}
				</p>
				<label class="row">
					<span>Starting chips per player</span>
					<input
						id="table"
						type="number"
						min={minimumBuyIn}
						max="1000000"
						step="1"
						bind:value={table}
					/>
				</label>
				{#if gameType === 'teen-patti'}
					<div class="row">
						<span>Boot (chaal starts here)</span>
						<div class="pills" role="radiogroup" aria-label="Boot amount">
							{#each BOOTS as amount (amount)}
								<button
									type="button"
									role="radio"
									aria-checked={boot === amount}
									class:on={boot === amount}
									disabled={amount * 20 > table}
									onclick={() => (boot = amount)}>₹{amount}</button
								>
							{/each}
						</div>
					</div>
					<div class="row">
						<span>Pot limit</span>
						<div class="pills" role="radiogroup" aria-label="Pot limit">
							{#each LIMITS as limit (limit)}
								<button
									type="button"
									role="radio"
									aria-checked={potLimit === limit}
									class:on={potLimit === limit}
									onclick={() => (potLimit = limit)}
									>{limit ? `₹${(limit * boot).toLocaleString('en-IN')}` : 'Off'}</button
								>
							{/each}
						</div>
					</div>

				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.invite-card {
		border: 1px solid rgb(226 184 98 / 28%);
		border-radius: 1rem;
		background: linear-gradient(120deg, #203c2e, #14271f);
		padding: 1rem;
		color: #f1ebdc;
	}
	.invite-trigger,
	.invite-heading {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		text-align: left;
	}
	.invite-trigger {
		width: 100%;
		cursor: pointer;
		transition:
			border-color 160ms ease,
			background 160ms ease;
	}
	.invite-trigger:hover:not(:disabled) {
		border-color: #e2b862;
		background: #254633;
	}
	.invite-trigger:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.invite-icon {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 2.6rem;
		height: 2.6rem;
		border-radius: 0.8rem;
		background: rgb(226 184 98 / 10%);
		color: #edca80;
	}
	.invite-copy {
		flex: 1;
		min-width: 0;
	}
	.invite-copy strong,
	.invite-heading h3 {
		display: block;
		color: #f4d68c;
		font-size: 1rem;
		font-weight: 750;
	}
	.invite-copy small,
	.invite-heading p {
		display: block;
		margin-top: 0.15rem;
		color: #b6c6b8;
		font-size: 0.75rem;
	}
	.invite-trigger :global(.invite-arrow) {
		flex-shrink: 0;
		color: #edca80;
	}
	.invite-link {
		display: block;
		margin-top: 1rem;
	}
	.invite-link > span {
		display: block;
		margin-bottom: 0.4rem;
		color: #b6c6b8;
		font-size: 0.75rem;
	}
	.invite-link input {
		min-width: 0;
		padding: 0.65rem;
		font-size: 0.8rem;
	}
	.invite-tools {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.6rem;
	}
	.invite-tools button,
	.enter-table {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		border-radius: 0.65rem;
		padding: 0.65rem;
		font-size: 0.8rem;
		font-weight: 650;
		cursor: pointer;
	}
	.invite-tools button {
		flex: 1;
		border: 1px solid rgb(226 184 98 / 25%);
		color: #f4d68c;
	}
	.invite-tools button:hover {
		background: rgb(226 184 98 / 10%);
	}
	.invite-note {
		display: block;
		margin-top: 0.65rem;
		color: #b6c6b8;
		font-size: 0.7rem;
	}
	.enter-table {
		width: 100%;
		margin-top: 0.8rem;
		background: #f4d68c;
		color: #24180a;
	}
	.enter-table:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	button:focus-visible {
		outline: 2px solid #f4d68c;
		outline-offset: 3px;
	}

	.start-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		color: #f1ebdc;
	}
	.head {
		text-align: center;
	}
	.suits {
		color: #e2b862;
		font-size: 0.95rem;
		letter-spacing: 0.4em;
	}
	.head h2 {
		margin-top: 0.3rem;
		color: #f4d68c;
		font-size: clamp(1.6rem, 5vw, 2rem);
		font-weight: 850;
		letter-spacing: -0.01em;
	}
	.head p {
		color: rgb(241 235 220 / 65%);
		font-size: 0.95rem;
	}
	input,
	select {
		width: 100%;
		border: 1px solid rgb(241 235 220 / 16%);
		border-radius: 0.9rem;
		background: rgb(0 0 0 / 28%);
		padding: 0.8rem 1rem;
		color: #f1ebdc;
		font-size: 1.05rem;
	}
	input:focus,
	select:focus {
		border-color: rgb(240 200 110 / 70%);
		outline: none;
	}
	.playing-as {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid rgb(241 235 220 / 12%);
		border-radius: 1rem;
		background: rgb(0 0 0 / 22%);
		padding: 0.6rem 0.9rem;
		color: #f1ebdc;
		text-align: left;
	}
	.playing-as span:not(.edit) {
		display: grid;
		flex: 1;
	}
	.playing-as small {
		color: rgb(241 235 220 / 60%);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.playing-as .edit {
		color: #e2b862;
		font-size: 0.85rem;
	}
	.actions {
		display: grid;
		gap: 0.6rem;
	}
	.big {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		border: 1px solid rgb(241 235 220 / 16%);
		border-radius: 1rem;
		background: rgb(255 255 255 / 5%);
		padding: 0.9rem 1.1rem;
		color: #f1ebdc;
		font-size: 1.1rem;
		font-weight: 800;
		text-align: left;
		cursor: pointer;
		transition:
			transform 120ms ease,
			background 160ms ease;
	}
	.big span:last-child {
		display: flex;
		flex-direction: column;
	}
	.big small {
		font-size: 0.78rem;
		font-weight: 550;
		opacity: 0.75;
	}
	.big .emoji {
		display: grid;
		width: 2.6rem;
		height: 2.6rem;
		flex-shrink: 0;
		place-items: center;
		border-radius: 0.8rem;
		background: rgb(0 0 0 / 18%);
		font-size: 1.4rem;
	}
	.big.gold {
		border-color: transparent;
		background: linear-gradient(160deg, #f4d68c, #c99236);
		color: #24180a;
		box-shadow: 0 0.5rem 1.5rem rgb(201 146 54 / 30%);
	}
	.big:hover:not(:disabled) {
		transform: translateY(-1px);
	}
	.big:active:not(:disabled) {
		transform: scale(0.98);
	}
	.big:disabled {
		cursor: wait;
		opacity: 0.6;
	}
	/* Not ".status": the UI library styles that class as a square indicator dot. */
	.connect-status {
		color: rgb(241 235 220 / 60%);
		font-size: 0.82rem;
		text-align: center;
	}
	.start-own {
		align-self: center;
		font-size: 0.8rem;
	}
	.text-btn {
		margin-left: 0.3rem;
		color: #f4d68c;
		text-decoration: underline;
		cursor: pointer;
	}
	.or {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: rgb(241 235 220 / 45%);
		font-size: 0.75rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.or::before,
	.or::after {
		height: 1px;
		flex: 1;
		background: rgb(255 255 255 / 10%);
		content: '';
	}
	.join {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid rgb(241 235 220 / 16%);
		border-radius: 0.9rem;
		background: rgb(0 0 0 / 28%);
		padding: 0.25rem 0.3rem 0.25rem 0.9rem;
	}
	.join input {
		border: 0;
		background: transparent;
		padding: 0.55rem 0;
		font-size: 0.95rem;
	}
	.join button {
		display: grid;
		width: 2.4rem;
		height: 2.4rem;
		flex-shrink: 0;
		place-items: center;
		border-radius: 0.7rem;
		background: #2c5b3d;
		color: #f4d68c;
		cursor: pointer;
	}
	.join button:disabled {
		cursor: default;
		opacity: 0.4;
	}
	.settings-toggle {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
	}
	.settings-toggle span {
		display: flex;
		flex: 1;
		flex-direction: column;
	}
	.settings-toggle small {
		color: rgb(241 235 220 / 45%);
		font-size: 0.72rem;
	}
	.settings-toggle :global(.chev) {
		transition: transform 200ms ease;
	}
	.settings-toggle :global(.chev.open) {
		transform: rotate(180deg);
	}
	.settings {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		border-top: 1px solid rgb(255 255 255 / 8%);
		padding-top: 0.8rem;
	}
	.row {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.82rem;
	}
	.row > span {
		color: rgb(241 235 220 / 70%);
		font-weight: 650;
	}
	.row input,
	.row select {
		padding: 0.55rem 0.8rem;
		font-size: 0.95rem;
	}
	.hint {
		margin-top: -0.4rem;
		color: rgb(241 235 220 / 45%);
		font-size: 0.75rem;
	}
	.pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
	}
	.pills button {
		border: 1px solid rgb(241 235 220 / 16%);
		border-radius: 999px;
		padding: 0.3rem 0.75rem;
		color: rgb(241 235 220 / 80%);
		font-size: 0.8rem;
		font-weight: 650;
		text-transform: capitalize;
		cursor: pointer;
	}
	.pills button.on {
		border-color: transparent;
		background: rgb(240 200 110 / 25%);
		color: #f4d68c;
	}
	.pills button:disabled {
		cursor: not-allowed;
		opacity: 0.35;
	}
</style>
