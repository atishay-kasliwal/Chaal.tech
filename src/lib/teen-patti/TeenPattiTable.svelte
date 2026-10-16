<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import {
		Copy,
		LogOut,
		Volume2,
		VolumeX,
		BookOpen,
		Trophy,
		Settings,
		X,
		Pause,
		Play,
		UserPlus,
		Sparkles,
		Mail,
		Share2,
		Bot
	} from '@lucide/svelte';
	import type { MediaState } from '#lib/media/controller.js';
	import { VARIANT_BY_VERSION, type RulesVersion } from '#lib/variant-catalog.js';
	import { arrangeSeats } from '#lib/seat-layout.js';
	import TpSeat from './TpSeat.svelte';
	import CasinoChip from '#lib/components/CasinoChip.svelte';
	import ChipStack from '#lib/components/ChipStack.svelte';
	import FriendPicker from '#lib/club/FriendPicker.svelte';
	import { club } from '#lib/club/club.svelte.js';
	import BotAvatar from './BotAvatar.svelte';
	import SeatVideo from '#lib/components/SeatVideo.svelte';
	import ActionDock from './ActionDock.svelte';
	import {
		money,
		signedMoney,
		rankLabel,
		balanceLabel,
		coversBoot,
		hasChips,
		prefersHiddenBalance,
		rememberHiddenBalance
	} from './format.js';
	import { handName, NAMED_VARIANTS, HAND_RANKINGS, RANKING_EXAMPLES } from './hands.js';
	import ClassicCard from '#lib/components/ClassicCard.svelte';
	import { describeChange, type FeedEvent } from './feed.js';
	import { opponentPoints, SELF_POINT, POT_POINT } from './layout.js';
	import { play, soundEnabled, setSoundEnabled } from './sound.js';

	let {
		room,
		selfId,
		connected,
		mediaState,
		autoDeal = $bindable(true),
		media,
		settings,
		nextVariant = 'Classic',
		send,
		ondeal,
		oninvite,
		onleave,
		emailInvites
	}: {
		room: RoomData;
		selfId: string;
		connected: boolean;
		mediaState: MediaState | null;
		/** Host preference: deal the next hand automatically after a short pause. */
		autoDeal?: boolean;
		media: Snippet;
		settings: Snippet;
		/** Name of the variant the host will deal next ("Random" when the server picks). */
		nextVariant?: string;
		send: (event: string, args?: unknown[]) => Promise<boolean>;
		ondeal: () => Promise<boolean>;
		oninvite: () => void;
		onleave: () => void;
		/** Sends (or, with no addresses, lists) email invites through the room server. */
		emailInvites: (emails: string[], memberIds?: string[]) => Promise<InviteReply>;
	} = $props();

	type InviteReply = {
		ok: boolean;
		error?: string;
		sent?: string[];
		skipped?: string[];
		invites?: { email: string; at: number }[];
	};

	// ——— Derived table state ———
	const me = $derived(room.usersList.find((user) => user.id === selfId));
	const isHost = $derived(room.hostId === selfId);
	const boot = $derived(room.boot ?? 1);
	const live = $derived(room.isStarted && !room.gameShow);
	const current = $derived(live ? room.usersList[room.currentPlayer] : undefined);
	const myTurn = $derived(!!me && current?.id === me.id);
	const opponents = $derived(
		arrangeSeats(room.usersList, selfId).filter((entry) => entry.user.id !== selfId)
	);
	const variant = $derived(VARIANT_BY_VERSION[room.rulesVersion as RulesVersion]);
	const namesHands = $derived(NAMED_VARIANTS.has(room.rulesVersion));
	const inHand = (user: User) => user.cardsInHand.length > 0;
	// The server names hands for every variant; the local namer covers older rooms.
	const nameOf = (user: User | undefined) =>
		user?.handName ??
		(user && namesHands && user.cardsInHand.length === 3 ? handName(user.cardsInHand) : null);
	const eligible = $derived(
		room.usersList.filter(
			(user) =>
				user.connected &&
				!user.hasLeft &&
				coversBoot(user, boot) &&
				(room.autoReady ? user.ready !== false : user.ready === true)
		)
	);
	const canDeal = $derived(
		isHost &&
			connected &&
			room.legalActions.start &&
			eligible.length >= 2 &&
			(room.autoReady ||
				room.usersList
					.filter((user) => user.connected && !user.hasLeft && hasChips(user))
					.every((user) => user.ready === true))
	);
	const result = $derived(room.result);
	const revealed = $derived(new Set(result?.revealedPlayerIds ?? []));
	const winner = $derived(
		result ? room.usersList.find((user) => user.id === result.winnerId) : undefined
	);
	const resultDetail = $derived.by(() => {
		if (!result) return '';
		if (result.reason === 'last-player') return 'Everyone else packed';
		if (result.reason === 'pot-limit-split')
			return `Pot limit reached — equal best hands${nameOf(winner) ? ` (${nameOf(winner)})` : ''}, pot split`;
		if (result.reason === 'pot-limit')
			return `Pot limit reached — everyone showed${nameOf(winner) ? `; ${nameOf(winner)} is best` : ''}`;
		// Only the two hands compared at the Show; a player who looked and then packed is not one.
		const shown = room.usersList.filter((user) =>
			revealed.size ? revealed.has(user.id) : user.cardsInHand.some((c) => c.rank > 0)
		);
		const loser = shown.find((user) => user.id !== result.winnerId);
		const winName = nameOf(winner);
		const loseName = nameOf(loser);
		const lowest = room.rulesVersion === 'muflis-1' ? ' (lowest hand wins)' : '';
		if (result.reason === 'show-tie-requester-loses')
			return 'Equal hands — whoever asked for the Show loses';
		if (winName && loseName && winName === loseName)
			return `Both have ${winName} — won on the higher side card${lowest}`;
		if (winName && loseName) return `${winName} beats ${loseName}${lowest}`;
		return 'Won at the show';
	});
	const net = $derived(me ? (me.balance ?? room.table) - room.table : 0);
	const blindStake = $derived(Math.ceil(room.maxStake / 2));
	const potCap = $derived(room.potLimit ? room.potLimit * boot : 0);
	const setPotLimit = (value: number) => void send('setPotLimit', [value]);

	// ——— Chip requests between friends ———
	const askChips = (to: string, amount: number) => void send('requestChips', [to, amount]);
	const cancelAsk = () => void send('cancelChipRequest');
	const answerAsk = (from: string, accept: boolean) =>
		void send('answerChipRequest', [from, accept]);
	const incomingAsks = $derived(
		(room.chipRequests ?? []).filter((request) => request.to === selfId)
	);
	const askerName = (id: string) =>
		room.usersList.find((user) => user.id === id)?.username ?? 'A friend';
	const seenStake = $derived(room.maxStake);

	// ——— Clock, turn timer and auto-deal ———
	let now = $state(Date.now());
	let turnEnds = $state<number | null>(null);
	let lastDeadline: number | null = null;
	let sawSnapshot = false;
	const total = $derived(room.turnMs ?? 60000);
	const remaining = $derived(turnEnds === null ? 0 : Math.max(0, turnEnds - now));

	$effect(() => {
		const deadline = room.deadline;
		untrack(() => {
			if (deadline === lastDeadline) return;
			lastDeadline = deadline;
			if (!deadline) turnEnds = null;
			// A turn that starts while we watch runs the full length from now; one we join
			// mid-way trusts the server deadline, clamped against clock skew.
			else if (sawSnapshot) turnEnds = Date.now() + total - 150;
			else turnEnds = Math.min(Math.max(deadline, Date.now()), Date.now() + total);
			sawSnapshot = true;
		});
	});

	let dealAt = $state<number | null>(null);
	let paused = $state(false);
	let dealingFor: string | null = null;
	let dealError = $state('');
	let lastResultHand: string | null = null;
	const dealIn = $derived(dealAt === null ? null : Math.max(0, Math.ceil((dealAt - now) / 1000)));

	$effect(() => {
		const handId = result?.handId ?? null;
		const reason = result?.reason;
		untrack(() => {
			if (handId === lastResultHand) return;
			lastResultHand = handId;
			dealError = '';
			dealAt = handId ? Date.now() + (reason === 'last-player' ? 5000 : 8000) : null;
		});
	});

	$effect(() => {
		if (dealAt === null || now < dealAt || !isHost || !autoDeal || paused) return;
		const key = result?.handId ?? 'lobby';
		if (dealingFor === key) return;
		untrack(() => {
			if (!canDeal) {
				dealError =
					eligible.length < 2
						? 'Waiting for at least two players with chips'
						: 'Waiting for players';
				return;
			}
			dealingFor = key;
			void ondeal().then((ok) => {
				if (!ok) dealingFor = null;
			});
		});
	});

	async function dealNow() {
		dealError = '';
		if (!(await ondeal())) dealError = 'Could not deal — check the players at the table';
	}

	// ——— Narration, chips and sounds ———
	let feed = $state<FeedEvent[]>([]);
	/** The log as hands, newest first: each starts at its deal, with the winner pulled out. */
	const handsLog = $derived.by(() => {
		const hands: {
			id: number;
			deal: FeedEvent | null;
			events: FeedEvent[];
			win: FeedEvent | null;
		}[] = [];
		for (const event of feed) {
			if (event.kind === 'deal' || !hands.length)
				hands.push({
					id: event.id,
					deal: event.kind === 'deal' ? event : null,
					events: [],
					win: null
				});
			const hand = hands[hands.length - 1];
			if (event.kind === 'win') hand.win = event;
			else if (event.kind !== 'deal') hand.events.push(event);
		}
		return hands.reverse();
	});
	const initials = (name: string) =>
		name
			.split(/\s+/)
			.map((part) => part[0])
			.join('')
			.slice(0, 2)
			.toUpperCase();
	let flights = $state<
		{ id: number; from: { x: number; y: number }; to: { x: number; y: number }; amount: number }[]
	>([]);
	let previous: RoomData | null = null;
	let portrait = $state(false);
	let arenaW = $state(1200);
	let arenaH = $state(600);
	/**
	 * Video tiles are the heart of the table, so seats are sized from the space the
	 * arena actually has: as large as possible without colliding with each other.
	 */
	/** Room the pot and action line need between or below the tiles. */
	const POT_SPACE = 132;
	/** Phones with three or more friends use a two-column grid with the pot underneath. */
	const phoneGrid = $derived(portrait && opponents.length >= 3);
	const gridRows = $derived(Math.ceil(opponents.length / 2));
	const seatW = $derived.by(() => {
		const n = opponents.length;
		if (phoneGrid) {
			const byHeight = ((arenaH - POT_SPACE) / gridRows - 30 - 30) / 0.75;
			return Math.max(96, Math.min(arenaW * 0.485, byHeight));
		}
		// One or two friends get a generous tile, but never so big the table and pot disappear.
		const [wShare, hShare] = portrait
			? [n <= 1 ? 0.72 : 0.64, n <= 1 ? 0.36 : 0.33]
			: [
					n <= 1 ? 0.34 : n === 2 ? 0.3 : n === 3 ? 0.25 : 0.2,
					n <= 2 ? 0.48 : n === 3 ? 0.44 : 0.38
				];
		const byHeight = (arenaH * hShare - 30) / 0.75;
		return Math.max(96, Math.min(arenaW * wShare, byHeight, 36 * 16));
	});
	const seatH = $derived(seatW * 0.75 + 30);
	const seatPositions = $derived.by(() => {
		const n = opponents.length;
		if (portrait && n === 2)
			// Two friends on a phone: staggered diagonally so each face gets most of the width.
			return [
				{ left: seatW / 2 + 4, top: seatH / 2 + 2 },
				{ left: arenaW - seatW / 2 - 4, top: seatH * 1.5 + 14 }
			];
		if (phoneGrid) {
			// Clockwise from you: up the left column, an odd friend centred on top, down the right.
			const rowTop = (row: number) => row * (seatH + 30) + seatH / 2 + 2;
			const odd = n % 2 === 1;
			const side = Math.floor(n / 2);
			const firstRow = odd ? 1 : 0;
			const leftX = seatW / 2 + 2;
			const rightX = arenaW - seatW / 2 - 2;
			const left = Array.from({ length: side }, (_, k) => ({
				left: leftX,
				top: rowTop(firstRow + side - 1 - k)
			}));
			const right = Array.from({ length: side }, (_, k) => ({
				left: rightX,
				top: rowTop(firstRow + k)
			}));
			return [...left, ...(odd ? [{ left: arenaW / 2, top: rowTop(0) }] : []), ...right];
		}
		return opponentPoints(n, portrait).map((point) => ({
			left: Math.min(Math.max((point.x / 100) * arenaW, seatW / 2 + 4), arenaW - seatW / 2 - 4),
			top: Math.min(Math.max((point.y / 100) * arenaH, seatH / 2 + 2), arenaH - seatH / 2 - 2)
		}));
	});
	/**
	 * The pot sits below whichever tiles share its column, centred in the space left,
	 * so a friend's video never covers it.
	 */
	const centerTop = $derived.by(() => {
		if (!seatPositions.length) return arenaH * 0.5;
		const potHalfWidth = portrait ? 120 : 210;
		const blocking = seatPositions.filter(
			(seat) => phoneGrid || Math.abs(seat.left - arenaW / 2) < seatW / 2 + potHalfWidth
		);
		if (!blocking.length) return arenaH * 0.52;
		const below = Math.max(...blocking.map((seat) => seat.top + seatH / 2)) + 34;
		// Keep the pot's lines clear of your hand, which rises out of the dock below.
		return Math.min(below + Math.max(0, arenaH - below) / 2, arenaH - (portrait ? 110 : 150));
	});
	const potPoint = () => ({ x: 50, y: (centerTop / arenaH) * 100 - 4 });
	const pointFor = (playerId: string | undefined) => {
		if (!playerId || playerId === selfId) return SELF_POINT;
		const index = opponents.findIndex((entry) => entry.user.id === playerId);
		const seat = seatPositions[index];
		return seat ? { x: (seat.left / arenaW) * 100, y: (seat.top / arenaH) * 100 } : POT_POINT;
	};

	$effect(() => {
		const snapshot = room;
		untrack(() => {
			const events = describeChange(previous, snapshot);
			previous = snapshot;
			if (!events.length) return;
			feed = [...feed, ...events].slice(-40);
			for (const event of events) {
				if (event.kind === 'blind' || event.kind === 'chaal' || event.kind === 'raise') {
					launch(pointFor(event.playerId), potPoint(), event.amount ?? 0);
					play('chip');
				} else if (event.kind === 'win') {
					launch(potPoint(), pointFor(event.playerId), event.amount ?? 0);
					play(event.playerId === selfId ? 'win' : 'chip');
				} else if (event.kind === 'see' || event.kind === 'deal' || event.kind === 'show')
					play('card');
				else if (event.kind === 'pack') play('pack');
			}
		});
	});

	function launch(from: { x: number; y: number }, to: { x: number; y: number }, amount: number) {
		const id = Math.random();
		flights = [...flights, { id, from, to, amount }];
		setTimeout(() => (flights = flights.filter((flight) => flight.id !== id)), 1500);
	}

	// Your-turn cue, last-seconds tick and a tab title that tells you when you are needed.
	let lastTurnKey = '';
	let lastTick = -1;
	const baseTitle = 'Chaal.tech';
	$effect(() => {
		const key = myTurn ? `${room.handId}:${room.deadline}` : '';
		untrack(() => {
			if (key && key !== lastTurnKey) {
				play('turn');
				if (document.hidden) navigator.vibrate?.(180);
			}
			lastTurnKey = key;
		});
	});
	$effect(() => {
		const secs = Math.ceil(remaining / 1000);
		if (!myTurn || secs > 5 || secs === lastTick) return;
		lastTick = secs;
		if (secs > 0) play('tick');
	});
	$effect(() => {
		document.title = myTurn ? `● Your turn · ${baseTitle}` : `${room.name} · ${baseTitle}`;
	});

	// ——— Actions ———
	let confirmingPack = $state(false);
	let packTimer: ReturnType<typeof setTimeout> | undefined;
	function pack() {
		if (!room.legalActions.pack) return;
		if (!confirmingPack) {
			confirmingPack = true;
			clearTimeout(packTimer);
			packTimer = setTimeout(() => (confirmingPack = false), 2500);
			return;
		}
		confirmingPack = false;
		void send('play', [true]);
	}
	const see = () => room.legalActions.see && void send('seeCards');
	const discard = (index: number) => room.legalActions.discard && void send('discardCard', [index]);
	const bet = (amount: number) => room.legalActions.bet && void send('play', [false, amount]);
	const show = () => room.legalActions.show && void send('show', [room.name]);
	const sitOut = (value: boolean) => void send('ready', [!value]);
	const setBalanceHidden = (hidden: boolean) => {
		rememberHiddenBalance(hidden);
		void send('setBalanceHidden', [hidden]);
	};
	// Carry this device's balance privacy choice onto every table it joins.
	let balancePrefSynced = false;
	$effect(() => {
		if (balancePrefSynced || !me || !connected) return;
		balancePrefSynced = true;
		const wanted = prefersHiddenBalance();
		if (wanted !== (me.balanceHidden === true)) void send('setBalanceHidden', [wanted]);
	});

	// ——— Bots ———
	let botLevel = $state<'easy' | 'normal' | 'hard'>('normal');
	const canAddBot = $derived(isHost && !live && !!room.legalActions.addBot && connected);
	const addBot = () => canAddBot && void send('addBot', [botLevel]);
	const removeBot = (botId: string) => void send('removeBot', [botId]);
	const low = $derived(room.legalActions.minBet ?? 0);
	const high = $derived(Math.min(room.legalActions.maxBet ?? 0, me?.balance ?? 0));

	function onkeydown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
		const key = event.key.toLowerCase();
		// Esc always closes overlays, even from inside a form field.
		if (key === 'escape') {
			panel = null;
			spotlight = null;
			return;
		}
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		// Game shortcuts pause while a side panel or spotlight is open.
		if (panel || spotlight || !live || !me || me.isPacked) return;
		if (key === 's') see();
		else if (key === 'c' && myTurn) bet(low);
		else if (key === 'r' && myTurn && high > low) bet(high);
		else if (key === 'p' && myTurn) pack();
		else if (key === 'w' && myTurn) show();
		else return;
		event.preventDefault();
	}

	// ——— Panels and preferences ———
	let panel = $state<'scores' | 'rules' | 'settings' | 'invite' | null>(null);

	// ——— Invites ———
	/** Club friends picked in the invite panel. */
	let pickedFriends = $state<string[]>([]);
	let inviteBusy = $state(false);
	let inviteNote = $state<{ kind: 'ok' | 'error'; text: string } | null>(null);
	let invited = $state<{ email: string; at: number }[]>([]);
	const inviteLink = $derived(
		typeof window === 'undefined' ? `/${room.name}` : `${window.location.origin}/${room.name}`
	);
	const canShare = $derived(typeof navigator !== 'undefined' && 'share' in navigator);
	function openInvite() {
		panel = 'invite';
		inviteNote = null;
		void emailInvites([]).then((reply) => {
			if (reply.ok && reply.invites) invited = reply.invites;
		});
	}
	async function sendInvites(event: Event) {
		event.preventDefault();
		if (!pickedFriends.length || inviteBusy) return;
		inviteBusy = true;
		inviteNote = null;
		const reply = await emailInvites([], pickedFriends);
		inviteBusy = false;
		if (!reply.ok) {
			inviteNote = { kind: 'error', text: reply.error ?? 'Could not send invites' };
			return;
		}
		if (reply.invites) invited = reply.invites;
		const sent = reply.sent?.length ?? 0;
		const skipped = reply.skipped?.length ?? 0;
		pickedFriends = [];
		inviteNote = {
			kind: 'ok',
			text: [
				sent ? `Invite sent to ${sent} ${sent === 1 ? 'person' : 'people'}.` : '',
				skipped ? `${skipped} already invited in the last 10 minutes.` : ''
			]
				.filter(Boolean)
				.join(' ')
		};
	}
	async function shareLink() {
		try {
			await navigator.share({
				title: 'Teen Patti on Chaal',
				text: `Join my Teen Patti table — boot ₹${boot}, buy-in ₹${room.table}`,
				url: inviteLink
			});
		} catch {
			/* Closing the share sheet is not an error. */
		}
	}
	let spotlight = $state<string | null>(null);
	const spotlightUser = $derived(
		room.usersList.find((user) => user.id === spotlight && !user.hasLeft)
	);
	let sound = $state(true);
	let arena: HTMLElement | undefined = $state();

	onMount(() => {
		sound = soundEnabled();
		const tick = setInterval(() => (now = Date.now()), 250);
		const observer = new ResizeObserver(([entry]) => {
			arenaW = entry.contentRect.width;
			arenaH = Math.max(entry.contentRect.height, 1);
			portrait = arenaW / arenaH < 1.15;
		});
		if (arena) observer.observe(arena);
		return () => {
			clearInterval(tick);
			observer.disconnect();
			clearTimeout(packTimer);
			document.title = baseTitle;
		};
	});

	const standings = $derived(
		[...room.usersList]
			// Hidden balances sort last and show no result.
			.sort((a, b) => (b.balance ?? -Infinity) - (a.balance ?? -Infinity))
			.map((user) => ({ user, net: user.balance === null ? null : user.balance - room.table }))
	);
	// Only this hand's story: a new deal wipes the ticker clean.
	const recent = $derived.by(() => {
		const start = feed.findLastIndex((event) => event.kind === 'deal');
		return feed.slice(Math.max(start, 0)).slice(-3).reverse();
	});
</script>

<!-- The host picks the Teen Patti variant for the next hand right where they deal. -->
{#snippet variantChip()}
	<button
		type="button"
		class="mini variant-chip"
		onclick={() => (panel = 'settings')}
		data-testid="choose-variant"
		title="Choose the variant for the next hand"
		>Next: <strong>{nextVariant}</strong> · change</button
	>
{/snippet}

<svelte:window {onkeydown} />

{#snippet botAdder()}
	<div class="bot-adder" data-testid="bot-adder">
		<div class="levels" role="radiogroup" aria-label="Bot difficulty">
			{#each ['easy', 'normal', 'hard'] as const as level (level)}
				<button
					role="radio"
					aria-checked={botLevel === level}
					class:on={botLevel === level}
					onclick={() => (botLevel = level)}>{level}</button
				>
			{/each}
		</div>
		<button class="mini add-bot" onclick={addBot} disabled={!canAddBot}>
			<Bot class="h-3.5 w-3.5" /> Add bot
		</button>
	</div>
{/snippet}

<div class="tp-shell" data-testid="table-scene" data-game="teen-patti">
	<header class="topbar">
		<div class="brand">
			<img class="logo" src="/brand/chaal-mark.svg" width="34" height="34" alt="" />
			<button class="room-code" onclick={openInvite} title="Invite friends">
				<span class="code">{room.name}</span>
				<Copy class="h-3.5 w-3.5" />
			</button>
		</div>
		<div class="variant" data-testid="variant-label">
			<span class="variant-name">{variant?.selectionLabel.split(' — ')[0] ?? 'Teen Patti'}</span>
			<span class="dot">·</span>
			<span>Boot {money(boot)}</span>
			{#if room.variantState?.indicator}
				<span class="dot">·</span>
				<span class="wild" data-testid="joker-indicator"
					>{room.variantState.wildColor
						? `Wild: ${room.variantState.wildColor} cards`
						: `Wild ${rankLabel(room.variantState.wildRank)}`}</span
				>
			{/if}
		</div>
		<div class="tools">
			{@render media()}
			<span class="sep" aria-hidden="true"></span>
			<button
				class="tool"
				onclick={() => {
					sound = !sound;
					setSoundEnabled(sound);
				}}
				title={sound ? 'Mute table sounds' : 'Turn table sounds on'}
				aria-label={sound ? 'Mute table sounds' : 'Turn table sounds on'}
				>{#if sound}<Volume2 class="h-4 w-4" />{:else}<VolumeX class="h-4 w-4" />{/if}</button
			>
			<button
				class="tool"
				onclick={() => (panel = 'rules')}
				title="Hand rankings"
				aria-label="Hand rankings"><BookOpen class="h-4 w-4" /></button
			>
			<button
				class="tool"
				onclick={() => (panel = 'scores')}
				title="Scores and hand log"
				aria-label="Scores and hand log"><Trophy class="h-4 w-4" /></button
			>
			{#if isHost}
				<button
					class="tool"
					onclick={() => (panel = 'settings')}
					title="Table settings"
					aria-label="Table settings"><Settings class="h-4 w-4" /></button
				>
			{/if}
			<button class="tool leave" onclick={onleave} title="Leave table" aria-label="Leave table"
				><LogOut class="h-4 w-4" /></button
			>
		</div>
	</header>

	{#if !connected}
		<div class="offline" role="status">Reconnecting — actions are paused</div>
	{/if}

	<main class="arena" class:portrait bind:this={arena} style:--seat-w="{seatW}px">
		{#if incomingAsks.length}
			<div class="chip-prompts" role="alert">
				{#each incomingAsks as ask (ask.from)}
					<div class="chip-prompt">
						<span
							><strong>{askerName(ask.from)}</strong> is low on chips and asked you for
							<strong>{money(ask.amount)}</strong></span
						>
						<div class="chip-prompt-actions">
							<button
								type="button"
								class="give"
								disabled={!connected || (me?.balance ?? 0) < ask.amount}
								onclick={() => answerAsk(ask.from, true)}>Give {money(ask.amount)}</button
							>
							<button type="button" class="decline" onclick={() => answerAsk(ask.from, false)}
								>Decline</button
							>
						</div>
					</div>
				{/each}
			</div>
		{/if}
		<div class="felt" data-felt={club.settings.look.felt} aria-hidden="true">
			<div class="felt-inner"></div>
			<span class="rail-logo">chaal<small>.tech</small></span>
		</div>

		{#each opponents as entry, index (entry.user.id)}
			{@const point = seatPositions[index]}
			<div
				class="seat-slot"
				style:left="{point.left}px"
				style:top="{point.top}px"
				style:--seat-w="{seatW}px"
			>
				<TpSeat
					user={entry.user}
					{boot}
					active={current?.id === entry.user.id}
					host={room.hostId === entry.user.id}
					inHand={inHand(entry.user)}
					showdown={!!result}
					winner={!!result && result.winnerId === entry.user.id}
					loser={!!result && revealed.has(entry.user.id) && result.winnerId !== entry.user.id}
					handLabel={nameOf(entry.user)}
					remaining={current?.id === entry.user.id ? remaining : 0}
					{total}
					dealKey={room.handId}
					showMedia={!!mediaState && ['connected', 'reconnecting'].includes(mediaState.status)}
					mediaParticipant={mediaState?.participants.find((p) => p.identity === entry.user.id)}
					onspotlight={() => (spotlight = entry.user.id)}
					onremove={entry.user.bot && isHost && !live ? () => removeBot(entry.user.id) : undefined}
				/>
			</div>
		{/each}

		{#if spotlightUser}
			<button
				class="spotlight"
				onclick={() => (spotlight = null)}
				aria-label="Close large video"
				transition:fade={{ duration: 150 }}
			>
				<span class="spotlight-frame">
					{#if spotlightUser.bot}
						<BotAvatar name={spotlightUser.username} level={spotlightUser.bot} />
					{:else}
						<SeatVideo
							participant={mediaState?.participants.find((p) => p.identity === spotlightUser.id)}
							name={spotlightUser.username}
							playerId={spotlightUser.id}
						/>
					{/if}
					<span class="spotlight-name"
						>{spotlightUser.username} · {balanceLabel(spotlightUser)}</span
					>
				</span>
			</button>
		{/if}

		{#if opponents.length === 0}
			<div class="empty-seats" style:left="50%" style:top={portrait ? '18%' : '22%'}>
				<button class="invite-big" onclick={openInvite}>
					<UserPlus class="h-5 w-5" /> Invite friends
				</button>
				<p>Share the link — up to 6 players</p>
			</div>
		{/if}

		<div class="center" data-testid="table-center" style:top="{centerTop}px">
			{#if result}
				<div class="result" in:fly={{ y: 12, duration: 350 }} role="status" aria-live="polite">
					<Trophy class="trophy h-7 w-7" />
					<p class="result-title">
						{#if result.winners}
							{result.winners.some((w) => w.id === selfId) ? 'You split' : 'Split pot'}
							<span>{result.winners.map((w) => `${w.name} ${money(w.amount)}`).join(' · ')}</span>
						{:else}
							{result.winnerId === selfId ? 'You win' : `${result.winnerName} wins`}
							<span>{money(result.amount)}</span>
						{/if}
					</p>
					<p class="result-detail">{resultDetail}</p>
					{#if dealIn !== null}
						<div class="next" data-testid="next-round-controls">
							{#if isHost}
								{#if autoDeal && !paused}
									<span>Next hand in {dealIn}s</span>
									<button class="mini" onclick={() => (paused = true)}
										><Pause class="h-3.5 w-3.5" /> Pause</button
									>
								{:else}
									<span>Paused</span>
								{/if}
								<button
									class="mini gold"
									onclick={dealNow}
									disabled={!canDeal}
									data-testid="next-round-start"><Play class="h-3.5 w-3.5" /> Deal now</button
								>
								{@render variantChip()}
							{:else if autoDeal}
								<span>Next hand in {dealIn}s</span>
							{:else}
								<span>Waiting for the host to deal</span>
							{/if}
						</div>
						{#if dealError}<p class="deal-error">{dealError}</p>{/if}
					{/if}
					{#if isHost && canAddBot}<div class="result-bots">{@render botAdder()}</div>{/if}
				</div>
			{:else if !room.isStarted}
				<div class="lobby" in:fade>
					<p class="lobby-title">
						<Sparkles class="h-4 w-4" />
						{eligible.length < 2 ? 'Waiting for players' : 'Table is ready'}
					</p>
					<p class="lobby-sub">
						{room.usersList.length}/6 seated · {money(room.table)} buy-in · boot {money(boot)}
					</p>
					{#if isHost}
						<button class="deal-btn" onclick={dealNow} disabled={!canDeal} data-testid="deal-first">
							<Play class="h-4 w-4" /> Deal first hand
						</button>
						{@render variantChip()}
						{@render botAdder()}
						{#if !canDeal}
							<p class="lobby-hint">
								{eligible.length < 2
									? 'Need at least 2 players at the table'
									: 'Waiting for everyone to switch on “Deal me in”'}
							</p>
						{/if}
						{#if dealError}<p class="deal-error">{dealError}</p>{/if}
					{:else}
						<p class="lobby-hint">The host deals when everyone is here</p>
					{/if}
				</div>
			{:else}
				<div class="pot" aria-live="polite">
					{#if room.pot}
						<span class="pot-chips">
							<ChipStack
								amount={room.pot}
								size={portrait ? '2.3rem' : '3.6rem'}
								spread={4}
								stacks={4}
							/>
						</span>
					{/if}
					<span class="pot-label">Pot</span>
					{#key room.pot}
						<span class="pot-amount" in:fly={{ y: -10, duration: 600, delay: 900 }}
							>{money(room.pot)}</span
						>
					{/key}
					<span class="stakes">
						Blind {money(blindStake)} · Seen {money(seenStake)}
					</span>
					{#if potCap}
						<span class="limit" title="When the pot reaches this, everyone still in must show">
							<span class="limit-bar"
								><span style:transform="scaleX({Math.min(1, room.pot / potCap)})"></span></span
							>
							Limit {money(potCap)}
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Latest actions sit in the top-left corner, clear of the pot and the seats. -->
		<ol class="feed" class:hidden-feed={!!result} aria-label="Recent actions">
			{#each recent as event, index (event.id)}
				<li
					class="feed-line k-{event.kind}"
					style:opacity={1 - index * 0.32}
					in:fly={{ x: -8, duration: 220 }}
				>
					{event.text}
				</li>
			{/each}
		</ol>

		{#each flights as flight (flight.id)}
			<span
				class="flying-chip"
				style:--fx="{flight.from.x}%"
				style:--fy="{flight.from.y}%"
				style:--tx="{flight.to.x}%"
				style:--ty="{flight.to.y}%"
				aria-hidden="true"><CasinoChip denomination={25} size="100%" decorative /></span
			>
		{/each}
	</main>

	{#if me}
		<ActionDock
			{me}
			{room}
			inHand={inHand(me)}
			{myTurn}
			waitingOn={current?.username ?? null}
			remaining={myTurn ? remaining : 0}
			{total}
			{connected}
			handLabel={nameOf(me)}
			{net}
			dealKey={room.handId}
			{confirmingPack}
			showMedia={!!mediaState && ['connected', 'reconnecting'].includes(mediaState.status)}
			mediaParticipant={mediaState?.participants.find((p) => p.identity === selfId)}
			onsee={see}
			ondiscard={discard}
			onpack={pack}
			onbet={bet}
			onshow={show}
			onsitout={sitOut}
			onbalancehidden={setBalanceHidden}
			onaskchips={askChips}
			oncancelask={cancelAsk}
			onpeek={() => void send('seeCards')}
			onshowcards={() => void send('showCards')}
		/>
	{/if}

	{#if panel}
		<div
			class="scrim"
			onclick={() => (panel = null)}
			aria-hidden="true"
			transition:fade={{ duration: 150 }}
		></div>
		<div
			class="sheet"
			class:wide={panel === 'rules'}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-label={panel}
			transition:fly={{ x: 40, duration: 200 }}
		>
			<header class="sheet-head">
				<h2>
					{panel === 'scores'
						? 'Tonight'
						: panel === 'rules'
							? 'Hand rankings'
							: panel === 'invite'
								? 'Invite friends'
								: 'Table settings'}
				</h2>
				<button class="tool" onclick={() => (panel = null)} aria-label="Close"
					><X class="h-4 w-4" /></button
				>
			</header>
			<div class="sheet-body">
				{#if panel === 'invite'}
					<p class="muted">
						Up to 6 players sit at a table. Friends join straight from the link — no app, no
						sign-up.
					</p>
					<div class="link-box">
						<span class="link-text">{inviteLink}</span>
						<button class="mini gold" onclick={oninvite}><Copy class="h-3.5 w-3.5" /> Copy</button>
					</div>
					{#if canShare}
						<button class="mini share" onclick={shareLink}
							><Share2 class="h-3.5 w-3.5" /> Share via WhatsApp, SMS…</button
						>
					{/if}
					<h3>Invite your friends</h3>
					<form class="invite-form" onsubmit={sendInvites}>
						<FriendPicker bind:selected={pickedFriends} />
						<button
							class="mini gold send"
							type="submit"
							disabled={!pickedFriends.length || inviteBusy || !connected}
						>
							<Mail class="h-3.5 w-3.5" />
							{inviteBusy
								? 'Sending…'
								: pickedFriends.length > 1
									? `Invite ${pickedFriends.length} friends`
									: 'Invite'}
						</button>
					</form>
					{#if inviteNote}
						<p class="invite-note" class:error={inviteNote.kind === 'error'} role="status">
							{inviteNote.text}
						</p>
					{/if}
					<p class="muted small">They get an email with a link straight to this table.</p>
					{#if isHost}
						<h3>No one free? Add a bot</h3>
						<p class="muted">
							Bots play at your pace, have no camera, and can be removed between hands.
						</p>
						{@render botAdder()}
					{/if}
					{#if invited.length}
						<h3>Invited</h3>
						<ul class="invited">
							{#each invited as entry (entry.email)}
								<li>
									<span>{entry.email}</span>
									<small
										>{new Date(entry.at).toLocaleTimeString([], {
											hour: 'numeric',
											minute: '2-digit'
										})}</small
									>
								</li>
							{/each}
						</ul>
					{/if}
				{:else if panel === 'scores'}
					<ol class="standings">
						{#each standings as { user, net: delta }, index (user.id)}
							<li class:leader={index === 0 && (delta ?? 0) > 0} class:me={user.id === selfId}>
								<span class="place">{index + 1}</span>
								<span class="initials" aria-hidden="true">{initials(user.username)}</span>
								<span class="who"
									>{user.username}{#if user.id === selfId}<small>You</small>{/if}</span
								>
								<span class="score">
									<span class="amt">{balanceLabel(user)}</span>
									<span class="delta" class:up={(delta ?? 0) > 0} class:down={(delta ?? 0) < 0}
										>{delta === null ? '—' : signedMoney(delta)}</span
									>
								</span>
							</li>
						{/each}
					</ol>
					<h3>Hand log</h3>
					{#each handsLog as hand, index (hand.id)}
						<section class="hand-card" class:current={index === 0 && !hand.win}>
							<header>
								{#if hand.win}
									<strong class="hand-win">{hand.win.text}</strong>
								{:else}
									<strong>{index === 0 ? 'This hand' : 'Earlier'}</strong>
								{/if}
								{#if hand.deal}<small>{hand.deal.text.replace('New hand · ', '')}</small>{/if}
							</header>
							{#if hand.events.length}
								<ol class="log">
									{#each hand.events as event (event.id)}
										<li class="k-{event.kind}">{event.text}</li>
									{/each}
								</ol>
							{/if}
						</section>
					{:else}
						<p class="muted">Actions appear here as the game goes.</p>
					{/each}
				{:else if panel === 'rules'}
					<p class="muted">
						Strongest hand on the left, weakest on the right. {variant?.description ?? ''}
					</p>
					<ol class="ranks">
						{#each HAND_RANKINGS as rank, index (rank.name)}
							{@const example = RANKING_EXAMPLES[rank.name]}
							<li>
								<p class="rank-title">
									<span>{index + 1}.</span>
									{rank.name} <small>{rank.hint}</small>
								</p>
								<div class="rank-row" aria-label="Best to weakest {rank.name}">
									{#each [example.best, example.worst] as hand, side (side)}
										{#if side === 1}<span class="rank-gap" aria-hidden="true"></span>{/if}
										<span class="fan" title={side === 0 ? 'Strongest' : 'Weakest'}>
											{#each hand as card, i (i)}
												<span class="fan-card"
													><ClassicCard
														rank={card.rank}
														suit={card.suit}
														class="!h-full !w-full"
													/></span
												>
											{/each}
										</span>
									{/each}
								</div>
							</li>
						{/each}
					</ol>
					<h3>How betting works</h3>
					<ul class="howto">
						<li>
							<strong>Blind</strong> players haven’t looked; they bet half of what seen players bet.
						</li>
						<li>
							<strong>Chaal</strong> matches the current stake. <strong>Raise</strong> doubles it.
						</li>
						<li>
							<strong>Show</strong> is allowed when two players remain; cards are compared and the pot
							is settled.
						</li>
						{#if potCap}
							<li>
								<strong>Pot limit {money(potCap)}:</strong> when the pot reaches it, everyone still in
								shows and the best hand wins. Equal best hands split the pot.
							</li>
						{/if}
						<li>
							You have <strong>{Math.round(total / 1000)} seconds</strong> per turn. If time runs out
							you pack automatically.
						</li>
					</ul>
					<h3>Shortcuts</h3>
					<p class="muted">S see · C chaal · R raise · P pack (press twice) · W show · Esc close</p>
				{:else}
					<label class="setting">
						<input
							type="checkbox"
							class="toggle toggle-sm toggle-primary"
							bind:checked={autoDeal}
						/>
						<span
							>Deal the next hand automatically<small
								>A short pause after each hand, then cards are dealt</small
							></span
						>
					</label>
					{#if paused}
						<button class="mini gold" onclick={() => (paused = false)}
							><Play class="h-3.5 w-3.5" /> Resume auto-deal</button
						>
					{/if}
					{#if room.boot !== undefined}
						<div class="setting-block">
							<span class="setting-title"
								>Pot limit<small
									>When the pot reaches this, everyone still in shows and the best hand wins.
									Changes apply between hands.</small
								></span
							>
							<div class="levels wide" role="radiogroup" aria-label="Pot limit">
								{#each [0, 64, 128, 256, 512] as limit (limit)}
									<button
										role="radio"
										aria-checked={(room.potLimit ?? 0) === limit}
										class:on={(room.potLimit ?? 0) === limit}
										disabled={live || !connected}
										onclick={() => setPotLimit(limit)}>{limit ? money(limit * boot) : 'Off'}</button
									>
								{/each}
							</div>
						</div>
					{/if}
					{@render settings()}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	:global(.toast) {
		z-index: 80;
	}
	.tp-shell {
		--tp-gold: #e2b862;
		--tp-felt-glow: rgb(233 191 98 / 60%);
		position: fixed;
		inset: 0;
		z-index: 40;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		/* A dim card room with one warm lamp over the table. */
		background:
			radial-gradient(ellipse 60% 48% at 50% 42%, rgb(255 214 150 / 11%), transparent 70%),
			radial-gradient(ellipse 90% 75% at 50% 45%, #18201b 0%, #0d110e 55%, #060807 100%);
		padding: 0.5rem max(0.75rem, env(safe-area-inset-right)) 0.75rem
			max(0.75rem, env(safe-area-inset-left));
		color: #f1ebdc;
		overflow: clip;
	}
	.tp-shell > :global([data-testid='action-dock']) {
		flex: none;
	}
	.tp-shell > :global(*) {
		width: 100%;
		max-width: 92rem;
		margin-inline: auto;
	}
	/* The top bar runs edge to edge: room code far left, tools far right. */
	.tp-shell > .topbar {
		max-width: none;
	}
	/* Top bar */
	.topbar {
		flex: none;
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding-top: env(safe-area-inset-top);
	}
	.brand {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.5rem;
	}
	.logo {
		display: block;
		width: 2.1rem;
		height: 2.1rem;
		flex-shrink: 0;
		place-items: center;
		object-fit: contain;
	}
	.room-code {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 0.4rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 5%);
		padding: 0.35rem 0.75rem;
		color: rgb(241 235 220 / 75%);
		font-size: 0.8rem;
		cursor: pointer;
	}
	.room-code:hover {
		background: rgb(255 255 255 / 10%);
		color: #f1ebdc;
	}
	.code {
		overflow: hidden;
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.variant {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.4rem;
		color: rgb(241 235 220 / 65%);
		font-size: 0.82rem;
		white-space: nowrap;
	}
	.variant-name {
		color: #f4d68c;
		font-weight: 700;
	}
	.wild {
		color: #b5dcff;
		font-weight: 650;
	}
	.dot {
		opacity: 0.4;
	}
	.tools {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.sep {
		width: 1px;
		height: 1.3rem;
		margin-inline: 0.2rem;
		background: rgb(255 255 255 / 12%);
	}
	.tool {
		display: inline-grid;
		width: 2.1rem;
		height: 2.1rem;
		place-items: center;
		border: 1px solid rgb(241 235 220 / 14%);
		border-radius: 999px;
		background: rgb(255 255 255 / 5%);
		color: #f1ebdc;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.tool:hover {
		background: rgb(255 255 255 / 11%);
	}
	.tool.leave {
		color: #f0a898;
	}
	.offline {
		position: absolute;
		top: 3.4rem;
		left: 50%;
		z-index: 5;
		width: auto;
		translate: -50% 0;
		border-radius: 999px;
		background: #5b2c1f;
		padding: 0.3rem 0.9rem;
		color: #ffd9cf;
		font-size: 0.8rem;
	}
	.variant-chip {
		color: #f4d68c;
	}
	.variant-chip strong {
		font-weight: 750;
	}
	/* A friend asking you for chips: a small card over the top of the table. */
	.chip-prompts {
		position: absolute;
		top: 0.5rem;
		left: 50%;
		z-index: 8;
		display: flex;
		width: min(24rem, calc(100% - 1rem));
		flex-direction: column;
		gap: 0.5rem;
		translate: -50% 0;
	}
	.chip-prompt {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		border: 1px solid rgb(240 200 110 / 55%);
		border-radius: 1rem;
		background: rgb(12 20 16 / 96%);
		padding: 0.8rem 0.9rem;
		box-shadow: 0 0.8rem 2rem rgb(0 0 0 / 55%);
		font-size: 0.88rem;
	}
	.chip-prompt strong {
		color: #f4d68c;
	}
	.chip-prompt-actions {
		display: flex;
		gap: 0.5rem;
	}
	.chip-prompt-actions button {
		flex: 1;
		border-radius: 0.65rem;
		padding: 0.5rem;
		font-weight: 700;
		cursor: pointer;
	}
	.chip-prompt .give {
		background: #f4d68c;
		color: #24180a;
	}
	.chip-prompt .give:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.chip-prompt .decline {
		border: 1px solid rgb(241 235 220 / 25%);
		color: #f1ebdc;
	}
	/* Arena and felt */
	.arena {
		position: relative;
		container-type: size;
		flex: 1 1 0;
		min-height: 0;
		isolation: isolate;
	}
	/* Cloth colours an owner can pick on the Admin page; emerald is the default. */
	.felt {
		--felt-1: #1f7a4c;
		--felt-2: #15603a;
		--felt-3: #0c4127;
		--felt-4: #08311d;
	}
	.felt[data-felt='sapphire'] {
		--felt-1: #22568f;
		--felt-2: #1a4474;
		--felt-3: #102e52;
		--felt-4: #0a203d;
	}
	.felt[data-felt='crimson'] {
		--felt-1: #8c2633;
		--felt-2: #701c28;
		--felt-3: #50131c;
		--felt-4: #3a0d14;
	}
	.felt[data-felt='onyx'] {
		--felt-1: #33403b;
		--felt-2: #26302c;
		--felt-3: #19201d;
		--felt-4: #111614;
	}
	/* Padded leather rail, lit from above, casting a shadow on the floor. */
	.felt {
		--rail: clamp(0.9rem, 2.6vw, 2rem);
		position: absolute;
		inset: 6% 4% 3% 4%;
		/* Seen from a chair: the far side recedes, the near rail comes toward you. */
		transform: perspective(1400px) rotateX(20deg);
		transform-origin: 50% 100%;
		z-index: -1;
		/* Racetrack: straight sides with round ends, like a real card table. */
		border-radius: 999px;
		background:
			radial-gradient(ellipse 70% 40% at 50% 0%, rgb(255 225 180 / 16%), transparent 70%),
			linear-gradient(180deg, #3a2618 0%, #24160d 45%, #150c06 100%);
		padding: var(--rail);
		/* The table's wooden edge under the rail, then its shadow on the floor. */
		box-shadow:
			0 0.45rem 0 #22150b,
			0 0.8rem 0 #120a05,
			0 0.85rem 0 rgb(255 214 150 / 10%),
			0 2.8rem 4.5rem -0.5rem rgb(0 0 0 / 80%),
			0 1.2rem 1.6rem rgb(0 0 0 / 55%),
			inset 0 2px 1px rgb(255 228 190 / 22%),
			inset 0 -4px 8px rgb(0 0 0 / 60%),
			inset 0 0 0 1px rgb(0 0 0 / 55%);
	}
	/* Stitching along the middle of the rail. */
	.felt::before {
		position: absolute;
		inset: calc(var(--rail) * 0.45);
		border: 1px dashed rgb(226 190 130 / 22%);
		border-radius: inherit;
		content: '';
		pointer-events: none;
	}
	.felt-inner {
		position: relative;
		height: 100%;
		overflow: hidden;
		border-radius: inherit;
		/* Lamp hotspot, cloth weave, then the green baize darkening toward the rail. */
		background:
			radial-gradient(ellipse 55% 50% at 50% 40%, rgb(255 240 200 / 13%), transparent 72%),
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"),
			radial-gradient(
				ellipse at 50% 45%,
				var(--felt-1) 0%,
				var(--felt-2) 50%,
				var(--felt-3) 85%,
				var(--felt-4) 100%
			);
		/* Polished wood trim between rail and cloth, and the rail's shadow on the felt. */
		box-shadow:
			0 0 0 3px #8a5a2c,
			0 0 0 4px #c48a4a,
			0 0 0 6px #4a2c12,
			inset 0 0.9rem 1.6rem rgb(0 0 0 / 50%),
			inset 0 0 2.5rem rgb(0 0 0 / 35%);
	}
	/* The printed betting line, and the house logo in the middle of the cloth. */
	.felt-inner::before {
		position: absolute;
		inset: clamp(1.4rem, 9%, 3.5rem);
		border: 1.5px solid rgb(240 210 140 / 16%);
		border-radius: inherit;
		content: '';
	}
	.arena.portrait .felt {
		--rail: clamp(0.8rem, 3.5vw, 1.2rem);
		inset: 5% 3% 3% 3%;
		transform: perspective(1400px) rotateX(14deg);
	}
	/* The house name, stamped into the leather at the top right of the rail. */
	.rail-logo {
		position: absolute;
		top: calc(var(--rail) * 0.5);
		right: 21%;
		translate: 0 -50%;
		color: rgb(58 36 20 / 92%);
		font-size: clamp(0.7rem, calc(var(--rail) * 0.62), 1.15rem);
		font-weight: 900;
		letter-spacing: 0.02em;
		line-height: 1;
		/* Debossed: a dark top edge and a faint highlight below, like a hot stamp. */
		text-shadow:
			0 -1px 0 rgb(0 0 0 / 70%),
			0 1px 0 rgb(255 226 180 / 16%);
		white-space: nowrap;
		user-select: none;
	}
	.rail-logo small {
		font-size: 0.8em;
		font-weight: 700;
	}
	/* Phones: the seats crowd the cloth, so keep the logo, chips and pot compact. */
	.arena.portrait .center {
		gap: 0.2rem;
	}
	/* Phones: the top is a semicircle, so the stamp sits on the rail at 45° and follows it.
	   The felt is 94cqw wide, so its radius is 47cqw; the rail's middle is half a rail inside. */
	.arena.portrait .rail-logo {
		top: calc(47cqw - (47cqw - var(--rail) / 2) * 0.7071);
		right: auto;
		left: calc(47cqw + (47cqw - var(--rail) / 2) * 0.7071);
		translate: -50% -50%;
		rotate: 45deg;
	}
	.arena.portrait .pot {
		padding-top: 0;
		padding-bottom: 0.2rem;
	}
	.seat-slot,
	.empty-seats {
		position: absolute;
		z-index: 2;
		width: var(--seat-w);
		translate: -50% -50%;
		transition:
			left 400ms ease,
			top 400ms ease,
			width 400ms ease;
	}
	.empty-seats {
		display: flex;
		width: auto;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		color: rgb(241 235 220 / 55%);
		font-size: 0.8rem;
	}
	.invite-big {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px dashed rgb(240 200 110 / 55%);
		border-radius: 999px;
		background: rgb(6 12 10 / 40%);
		padding: 0.7rem 1.3rem;
		color: #f4d68c;
		font-weight: 700;
		cursor: pointer;
	}
	.center {
		position: absolute;
		top: 54%;
		left: 50%;
		z-index: 1;
		display: flex;
		width: min(26rem, 46%);
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		translate: -50% -50%;
		text-align: center;
	}
	.arena.portrait .center {
		top: 52%;
		width: min(15rem, 44%);
	}
	/* The pot sits on the cloth: a stack of chips and the total printed beside it. */
	.pot {
		display: flex;
		flex-direction: column;
		align-items: center;
		border-radius: 50%;
		background: radial-gradient(ellipse at center, rgb(0 0 0 / 22%), transparent 70%);
		padding: 0.6rem 1.8rem 0.8rem;
	}
	.pot-chips {
		display: block;
		margin-bottom: 0.45rem;
	}
	.pot-label {
		color: rgb(244 227 181 / 70%);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	.pot-amount {
		color: #f7dc95;
		font-size: clamp(1.6rem, 3.2vw, 2.5rem);
		font-variant-numeric: tabular-nums;
		font-weight: 850;
		line-height: 1.1;
		text-shadow:
			0 1px 0 rgb(0 0 0 / 55%),
			0 2px 12px rgb(0 0 0 / 50%);
	}
	.stakes {
		margin-top: 0.15rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.feed {
		position: absolute;
		top: 0.4rem;
		left: 0.6rem;
		z-index: 4;
		display: flex;
		max-width: min(17rem, calc(50% - var(--seat-w, 12rem) / 2 - 1rem));
		flex-direction: column;
		align-items: flex-start;
		gap: 0.15rem;
		text-align: left;
		pointer-events: none;
	}
	.feed-line {
		text-shadow: 0 1px 3px rgb(0 0 0 / 70%);
	}
	/* Phones have no free corner beside the top seat: show just the newest action,
	   as one pill centred above your hand. */
	.arena.portrait .feed {
		top: auto;
		bottom: 0.4rem;
		left: 50%;
		max-width: calc(100% - 1.5rem);
		translate: -50% 0;
		align-items: center;
	}
	.arena.portrait .feed-line:not(:first-child) {
		display: none;
	}
	.arena.portrait .feed-line {
		border-radius: 999px;
		background: rgb(6 12 10 / 72%);
		padding: 0.15rem 0.7rem;
		white-space: nowrap;
	}
	.hidden-feed {
		display: none;
	}
	.feed-line {
		color: #f1ebdc;
		font-size: 0.85rem;
		line-height: 1.2;
	}
	.feed-line:first-child {
		font-weight: 650;
	}
	.k-raise {
		color: #f4d68c;
	}
	.k-pack {
		color: #f0a898;
	}
	.k-win {
		color: #f7dc95;
	}
	.k-see {
		color: #b5dcff;
	}
	.result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		border-radius: 1.2rem;
		background: rgb(4 20 12 / 62%);
		padding: 0.8rem 1.2rem;
		box-shadow:
			inset 0 0 0 1px rgb(240 200 120 / 35%),
			0 0 3rem rgb(240 200 110 / 15%);
	}
	.result :global(.trophy) {
		color: #f4d68c;
	}
	.result-title {
		font-size: clamp(1.05rem, 2vw, 1.4rem);
		font-weight: 800;
	}
	.result-title span {
		color: #f7dc95;
	}
	.result-detail {
		color: rgb(241 235 220 / 80%);
		font-size: 0.85rem;
	}
	.next {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 0.35rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
	}
	.mini {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border: 1px solid rgb(241 235 220 / 18%);
		border-radius: 999px;
		background: rgb(255 255 255 / 6%);
		padding: 0.25rem 0.7rem;
		color: #f1ebdc;
		font-size: 0.75rem;
		font-weight: 650;
		cursor: pointer;
	}
	.mini.gold {
		border-color: transparent;
		background: linear-gradient(160deg, #f4d68c, #c99236);
		color: #24180a;
	}
	.mini:disabled {
		cursor: not-allowed;
		opacity: 0.45;
	}
	.deal-error {
		color: #f0cc78;
		font-size: 0.75rem;
	}
	.lobby {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
	}
	.lobby-title {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		color: #f4d68c;
		font-size: 1.15rem;
		font-weight: 800;
	}
	.lobby-sub,
	.lobby-hint {
		color: rgb(241 235 220 / 65%);
		font-size: 0.8rem;
	}
	.deal-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.4rem;
		border-radius: 999px;
		background: linear-gradient(160deg, #f4d68c, #c99236);
		padding: 0.75rem 1.6rem;
		color: #24180a;
		font-size: 1rem;
		font-weight: 800;
		box-shadow: 0 0.5rem 1.5rem rgb(201 146 54 / 35%);
		cursor: pointer;
	}
	.deal-btn:disabled {
		cursor: not-allowed;
		opacity: 0.45;
		box-shadow: none;
	}
	.spotlight {
		position: absolute;
		inset: 0;
		z-index: 8;
		display: grid;
		place-items: center;
		background: rgb(4 8 6 / 72%);
		cursor: zoom-out;
		backdrop-filter: blur(4px);
	}
	.spotlight-frame {
		position: relative;
		width: min(94cqw, 120cqh);
		overflow: hidden;
		border-radius: 1.2rem;
		box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 60%);
	}
	.spotlight-frame :global(.seat-video) {
		aspect-ratio: 4 / 3;
	}
	.spotlight-name {
		position: absolute;
		top: 0.7rem;
		left: 0.7rem;
		z-index: 2;
		border-radius: 999px;
		background: rgb(8 14 12 / 78%);
		padding: 0.25rem 0.8rem;
		font-weight: 700;
	}
	.flying-chip {
		position: absolute;
		z-index: 6;
		width: 1.8rem;
		height: 1.8rem;
		translate: -50% -50%;
		border-radius: 999px;
		box-shadow: 0 4px 10px rgb(0 0 0 / 55%);
		/* Slow and weighty: the chip slides into the pot rather than snapping. */
		animation: tp-chip 1300ms cubic-bezier(0.45, 0.05, 0.25, 1) forwards;
		pointer-events: none;
	}
	@keyframes tp-chip {
		from {
			left: var(--fx);
			top: var(--fy);
			opacity: 1;
		}
		85% {
			opacity: 1;
		}
		to {
			left: var(--tx);
			top: var(--ty);
			opacity: 0;
		}
	}
	/* Side sheet */
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 60;
		max-width: none;
		background: rgb(0 0 0 / 45%);
	}
	.sheet {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 61;
		display: flex;
		width: min(24rem, 100%);
		max-width: none;
		flex-direction: column;
		margin: 0;
		background: #111b17;
		box-shadow: -1rem 0 3rem rgb(0 0 0 / 45%);
	}
	.sheet.wide {
		width: min(30rem, 100%);
	}
	.sheet-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid rgb(255 255 255 / 8%);
		padding: 1rem 1.1rem;
	}
	.sheet-head h2 {
		color: #f4d68c;
		font-size: 1.1rem;
		font-weight: 800;
	}
	.sheet-body {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		overflow-y: auto;
		padding: 1rem 1.1rem 2rem;
	}
	.sheet-body h3 {
		margin-top: 0.6rem;
		color: rgb(241 235 220 / 60%);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.muted {
		color: rgb(241 235 220 / 55%);
		font-size: 0.85rem;
	}
	.standings {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.standings li {
		display: grid;
		grid-template-columns: 1.1rem 2rem 1fr auto;
		align-items: center;
		gap: 0.6rem;
		border: 1px solid transparent;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.55rem 0.75rem;
		font-size: 0.9rem;
	}
	.standings li.me {
		border-color: rgb(240 209 140 / 22%);
		background: rgb(240 209 140 / 7%);
	}
	.standings li.leader {
		border-color: rgb(240 209 140 / 45%);
		background: linear-gradient(100deg, rgb(240 200 110 / 18%), rgb(240 200 110 / 4%));
	}
	.standings li.leader .place {
		color: #f4d68c;
	}
	.initials {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(255 255 255 / 8%);
		color: #f1ebdc;
		font-size: 0.72rem;
		font-weight: 750;
	}
	.leader .initials {
		background: linear-gradient(150deg, #f7df9d, #c08a34);
		color: #24180a;
	}
	.standings .who {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
	}
	.standings .who small {
		border-radius: 999px;
		background: rgb(240 209 140 / 14%);
		padding: 0 0.4rem;
		color: #f4d68c;
		font-size: 0.65rem;
		font-weight: 650;
	}
	.score {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		line-height: 1.2;
	}
	.score .delta {
		min-width: 0;
		font-size: 0.75rem;
	}
	.place {
		color: rgb(241 235 220 / 45%);
		font-weight: 700;
	}
	.who {
		display: flex;
		min-width: 0;
		flex-direction: column;
		overflow: hidden;
		font-weight: 650;
		text-overflow: ellipsis;
	}
	.who small {
		color: rgb(241 235 220 / 50%);
		font-size: 0.72rem;
		font-weight: 500;
	}
	.amt {
		color: #f0d18c;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.delta {
		min-width: 4.5rem;
		color: rgb(241 235 220 / 55%);
		font-size: 0.8rem;
		font-variant-numeric: tabular-nums;
		text-align: right;
	}
	.delta.up {
		color: #8fd6a5;
	}
	.delta.down {
		color: #ee9a8c;
	}
	/* One card per hand: the result on top, then a timeline of what happened. */
	.hand-card {
		margin-bottom: 0.55rem;
		border: 1px solid rgb(255 255 255 / 6%);
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.6rem 0.75rem 0.65rem;
	}
	.hand-card.current {
		border-color: rgb(127 212 155 / 30%);
	}
	.hand-card header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.2rem 0.6rem;
		margin-bottom: 0.4rem;
	}
	.hand-card header strong {
		font-size: 0.88rem;
	}
	.hand-card.current header strong {
		color: #8fd6a5;
	}
	.hand-win {
		color: #f7dc95;
	}
	.hand-card header small {
		color: rgb(241 235 220 / 45%);
		font-size: 0.72rem;
	}
	.log {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		border-left: 1px solid rgb(255 255 255 / 10%);
		margin-left: 0.25rem;
		padding-left: 0.75rem;
		color: rgb(241 235 220 / 80%);
		font-size: 0.82rem;
	}
	.log li {
		position: relative;
	}
	/* A dot on the timeline, coloured by what happened. */
	.log li::before {
		position: absolute;
		top: 0.5em;
		left: calc(-0.75rem - 3.5px);
		width: 6px;
		height: 6px;
		border-radius: 999px;
		background: rgb(241 235 220 / 35%);
		content: '';
	}
	.log li.k-raise::before {
		background: #f4d68c;
	}
	.log li.k-pack::before {
		background: #ee9a8c;
	}
	.log li.k-see::before {
		background: #b5dcff;
	}
	.log li.k-show::before {
		background: #f7dc95;
	}
	/* Hand rankings: each kind with its strongest and weakest hand, as real cards. */
	.ranks {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.ranks li {
		border-radius: 0.9rem;
		background:
			radial-gradient(ellipse at 50% 0%, rgb(46 125 80 / 30%), transparent 75%),
			rgb(255 255 255 / 3%);
		padding: 0.6rem 0.75rem 0.75rem;
	}
	.rank-title {
		margin-bottom: 0.45rem;
		font-size: 0.9rem;
		font-weight: 700;
	}
	.rank-title span {
		color: #f4d68c;
	}
	.rank-title small {
		margin-left: 0.3rem;
		color: rgb(241 235 220 / 50%);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.rank-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.rank-gap {
		flex: 1;
		border-top: 2px dashed rgb(241 235 220 / 25%);
	}
	.fan {
		display: flex;
		flex-shrink: 0;
	}
	.fan-card {
		display: block;
		width: 3.3rem;
		height: 4.7rem;
		border-radius: 0.3rem;
		box-shadow: 0 2px 6px rgb(0 0 0 / 40%);
	}
	.fan-card + .fan-card {
		margin-left: -1.1rem;
	}
	.howto {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding-left: 1rem;
		color: rgb(241 235 220 / 80%);
		font-size: 0.85rem;
		list-style: disc;
	}
	.bot-adder {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 0.3rem;
	}
	.levels {
		display: inline-flex;
		overflow: hidden;
		border: 1px solid rgb(241 235 220 / 16%);
		border-radius: 999px;
	}
	.levels button {
		padding: 0.25rem 0.6rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.72rem;
		font-weight: 650;
		text-transform: capitalize;
		cursor: pointer;
	}
	.levels button.on {
		background: rgb(240 200 110 / 22%);
		color: #f4d68c;
	}
	.levels.wide {
		align-self: flex-start;
		flex-wrap: wrap;
	}
	.levels button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.setting-block {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.setting-title {
		display: flex;
		flex-direction: column;
		font-size: 0.9rem;
		font-weight: 650;
	}
	.setting-title small {
		color: rgb(241 235 220 / 55%);
		font-weight: 500;
	}
	.limit {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 0.25rem;
		color: rgb(241 235 220 / 60%);
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums;
	}
	.limit-bar {
		width: 3.5rem;
		height: 0.25rem;
		overflow: hidden;
		border-radius: 999px;
		background: rgb(255 255 255 / 10%);
	}
	.limit-bar span {
		display: block;
		height: 100%;
		transform-origin: left;
		background: #e9bf62;
		transition: transform 300ms ease;
	}
	.mini.add-bot {
		padding: 0.3rem 0.8rem;
	}
	.link-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 5%);
		padding: 0.5rem 0.5rem 0.5rem 0.8rem;
	}
	.link-text {
		min-width: 0;
		flex: 1;
		overflow: hidden;
		color: rgb(241 235 220 / 80%);
		font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 0.75rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mini.share {
		align-self: flex-start;
		padding: 0.45rem 0.9rem;
	}
	.invite-form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.mini.send {
		align-self: flex-end;
		padding: 0.45rem 1rem;
		font-size: 0.82rem;
	}
	.invite-note {
		color: #8fd6a5;
		font-size: 0.82rem;
	}
	.invite-note.error {
		color: #f0a898;
	}
	.small {
		font-size: 0.75rem;
	}
	.invited {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.invited li {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		border-radius: 0.6rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.45rem 0.7rem;
		font-size: 0.85rem;
	}
	.invited small {
		color: rgb(241 235 220 / 50%);
	}
	.setting {
		display: flex;
		align-items: flex-start;
		gap: 0.7rem;
		cursor: pointer;
	}
	.setting span {
		display: flex;
		flex-direction: column;
		font-size: 0.9rem;
		font-weight: 650;
	}
	.setting small {
		color: rgb(241 235 220 / 55%);
		font-weight: 500;
	}
	@media (max-width: 959px) {
		.tp-shell {
			gap: 0.25rem;
			padding: 0.4rem 0.5rem 0;
		}
		.variant {
			display: none;
		}
		.tp-shell > :global([data-testid='action-dock']) {
			margin-inline: -0.5rem;
			width: calc(100% + 1rem);
			max-width: none;
		}
	}
	@media (max-width: 639px) {
		.room-code {
			max-width: 7.5rem;
		}
		.sep {
			display: none;
		}
		.tool,
		.tools :global(.mc-btn) {
			width: 1.95rem;
			height: 1.95rem;
		}
		.tools {
			gap: 0.2rem;
		}
		.pot {
			padding: 0.4rem 0.8rem 0.5rem;
		}
		.stakes {
			font-size: 0.62rem;
		}
		.feed {
			min-height: 2.8rem;
		}
		.feed-line:nth-child(3) {
			display: none;
		}
		.feed-line {
			font-size: 0.7rem;
		}
		.result {
			padding: 0.55rem 0.7rem;
		}
		.result-detail,
		.next {
			font-size: 0.68rem;
		}
		/* Phones: keep the result card short; bots are added from the invite panel. */
		.result-bots {
			display: none;
		}
	}
	@media (max-width: 420px) {
		.logo {
			display: none;
		}
		.tools :global(.mc-btn:nth-of-type(3)) {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.flying-chip {
			display: none;
		}
	}
</style>
