<!-- Input for create room -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { displayToast } from '#lib/components/Toasts/index.js';
	import { validateRoomAccess } from '#lib/utils/room.js';
	import { type RulesVersion } from '#lib/variant-catalog.js';
	import {
		Spade,
		Heart,
		Club,
		Diamond,
		House,
		Coins,
		ArrowRight,
		Sparkles,
		Users,
		IndianRupee,
		Bot
	} from '@lucide/svelte';

	let roomName = $state<string>('');

	let table = $state<number>(1000);
	/** Teen Patti boot: every player's entry per hand, and the first blind stake. */
	let boot = $state<number>(10);
	const BOOTS = [5, 10, 20, 50, 100];
	// Every Teen Patti room opens with Classic. Variant choice belongs between hands.
	let rulesVersion: RulesVersion = 'classic-1';
	let gameType = $state<'teen-patti' | 'texas-holdem' | 'blackjack' | 'rummy'>('teen-patti');
	const minimumBuyIn = $derived(gameType === 'teen-patti' ? 1000 : 50);
	/** Practice: seat bots and deal as soon as the host takes their seat. */
	let botCount = $state(0);
	let botLevel = $state<'easy' | 'normal' | 'hard'>('normal');

	onMount(() => {
		// Connect here so the "Create Room" button becomes visible once connected.
		// We do NOT disconnect on leave  if the user is navigating to a room,
		// disconnecting here would sever the connection before [roomName] can take over.
		// The [roomName] page owns the full connect/disconnect lifecycle.
		socket.connect();
	});

	async function createRoomHanlder(e: MouseEvent) {
		e.preventDefault();
		if (!Number.isSafeInteger(table) || table < minimumBuyIn) {
			displayToast(
				`Starting chips must be at least ₹${minimumBuyIn.toLocaleString('en-IN')}`,
				'error'
			);
			return;
		}
		if (gameType === 'teen-patti' && boot * 20 > table) {
			displayToast('Pick a smaller boot or more starting chips (boot ≤ 1/20 of chips)', 'error');
			return;
		}
		// Teen Patti rooms seat players ready, show the turn clock and use the chosen boot.
		const tableArgs = gameType === 'teen-patti' ? [{ boot, autoReady: true }] : [];
		const result = await socket.command(
			'createRoom',
			['', table, rulesVersion, gameType, ...tableArgs],
			false
		);
		if (result.ok && result.roomName) {
			goto(
				'/' +
					result.roomName +
					(gameType === 'teen-patti' && botCount > 0 ? `?bots=${botCount}&level=${botLevel}` : '')
			);
		} else displayToast(result.error || 'Could not create room', 'error');
	}

	async function joinRoomHandler(e: MouseEvent) {
		e.preventDefault();
		if (!roomName) {
			displayToast('Could not Join Room: Please enter valid room name', 'error');
			return;
		}

		const roomAcess = await validateRoomAccess(roomName);
		if (roomAcess?.error) {
			displayToast(roomAcess.error, 'error');
			return;
		}

		goto('/' + roomName);
	}
</script>

<!-- Full-page wrapper -->
<div
	class="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-4 py-10"
>
	<!-- Floating decorative suit symbols -->
	<div class="pointer-events-none absolute inset-0 overflow-hidden select-none" aria-hidden="true">
		<Spade
			class="absolute top-[8%] left-[5%] h-[clamp(3rem,8vw,7rem)] w-[clamp(3rem,8vw,7rem)] animate-bounce opacity-[0.04]"
		/>
		<Heart
			class="text-accent absolute top-[15%] right-[8%] h-[clamp(3rem,8vw,7rem)] w-[clamp(3rem,8vw,7rem)] animate-pulse opacity-[0.05]"
		/>
		<Club
			class="absolute bottom-[20%] left-[10%] h-[clamp(3rem,8vw,7rem)] w-[clamp(3rem,8vw,7rem)] animate-bounce opacity-[0.04] [animation-delay:-2s]"
		/>
		<Diamond
			class="text-accent absolute right-[6%] bottom-[10%] h-[clamp(3rem,8vw,7rem)] w-[clamp(3rem,8vw,7rem)] animate-pulse opacity-[0.05] [animation-delay:-1s]"
		/>
		<Spade
			class="absolute top-[50%] left-[2%] h-[clamp(2rem,5vw,5rem)] w-[clamp(2rem,5vw,5rem)] animate-bounce opacity-[0.03] [animation-delay:-3s]"
		/>
		<Diamond
			class="text-accent absolute top-[40%] right-[3%] h-[clamp(2rem,5vw,5rem)] w-[clamp(2rem,5vw,5rem)] animate-pulse opacity-[0.04] [animation-delay:-4s]"
		/>
	</div>

	<!-- Glow halo behind card -->
	<div
		class="bg-primary pointer-events-none absolute z-0 h-96 w-96 animate-pulse rounded-full opacity-10 blur-3xl"
		aria-hidden="true"
	></div>

	<!-- Card panel -->
	<div class="card bg-base-100 border-primary/20 relative z-10 w-full max-w-md border shadow-2xl">
		<div class="card-body gap-6 p-8">
			<!-- Header -->
			<div class="text-center">
				<div class="mb-2 flex justify-center gap-3">
					<Heart class="text-accent h-5 w-5 opacity-60" />
					<Spade class="text-base-content h-5 w-5 opacity-20" />
					<Diamond class="text-accent h-5 w-5 opacity-60" />
					<Club class="text-base-content h-5 w-5 opacity-20" />
				</div>
				<h1
					class="card-title text-primary mb-1 justify-center text-3xl font-extrabold tracking-tight"
				>
					Join the Table
				</h1>
				<p class="text-base-content/50 text-sm">Enter a room to play with friends on Chaal.tech</p>
			</div>

			<!-- Gold divider -->
			<div class="divider text-primary/40 my-0"><Spade class="h-3 w-3" /></div>

			<form class="flex flex-col gap-5">
				<!-- Room Name -->
				<fieldset class="fieldset gap-1">
					<legend
						class="fieldset-legend text-primary/80 text-xs font-semibold tracking-widest uppercase"
						>Game</legend
					>
					<select id="gameType" class="select w-full" bind:value={gameType}>
						<option value="teen-patti">Teen Patti</option>
						<option value="texas-holdem">Texas Hold’em Poker</option>
						<option value="blackjack">Blackjack</option>
						<option value="rummy">13-card Indian Rummy</option>
					</select>
					<p class="text-base-content/50 text-sm">
						{gameType === 'texas-holdem'
							? 'Poker rooms use standard Texas Hold’em rules.'
							: gameType === 'blackjack'
								? 'Play Blackjack with a dealer who stands on soft 17. Natural blackjack pays 3:2.'
								: gameType === 'rummy'
									? 'Play 13-card Indian Points Rummy. Make two sequences, including one pure sequence.'
									: 'Start with Classic Teen Patti. Choose the next variant or let the table pick one at random between hands.'}
					</p>
				</fieldset>

				<fieldset class="fieldset gap-1">
					<legend
						class="fieldset-legend text-primary/80 flex items-center gap-1 text-xs font-semibold tracking-widest uppercase"
					>
						<House class="h-3 w-3" /> Join with Room Code
					</legend>
					<div class="join w-full">
						<input
							bind:value={roomName}
							oninput={() => {
								roomName = roomName.toLowerCase().trim();
							}}
							id="roomName"
							type="text"
							placeholder="Paste a room code"
							class="input join-item w-full"
							autocomplete="off"
							spellcheck="false"
						/>
						<button
							onclick={joinRoomHandler}
							id="join-room-btn"
							type="button"
							class="btn btn-secondary join-item font-bold tracking-wide"
						>
							<ArrowRight class="h-4 w-4" /> Join
						</button>
					</div>
				</fieldset>

				<!-- Table Stakes -->
				<fieldset class="fieldset gap-1">
					<legend
						class="fieldset-legend text-primary/80 flex items-center gap-1 text-xs font-semibold tracking-widest uppercase"
					>
						<Coins class="h-3 w-3" /> Table Stakes
					</legend>
					<label class="input w-full">
						<IndianRupee class="text-primary/60 h-4 w-4" />
						<input
							min={minimumBuyIn}
							max="1000000"
							step="1"
							bind:value={table}
							id="table"
							type="number"
							placeholder="1000"
							class="grow"
						/>
					</label>
					<p class="fieldset-label text-base-content/30 flex items-center gap-1">
						Starting chips per player (<IndianRupee class="h-3 w-3" />{minimumBuyIn.toLocaleString(
							'en-IN'
						)}–10,00,000)
					</p>
				</fieldset>

				{#if gameType === 'teen-patti'}
					<fieldset class="fieldset gap-1">
						<legend
							class="fieldset-legend text-primary/80 flex items-center gap-1 text-xs font-semibold tracking-widest uppercase"
						>
							<Coins class="h-3 w-3" /> Boot (chaal starts here)
						</legend>
						<div class="join w-full" role="radiogroup" aria-label="Boot amount">
							{#each BOOTS as amount (amount)}
								<button
									type="button"
									role="radio"
									aria-checked={boot === amount}
									class="btn join-item flex-1 {boot === amount ? 'btn-primary' : 'btn-outline'}"
									disabled={amount * 20 > table}
									onclick={() => (boot = amount)}>₹{amount}</button
								>
							{/each}
						</div>
						<p class="fieldset-label text-base-content/40">
							Each hand starts with ₹{boot} from everyone. Blind bets ₹{boot}–₹{boot * 2}; seen bets
							₹{boot * 2}–₹{boot * 4}. 60 seconds per turn.
						</p>
					</fieldset>

					<fieldset class="fieldset gap-1" data-testid="practice-bots">
						<legend
							class="fieldset-legend text-primary/80 flex items-center gap-1 text-xs font-semibold tracking-widest uppercase"
						>
							<Bot class="h-3 w-3" /> Practice vs bots
						</legend>
						<div class="join w-full" role="radiogroup" aria-label="Number of bots">
							{#each [0, 1, 2, 3, 4, 5] as count (count)}
								<button
									type="button"
									role="radio"
									aria-checked={botCount === count}
									class="btn btn-sm join-item flex-1 {botCount === count
										? 'btn-primary'
										: 'btn-outline'}"
									onclick={() => (botCount = count)}>{count === 0 ? 'None' : count}</button
								>
							{/each}
						</div>
						{#if botCount > 0}
							<div class="join mt-1 w-full" role="radiogroup" aria-label="Bot difficulty">
								{#each ['easy', 'normal', 'hard'] as const as level (level)}
									<button
										type="button"
										role="radio"
										aria-checked={botLevel === level}
										class="btn btn-sm join-item flex-1 capitalize {botLevel === level
											? 'btn-secondary'
											: 'btn-outline'}"
										onclick={() => (botLevel = level)}>{level}</button
									>
								{/each}
							</div>
						{/if}
						<p class="fieldset-label text-base-content/40">
							{botCount > 0
								? `${botCount} ${botLevel} bot${botCount > 1 ? 's' : ''} join and the first hand is dealt as soon as you sit down. Friends can still join between hands.`
								: 'No bots — wait for friends. You can add bots at the table any time.'}
						</p>
					</fieldset>
				{/if}

				{#if gameType === 'texas-holdem'}
					<p class="text-base-content/50 text-sm">
						Texas Hold’em uses two private cards, community cards, and standard poker hand rankings.
					</p>
				{/if}
				{#if gameType === 'blackjack' || gameType === 'rummy'}
					<p class="text-base-content/50 text-sm">
						{gameType === 'blackjack'
							? 'Blackjack uses standard 52-card decks, dealer stands on soft 17, and a natural pays 3:2.'
							: 'Indian Rummy deals 13 cards. Draw and discard to form valid sequences and sets.'}
					</p>
				{/if}

				<div class="mt-1">
					{#if socket.connected}
						<button
							id="create-room-btn"
							class="btn btn-primary w-full text-base font-bold tracking-widest uppercase"
							onclick={createRoomHanlder}
							type="button"
						>
							<Sparkles class="h-4 w-4" /> Create Room
						</button>
					{:else if socket.error}
						<div class="space-y-3" role="alert">
							<p class="text-error text-center text-sm">{socket.error}</p>
							<button class="btn btn-outline w-full" onclick={() => socket.connect()} type="button">
								Retry connection
							</button>
						</div>
					{:else}
						<div class="btn btn-disabled w-full" aria-busy="true" aria-label="Connecting...">
							<span class="loading loading-spinner loading-sm"></span>
							Connecting...
						</div>
					{/if}
				</div>
			</form>

			<!-- Footer hint -->
			<p
				class="text-base-content/25 mt-1 flex items-center justify-center gap-1 text-center text-xs"
			>
				<Users class="h-3 w-3" /> New rooms get a private invite code you can share with friends
			</p>
		</div>
	</div>
</div>
