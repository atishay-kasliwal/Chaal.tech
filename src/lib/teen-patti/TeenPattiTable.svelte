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
		Bot,
		RotateCcw,
		Shuffle,
		LayoutGrid,
		ListOrdered,
		SkipForward
	} from '@lucide/svelte';
	import type { MediaState } from '#lib/media/controller.js';
	import { VARIANT_BY_VERSION, VARIANT_CATALOG, type RulesVersion } from '#lib/variant-catalog.js';
	import { arrangeSeats } from '#lib/seat-layout.js';
	import TpSeat from './TpSeat.svelte';
	import CasinoChip from '#lib/components/CasinoChip.svelte';
	import ChipStack from '#lib/components/ChipStack.svelte';
	import FriendPicker from '#lib/club/FriendPicker.svelte';
	import LineupEditor from '#lib/club/LineupEditor.svelte';
	import { lineupNext, slotName, handsLabel, MYSTERY } from '#lib/club/lineup.js';
	import GameDemo from '#lib/games/GameDemo.svelte';
	import { GAME_GUIDES } from '#lib/games/catalog.js';
	import { club } from '#lib/club/club.svelte.js';
	import BotAvatar from './BotAvatar.svelte';
	import SeatVideo from '#lib/components/SeatVideo.svelte';
	import ActionDock from './ActionDock.svelte';
	import TableMat from './TableMat.svelte';
	import NextGameCard from './NextGameCard.svelte';
	import DeckCut from './DeckCut.svelte';
	import VerifyDeck from './VerifyDeck.svelte';
	import { properName } from '#lib/names.js';
	import { matFor, REVIEW_GAMES, REVIEW_MS } from './table-cards.js';
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
	import { HOW_TO_PLAY } from './how-to-play.js';
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
		emailInvites,
		tableCards,
		gameTitle,
		onprepare
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
		/** Cards dealt to the table (a mat in the middle); the pot moves to its left. */
		tableCards?: Snippet;
		/** Overrides the game name in the top bar. */
		gameTitle?: string;
		/** Start the night: settle the first game and open the first cut (the deal follows). */
		onprepare?: () => Promise<boolean>;
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
			return `Pot limit reached: equal best hands${nameOf(winner) ? ` (${nameOf(winner)})` : ''}, pot split`;
		if (result.reason === 'pot-limit')
			return `Pot limit reached: everyone showed${nameOf(winner) ? `; ${nameOf(winner)} is best` : ''}`;
		// Running: the killer suit caught everyone still in, so the best hand among them takes it.
		const killerSymbol =
			({ spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' } as Record<string, string>)[
				room.variantState?.killer ?? ''
			] ?? '';
		if (result.reason === 'knockout-split')
			return `Everyone held ${killerSymbol}: equal best hands, pot split`;
		if (result.reason === 'knockout')
			return `Everyone held ${killerSymbol}${nameOf(winner) ? `; ${nameOf(winner)} is best` : ''}`;
		// Only the two hands compared at the Show; a player who looked and then packed is not one.
		const shown = room.usersList.filter((user) =>
			revealed.size ? revealed.has(user.id) : user.cardsInHand.some((c) => c.rank > 0)
		);
		const loser = shown.find((user) => user.id !== result.winnerId);
		const winName = nameOf(winner);
		const loseName = nameOf(loser);
		const lowest = room.rulesVersion === 'muflis-1' ? ' (lowest hand wins)' : '';
		// Running: a hand holding the killer suit can't win a Show.
		if (killerSymbol && loser) {
			const holds = (user: User) =>
				user.cardsInHand.some((card) => card.suit === room.variantState?.killer);
			const winnerUser = room.usersList.find((user) => user.id === result.winnerId);
			if (winnerUser && holds(winnerUser) && holds(loser))
				return `Both held ${killerSymbol}: ${winnerUser.username} opened last and wins`;
			if (holds(loser)) return `${loser.username} held ${killerSymbol}, so can’t win`;
		}
		if (result.reason === 'show-tie-requester-loses')
			return 'Equal hands, so whoever asked for the Show loses';
		if (winName && loseName && winName === loseName)
			return `Both have ${winName}, won on the higher side card${lowest}`;
		if (winName && loseName) return `${winName} beats ${loseName}${lowest}`;
		return 'Won at the show';
	});
	/** Real money tonight, people only (bots never count), best first. */
	const realPeople = $derived([...(room.realNet ?? [])].sort((a, b) => b.net - a.net));
	/** Your result tonight in real money; before any real hand, your chips. */
	const net = $derived(
		room.realNet
			? (room.realNet.find((person) => person.id === selfId)?.net ?? 0)
			: me
				? (me.balance ?? room.table) - room.table
				: 0
	);
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
	const total = $derived(room.turnMs ?? 90000);
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

	// ——— Tonight's lineup (set by club owners; everyone sees it) ———
	const isOwner = $derived(club.member?.role === 'owner');
	const lineup = $derived(
		(isOwner ? club.settings.lineup : (room.lineup ?? club.settings.lineup)) ?? []
	);
	/** Hands each lineup game is played for (0 = one round). */
	const lineupHands = $derived(
		(isOwner ? club.settings.lineupHands : (room.lineupHands ?? club.settings.lineupHands)) ?? 1
	);
	/** The lineup slot that comes next: the same game while it has hands left, then the next. */
	const upNext = $derived(
		lineupNext(lineup, room.lineupAt, room.rulesVersion, lineupHands, room.usersList.length)
			?.slot ?? null
	);
	/** Where the night is in the lineup, for the top bar: "3/8". */
	const lineupPos = $derived(
		room.lineupAt && lineup[room.lineupAt.index] !== undefined ? room.lineupAt.index + 1 : 0
	);
	/** A game to explain in the game panel (from the lineup); the current game otherwise. */
	let infoGame = $state<string | null>(null);
	let savingLineup = $state(false);
	async function saveLineup(next: string[], hands: number) {
		savingLineup = true;
		try {
			const { response, body } = await club.request('/admin', {
				method: 'POST',
				body: JSON.stringify({ action: 'lineup', lineup: next, hands })
			});
			if (response.ok && body.settings) club.applySettings(body.settings);
		} finally {
			savingLineup = false;
		}
	}

	// ——— Picking the next game: one person at a time, round robin, up to a minute ———
	const chooser = $derived(room.chooser ?? null);
	const chooserName = $derived(
		room.usersList.find((user) => user.id === chooser?.playerId)?.username ?? 'Someone'
	);
	const myPick = $derived(chooser?.playerId === selfId);
	const picking = $derived(!!chooser && !chooser.choice && now < chooser.deadline);
	const pickSecondsLeft = $derived(
		chooser ? Math.max(0, Math.ceil((chooser.deadline - now) / 1000)) : 0
	);
	const nameOfVariant = (version: string) =>
		version === MYSTERY
			? slotName(MYSTERY)
			: (VARIANT_BY_VERSION[version as RulesVersion]?.selectionLabel.split(': ')[0] ??
				'Teen Patti');
	/** The last games played at this table, newest first. */
	const gameLog = $derived([...(room.gameLog ?? [])].reverse());
	/** The next game once the server has settled it (a Random draw is already made). */
	const settled = $derived(room.upNext ?? null);
	/** The mode a pick left standing (random stays random), and who set it. */
	const standing = $derived(room.standing ?? null);
	/** What decides the next hand: this hand's pick, else the standing one, else the lineup. */
	const effectiveChoice = $derived(
		chooser?.choice ?? standing?.choice ?? (upNext ? 'next' : 'random')
	);
	const setBy = $derived.by(() => {
		const id = chooser?.choice ? chooser.playerId : standing?.by;
		if (!id) return null;
		return id === selfId ? 'you' : (room.usersList.find((u) => u.id === id)?.username ?? null);
	});
	/** What the next hand will be, in words. */
	const nextGame = $derived(
		settled
			? nameOfVariant(settled.rulesVersion)
			: !chooser
				? nextVariant
				: effectiveChoice === 'random'
					? 'Random'
					: effectiveChoice === 'next'
						? nameOfVariant(upNext ?? room.rulesVersion)
						: effectiveChoice === 'keep'
							? nameOfVariant(room.rulesVersion)
							: nameOfVariant(effectiveChoice)
	);
	/** The standing pick in words: "Random", "Lineup order" or a game's name. */
	const standingName = $derived(
		!standing
			? ''
			: standing.choice === 'random'
				? 'Random'
				: standing.choice === 'next'
					? 'Lineup order'
					: nameOfVariant(standing.choice)
	);
	const pickTileCount = $derived(
		(standing ? 1 : 0) +
			(upNext && standing?.choice !== 'next' ? 1 : 0) +
			(!standing || standing.choice !== room.rulesVersion ? 1 : 0) +
			(standing?.choice !== 'random' ? 1 : 0) +
			1
	);
	/** What comes after this hand, shown in the top bar while a hand is on. */
	const comingNext = $derived(
		chooser
			? nextGame
			: standing
				? standing.choice === 'random'
					? 'Random'
					: standing.choice === 'next'
						? nameOfVariant(upNext ?? room.rulesVersion)
						: nameOfVariant(standing.choice)
				: upNext
					? nameOfVariant(upNext)
					: null
	);
	const fromLineup = $derived(
		lineup.length > 0 && (effectiveChoice === 'next' || effectiveChoice === 'random')
	);
	let pickTotal = $state(60);
	let pickHand: string | null = null;
	$effect(() => {
		// A reopened pick (same hand, new deadline) restarts the ring too.
		const hand = chooser ? `${chooser.handId}:${chooser.deadline}` : null;
		const left = chooser ? chooser.deadline - Date.now() : 0;
		untrack(() => {
			if (hand === pickHand) return;
			pickHand = hand;
			if (panel === 'pick') panel = null;
			if (hand) pickTotal = Math.max(1, Math.round(left / 1000));
		});
	});
	const pickFraction = $derived(Math.min(1, pickSecondsLeft / pickTotal));
	$effect(() => {
		if (panel === 'pick' && !(picking && myPick)) untrack(() => (panel = null));
	});
	const pick = (choice: string) => {
		if (panel === 'pick') panel = null;
		void send('chooseNext', [choice]);
	};

	let dealAt = $state<number | null>(null);
	let paused = $state(false);
	let dealingFor: string | null = null;
	let dealError = $state('');
	let lastResultHand: string | null = null;
	/** Earliest automatic deal after a table-card hand (0 when there is no review time). */
	let reviewUntil = 0;
	const dealIn = $derived(dealAt === null ? null : Math.max(0, Math.ceil((dealAt - now) / 1000)));

	$effect(() => {
		const handId = result?.handId ?? null;
		const reason = result?.reason;
		untrack(() => {
			if (handId === lastResultHand) return;
			lastResultHand = handId;
			dealError = '';
			// Games with cards on the table leave them up for a minute, so everyone can see what happened.
			reviewUntil = handId && REVIEW_GAMES.has(room.rulesVersion) ? Date.now() + REVIEW_MS : 0;
			dealAt = handId
				? Math.max(reviewUntil, Date.now() + (reason === 'last-player' ? 5000 : 8000))
				: null;
			baseDealAt = dealAt ?? 0;
		});
	});
	// Once the next game is settled, everyone gets time to read it: 15 seconds for a new game
	// (5 alone with bots), a short pause for the same game. Table-card games still get their minute.
	let seenSettled: string | null = null;
	const settledKey = $derived(
		settled ? `${result?.handId}:${settled.rulesVersion}:${settled.dealAt}` : null
	);
	$effect(() => {
		const key = settledKey;
		untrack(() => {
			// Between hands, or in the waiting room once the host starts the night.
			if (!key || !settled || key === seenSettled || (dealAt === null && room.isStarted)) return;
			seenSettled = key;
			const wait = settled.changed ? settled.revealMs : 4000;
			baseDealAt = Math.max(reviewUntil, Date.now() + wait);
			dealAt = Math.max(baseDealAt, cutReadyAt);
		});
	});

	// ——— The cut: the deal waits for it (or for its 15 seconds to run out) ———
	let baseDealAt = 0;
	let cutReadyAt = 0;
	let cutSeen: string | null = null;
	/** When the cut's time runs out, on this device's clock. */
	let cutDeadline = $state(0);
	const cut = $derived(room.cut ?? null);
	const cutState = $derived(cut ? `${cut.by}:${cut.deadline}:${cut.at}` : null);
	$effect(() => {
		void cutState;
		untrack(() => {
			if (!cut) {
				cutReadyAt = 0;
				return;
			}
			const id = `${cut.by}:${cut.deadline}`;
			if (cutSeen !== id) {
				cutSeen = id;
				cutDeadline = Date.now() + cut.ms;
			}
			cutReadyAt = cut.at === null ? cutDeadline + 400 : Date.now() + 1500;
			if (dealAt !== null) dealAt = Math.max(baseDealAt, cutReadyAt);
		});
	});
	const cutLeft = $derived(
		cut && cut.at === null ? Math.max(0, Math.ceil((cutDeadline - now) / 1000)) : 0
	);
	/** Your turn to cut: the deck-cut card replaces the rules card for you. */
	const cutting = $derived(!!cut && cut.by === selfId && cut.at === null && cutLeft > 0);
	const cutterName = $derived(
		cut
			? cut.by === selfId
				? 'You'
				: (room.usersList.find((u) => u.id === cut.by)?.username ?? 'Someone')
			: ''
	);
	/** One line for everyone else: who is cutting, then where they cut. */
	const cutNote = $derived(
		!cut
			? ''
			: cut.at === null
				? cutLeft > 0
					? `✂ ${cutterName} ${cut.by === selfId ? 'are' : 'is'} cutting the deck · ${cutLeft}s`
					: ''
				: `✂ ${cutterName} cut the deck after card ${cut.at}`
	);
	const cutDeck = (at: number) => void send('cutDeck', [at]);
	async function startNight() {
		dealError = '';
		if (onprepare && !room.upNext) {
			if (!(await onprepare())) dealError = 'Could not start. Check the players at the table';
		} else await dealNow();
	}
	/** The rules card: open in the last seconds before a new game, unless you closed it. */
	let closedReveal = $state<string | null>(null);
	const revealLeft = $derived(
		settled && dealAt !== null && (result || !room.isStarted) ? Math.max(0, dealAt - now) : 0
	);
	const revealOpen = $derived(
		!!settled?.changed &&
			settled.revealMs > 0 &&
			revealLeft > 0 &&
			revealLeft <= settled.revealMs + 250 &&
			closedReveal !== settledKey
	);
	const revealBadge = $derived.by(() => {
		if (!settled) return '';
		if (settled.mode === 'random') return '🎲 Random picked';
		if (settled.mode === 'lineup') return 'Next in tonight’s lineup';
		if (settled.by === selfId) return 'You picked';
		const name = room.usersList.find((user) => user.id === settled.by)?.username;
		return name ? `${name} picked` : 'Picked for the table';
	});

	// While someone picks the next game, wait for them (up to their minute); once they pick,
	// deal a few seconds later.
	$effect(() => {
		const deadline = chooser?.deadline;
		const choice = chooser?.choice;
		untrack(() => {
			if (!deadline || dealAt === null || room.upNext) return;
			// Picked: deal shortly. Picking: wait for it. A standing pick: the normal countdown.
			if (choice)
				dealAt = Math.max(
					reviewUntil,
					Math.min(Math.max(dealAt, Date.now() + 4000), Date.now() + 5000)
				);
			else if (deadline > Date.now()) dealAt = Math.max(reviewUntil, deadline + 500);
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
		if (!(await ondeal())) dealError = 'Could not deal. Check the players at the table';
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
	// Moves on the table cards: open a mat card, lock a Chatai line, make a joker.
	const tableMove = (move: TableMove) => void send('tableAction', [move]);
	const makeJoker = (indexes: [number, number]) => tableMove({ kind: 'joker', indexes });
	/** The Chatai line being tried before it is locked; cleared every hand. */
	let previewLine = $state<number | null>(null);
	$effect(() => {
		void room.handId;
		previewLine = null;
	});
	const mat = $derived(
		tableCards
			? null
			: matFor(room, selfId, {
					previewLine,
					onopen: (index) => tableMove({ kind: 'open', index }),
					onpreview: (line) => (previewLine = line),
					onlock: (line) => {
						tableMove({ kind: 'line', line });
						previewLine = null;
					}
				})
	);
	/** Cards on the table this hand: the mat takes the centre and the pot steps aside. */
	const hasMat = $derived(!!tableCards || !!mat);
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
	let panel = $state<
		'scores' | 'rules' | 'settings' | 'invite' | 'pick' | 'lineup' | 'game' | 'verify' | null
	>(null);

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
				text: `Join my Teen Patti table: boot ₹${boot}, buy-in ₹${room.table}`,
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
{#snippet rulesAgain()}
	{#if settled?.changed && !revealOpen && revealLeft > 0}
		<button class="mini" onclick={() => (closedReveal = null)}>Rules</button>
	{/if}
{/snippet}

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
			<button
				class="variant-name"
				onclick={() => {
					infoGame = null;
					panel = 'game';
				}}
				title="How this game works"
				>{gameTitle ?? variant?.selectionLabel.split(': ')[0] ?? 'Teen Patti'}</button
			>
			{#if comingNext && comingNext !== (variant?.selectionLabel.split(': ')[0] ?? '')}
				<span class="dot">·</span>
				<span class="up-next">Next: <strong>{comingNext}</strong></span>
			{/if}
			{#if lineup.length}
				<button class="lineup-pill" onclick={() => (panel = 'lineup')} title="Tonight’s lineup"
					>{lineupPos
						? `Lineup ${lineupPos}/${lineup.length}`
						: `Lineup · ${lineup.length} games`}</button
				>
			{/if}
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
				class:has-lineup={lineup.length > 0}
				onclick={() => (panel = 'lineup')}
				title="Tonight's lineup"
				aria-label="Tonight's lineup"><ListOrdered class="h-4 w-4" /></button
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
		<div class="offline" role="status">Reconnecting. Actions are paused</div>
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
				<p>Share the link. Up to 6 players</p>
			</div>
		{/if}

		<div
			class="center"
			class:with-mat={hasMat && room.isStarted}
			class:reviewing={hasMat && room.isStarted && !!result}
			class:waiting={!room.isStarted && !result}
			data-testid="table-center"
			style:top="{centerTop}px"
		>
			{#if result}
				<!-- Table-card games keep the mat up beside the result, so everyone sees how it ended. -->
				{#if tableCards}{@render tableCards()}{:else if mat}<TableMat {...mat} />{/if}
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
					{#if chooser && picking && myPick}
						<div class="pick" data-testid="pick-next-game">
							<div class="pick-head">
								<span
									class="pick-ring"
									style:--left={pickFraction}
									role="timer"
									aria-label="{pickSecondsLeft} seconds to pick">{pickSecondsLeft}</span
								>
								<div>
									<p class="pick-title">Your turn to pick the next game</p>
									<p class="pick-sub">Everyone plays what you choose</p>
								</div>
							</div>
							<div class="pick-options" class:four={pickTileCount === 4}>
								{#if standing}
									<!-- The pick already standing at the table: one tap keeps it. -->
									<button class="pick-option keep" onclick={() => pick(standing.choice)}>
										<RotateCcw class="h-5 w-5" />
										<strong>Keep</strong>
										<small>{standingName}</small>
									</button>
								{/if}
								{#if upNext && standing?.choice !== 'next'}
									<button class="pick-option" class:keep={!standing} onclick={() => pick('next')}>
										<SkipForward class="h-5 w-5" />
										<strong>Next up</strong>
										<small>{nameOfVariant(upNext)}</small>
									</button>
								{/if}
								{#if !standing}
									<button class="pick-option" class:keep={!upNext} onclick={() => pick('keep')}>
										<RotateCcw class="h-5 w-5" />
										<strong>Keep</strong>
										<small>{nameOfVariant(room.rulesVersion)}</small>
									</button>
								{/if}
								{#if standing && standing.choice !== room.rulesVersion}
									<button class="pick-option" onclick={() => pick('keep')}>
										<RotateCcw class="h-5 w-5" />
										<strong>Same game</strong>
										<small>{nameOfVariant(room.rulesVersion)}</small>
									</button>
								{/if}
								{#if standing?.choice !== 'random'}
									<button class="pick-option" onclick={() => pick('random')}>
										<Shuffle class="h-5 w-5" />
										<strong>Random</strong>
										<small>Surprise us</small>
									</button>
								{/if}
								<button
									class="pick-option"
									class:on={panel === 'pick'}
									aria-haspopup="dialog"
									onclick={() => (panel = 'pick')}
								>
									<LayoutGrid class="h-5 w-5" />
									<strong>Change</strong>
									<small>{VARIANT_CATALOG.length} games</small>
								</button>
							</div>
						</div>
					{:else if chooser && picking}
						<p class="next-game waiting">
							<span class="pulse" aria-hidden="true"></span>
							<strong>{chooserName}</strong> is picking the next game · {pickSecondsLeft}s<small
								>&nbsp;({standing ? standingName : upNext ? 'the lineup' : 'Random'} if no {standing
									? 'change'
									: 'pick'})</small
							>
						</p>
					{:else}
						<!-- One line: what's next, where it comes from, who set it, and Change on your turn. -->
						<p class="next-game">
							Next game: <strong>{nextGame}</strong>
							{#if settled?.mode === 'random'}<small>· 🎲 random</small>{/if}
							{#if fromLineup}<button class="link" onclick={() => (panel = 'lineup')}
									>{effectiveChoice === 'random' ? 'from the lineup' : 'lineup'} ›</button
								>{/if}
							{#if setBy}<small>· set by {setBy}</small>{/if}
							{#if chooser && myPick && !chooser.choice}<button
									class="change-next"
									onclick={() => void send('openPick')}>Change</button
								>{/if}
						</p>
					{/if}
					{#if cutNote}<p class="cut-note">{cutNote}</p>{/if}
					{#if room.deckProof?.leaves}
						<button class="verify-link" onclick={() => (panel = 'verify')}
							>🔒 Fair deck · verify</button
						>
					{/if}
					{#if dealIn !== null}
						<div class="next" data-testid="next-round-controls">
							{#if isHost}
								{#if picking}
									<span>Dealing once the game is picked</span>
								{:else if autoDeal && !paused}
									<span>Next hand in {dealIn}s</span>
									{@render rulesAgain()}
									<button class="mini" onclick={() => (paused = true)}
										><Pause class="h-3.5 w-3.5" /> Pause</button
									>
								{:else}
									<span>Paused</span>
								{/if}
								<button
									class="mini gold"
									onclick={dealNow}
									disabled={!canDeal || picking}
									data-testid="next-round-start"><Play class="h-3.5 w-3.5" /> Deal now</button
								>
								{#if !chooser}{@render variantChip()}{/if}
							{:else if picking}
								<span>Dealing once the game is picked</span>
							{:else if autoDeal}
								<span>Next hand in {dealIn}s</span>
								{@render rulesAgain()}
							{:else}
								<span>Waiting for the host to deal</span>
							{/if}
						</div>
						{#if dealError}<p class="deal-error">{dealError}</p>{/if}
					{/if}
					{#if isHost && canAddBot}<div class="result-bots">
							{@render botAdder()}
						</div>{/if}
				</div>
			{:else if !room.isStarted}
				<div class="lobby" in:fade>
					<p class="lobby-eyebrow">
						Waiting room · {room.usersList.length}/6 seated · boot {money(
							boot
						)}{#if lineup.length}&nbsp;· lineup: {handsLabel(lineupHands).toLowerCase()} each{/if}
					</p>
					<p class="lobby-title">
						<Sparkles class="h-4 w-4" />
						{eligible.length < 2
							? 'Waiting for friends to join'
							: `${room.usersList.length} at the table`}
					</p>
					<!-- Who's here: everyone seated, people first. -->
					<ul class="here" aria-label="At the table">
						{#each [...room.usersList].sort((a, b) => Number(!!a.bot) - Number(!!b.bot)) as user, index (user.id)}
							<li style:--i={index} class:bot={!!user.bot}>
								<span class="dot" class:on={user.connected}
								></span>{user.username}{#if user.id === room.hostId}<small>host</small
									>{:else if user.bot}<small>bot</small>{/if}
							</li>
						{/each}
					</ul>
					{#if isHost}
						<div class="lobby-actions">
							<button
								class="deal-btn"
								onclick={startNight}
								disabled={!canDeal}
								data-testid="deal-first"
							>
								<Play class="h-4 w-4" /> Start the night
							</button>
							<button class="mini" onclick={oninvite}
								><UserPlus class="h-3.5 w-3.5" /> Invite</button
							>
							{#if !lineup.length}{@render variantChip()}{/if}
							{@render botAdder()}
						</div>

						{#if !canDeal}
							<p class="lobby-hint">
								{eligible.length < 2
									? 'Need at least 2 players at the table'
									: 'Waiting for everyone to switch on “Deal me in”'}
							</p>
						{/if}
						{#if dealError}<p class="deal-error">{dealError}</p>{/if}
					{:else}
						<p class="lobby-hint">
							{room.usersList.find((user) => user.id === room.hostId)?.username ?? 'The host'} starts
							the game when everyone is here
						</p>
					{/if}
					{#if cutNote}<p class="cut-note">{cutNote}</p>{/if}
					<!-- Tonight's lineup: each game deals itself in; tap one to see how it's played. -->
					{#if lineup.length}
						<div
							class="night"
							aria-label="Tonight’s lineup: tap a game for its rules"
							title="Tonight’s lineup · {handsLabel(lineupHands)} each · tap a game for its rules"
						>
							{#each lineup as slot, index (`${slot}-${index}`)}
								{@const guide = GAME_GUIDES.find((game) => game.id === slot)}
								<button
									class="night-game"
									class:mystery={slot === MYSTERY}
									style:--i={index}
									onclick={() => {
										if (slot === MYSTERY) return;
										infoGame = slot;
										panel = 'game';
									}}
								>
									<span class="night-no">{index + 1}</span>
									{#if guide}<GameDemo game={guide} compact />{:else}<span class="mystery-face"
											>🎲</span
										>{/if}
									<strong>{nameOfVariant(slot)}</strong>
									<small
										>{slot === MYSTERY ? 'A surprise game' : (HOW_TO_PLAY[slot]?.win ?? '')}</small
									>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				{#if tableCards}{@render tableCards()}{:else if mat}<TableMat {...mat} />{/if}
				<div class="pot" aria-live="polite">
					{#if room.pot}
						<span class="pot-chips">
							<ChipStack
								amount={room.pot}
								size={hasMat ? (portrait ? '1.6rem' : '2.3rem') : portrait ? '2.3rem' : '3.6rem'}
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

		<!-- The last five games sit in the top-right corner, mirroring the actions on the left. -->
		{#if gameLog.length && !portrait}
			<ol class="game-log" aria-label="Last games played">
				{#each gameLog as entry, index (entry.handId)}
					<li class="game-line" style:opacity={1 - index * 0.16}>
						<strong>{nameOfVariant(entry.rulesVersion)}</strong>
						<span>· {properName(entry.winner)} won</span>
					</li>
				{/each}
			</ol>
		{/if}

		{#if cutting && cut}
			<DeckCut
				gameName={settled ? nameOfVariant(settled.rulesVersion) : nameOfVariant(room.rulesVersion)}
				commitment={cut.commitment ?? ''}
				seconds={cutLeft}
				total={Math.round(cut.ms / 1000)}
				oncut={cutDeck}
			/>
		{:else if revealOpen && settled}
			<NextGameCard
				rulesVersion={settled.rulesVersion}
				name={nameOfVariant(settled.rulesVersion)}
				badge={revealBadge}
				seconds={Math.ceil(revealLeft / 1000)}
				total={Math.round(settled.revealMs / 1000)}
				note={cutNote}
				onclose={() => (closedReveal = settledKey)}
			/>
		{/if}

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
			onjoker={makeJoker}
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
					{panel === 'game'
						? infoGame
							? nameOfVariant(infoGame)
							: (variant?.selectionLabel.split(': ')[0] ?? 'Teen Patti')
						: panel === 'verify'
							? 'Fair deck check'
							: panel === 'lineup'
								? 'Tonight’s lineup'
								: panel === 'pick'
									? 'Pick the next game'
									: panel === 'scores'
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
				{#if panel === 'verify' && room.deckProof?.leaves}
					<VerifyDeck
						proof={room.deckProof as Parameters<typeof VerifyDeck>[1]['proof']}
						names={Object.fromEntries(room.usersList.map((user) => [user.id, user.username]))}
					/>
				{:else if panel === 'game'}
					{@const how = HOW_TO_PLAY[infoGame ?? room.rulesVersion]}
					<div class="how">
						<p class="how-win">{how?.win ?? variant?.description}</p>
						{#if how}
							<ul>
								{#each how.points as point (point)}<li>{point}</li>{/each}
							</ul>
						{/if}
						{#if comingNext}
							<p class="how-next">Next game: <strong>{comingNext}</strong></p>
						{/if}
						<button class="link" onclick={() => (panel = 'rules')}>See all hand rankings ›</button>
					</div>
				{:else if panel === 'lineup'}
					<LineupEditor
						{lineup}
						hands={lineupHands}
						at={room.lineupAt}
						current={room.rulesVersion}
						editable={isOwner}
						saving={savingLineup}
						onsave={saveLineup}
						oninfo={(version) => {
							infoGame = version;
							panel = 'game';
						}}
					/>
				{:else if panel === 'pick'}
					{#if chooser && picking && myPick}
						<p class="pick-drawer-clock">
							<span class="pick-ring small" style:--left={pickFraction}>{pickSecondsLeft}</span>
							Everyone plays what you choose. Tap a game.
						</p>
						<div class="pick-list" role="listbox" aria-label="Next game">
							{#each VARIANT_CATALOG as option (option.rulesVersion)}
								<button
									role="option"
									aria-selected={option.rulesVersion === room.rulesVersion}
									class:current={option.rulesVersion === room.rulesVersion}
									onclick={() => pick(option.rulesVersion)}
								>
									<strong
										>{option.selectionLabel.split(
											': '
										)[0]}{#if option.rulesVersion === room.rulesVersion}<em>Now playing</em
											>{/if}</strong
									>
									<small>{option.description}</small>
								</button>
							{/each}
						</div>
					{:else}
						<p class="muted">The pick for the next game has closed.</p>
					{/if}
				{:else if panel === 'invite'}
					<p class="muted">
						Up to 6 players sit at a table. Friends join straight from the link. No app, no sign-up.
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
										>{delta === null ? '-' : signedMoney(delta)}</span
									>
								</span>
							</li>
						{/each}
					</ol>
					<!-- Real money: only what moved between people, and the fewest payments to settle it. -->
					<section class="money" aria-label="Real money tonight">
						<h3>Real money tonight</h3>
						<p class="money-note">
							Only money between people counts. Chips won from a bot, or lost to one, don’t.
						</p>
						{#if realPeople.length}
							<ul class="real">
								{#each realPeople as person (person.id)}
									<li class:me={person.id === selfId}>
										<span
											>{properName(person.name)}{#if person.id === selfId}<small>You</small
												>{/if}</span
										>
										<strong class:up={person.net > 0} class:down={person.net < 0}
											>{signedMoney(person.net)}</strong
										>
									</li>
								{/each}
							</ul>
							<h3>Settle up</h3>
							{#if room.settleUp?.length}
								<ul class="payments">
									{#each room.settleUp as payment (`${payment.from}-${payment.to}`)}
										<li>
											<strong
												>{payment.from === selfId ? 'You' : properName(payment.fromName)}</strong
											>
											<span class="arrow">pay{payment.from === selfId ? '' : 's'} →</span>
											<strong>{payment.to === selfId ? 'you' : properName(payment.toName)}</strong>
											<span class="amount">{money(payment.amount)}</span>
										</li>
									{/each}
								</ul>
							{:else}
								<p class="money-note">Everyone is square so far.</p>
							{/if}
						{:else}
							<p class="money-note">Nothing yet: the first hand between people starts the count.</p>
						{/if}
					</section>
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
	/* What's being played, on a gold pill so it reads at a glance. */
	.variant-name {
		border: 1px solid rgb(240 209 140 / 45%);
		border-radius: 999px;
		background: linear-gradient(180deg, rgb(244 214 140 / 22%), rgb(244 214 140 / 10%));
		padding: 0.18rem 0.75rem;
		color: #f7dc95;
		font-size: 0.95rem;
		font-weight: 750;
		letter-spacing: 0.01em;
		box-shadow: 0 0 1rem rgb(244 214 140 / 12%);
	}
	.variant-name {
		cursor: pointer;
	}
	.variant-name:hover {
		background: rgb(244 214 140 / 26%);
	}
	.up-next {
		color: rgb(241 235 220 / 65%);
		font-size: 0.85rem;
	}
	.up-next strong {
		color: #f4d68c;
	}
	/* "How this game works" panel. */
	.how {
		display: grid;
		gap: 0.75rem;
	}
	.how-win {
		color: #f7dc95;
		font-size: 1.15rem;
		font-weight: 800;
		line-height: 1.3;
	}
	.how ul {
		display: grid;
		gap: 0.45rem;
		padding-left: 1.1rem;
		color: rgb(241 235 220 / 85%);
		font-size: 0.95rem;
		list-style: disc;
	}
	.how-next {
		border-radius: 0.8rem;
		background: rgb(244 214 140 / 10%);
		padding: 0.6rem 0.8rem;
		color: rgb(241 235 220 / 80%);
	}
	.how-next strong {
		color: #f4d68c;
	}
	.how .link {
		justify-self: start;
		color: #f4d68c;
		text-decoration: underline;
		cursor: pointer;
	}
	/* Picking the next game, inside the result panel. */
	.pick {
		display: grid;
		width: 100%;
		gap: 0.75rem;
		margin-top: 0.45rem;
		border: 1px solid rgb(244 214 140 / 30%);
		border-radius: 1.15rem;
		background: linear-gradient(180deg, rgb(244 214 140 / 10%), rgb(244 214 140 / 4%));
		padding: 0.85rem;
	}
	.pick-head {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		text-align: left;
	}
	/* Countdown ring: gold drains as the minute runs out. */
	.pick-ring {
		display: grid;
		width: 2.6rem;
		height: 2.6rem;
		flex-shrink: 0;
		place-items: center;
		border-radius: 999px;
		background:
			radial-gradient(closest-side, #0c1f15 78%, transparent 80% 100%),
			conic-gradient(#f4d68c calc(var(--left) * 1turn), rgb(255 255 255 / 10%) 0);
		color: #f7dc95;
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
		font-weight: 800;
		transition: background 300ms linear;
	}
	.pick-title {
		color: #f7dc95;
		font-size: 1.05rem;
		font-weight: 800;
	}
	.pick-sub {
		color: rgb(241 235 220 / 55%);
		font-size: 0.78rem;
	}
	.pick-options {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}
	.pick-option {
		display: grid;
		justify-items: center;
		gap: 0.15rem;
		border: 1px solid rgb(240 209 140 / 22%);
		border-radius: 0.95rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.7rem 0.4rem 0.6rem;
		color: #f4d68c;
		cursor: pointer;
		transition:
			transform 140ms ease,
			border-color 140ms ease,
			background 140ms ease;
	}
	.pick-option strong {
		color: #f1ebdc;
		font-size: 0.95rem;
	}
	.pick-option small {
		max-width: 100%;
		overflow: hidden;
		color: rgb(241 235 220 / 55%);
		font-size: 0.72rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pick-option:hover {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 10%);
		transform: translateY(-2px);
	}
	.pick-option.keep {
		border-color: transparent;
		background: linear-gradient(180deg, #f3d996, #c9963d);
		box-shadow: 0 0.5rem 1.2rem rgb(201 150 61 / 30%);
		color: #24180a;
	}
	.pick-option.keep strong,
	.pick-option.keep small {
		color: #24180a;
	}
	.pick-option.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 14%);
	}
	.pick-options.four {
		grid-template-columns: repeat(4, 1fr);
	}
	.tool.has-lineup {
		border-color: rgb(244 214 140 / 55%);
		color: #f4d68c;
	}
	.next-game .link {
		margin-left: 0.25rem;
		color: rgb(244 214 140 / 80%);
		font-size: 0.85em;
		text-decoration: underline;
		cursor: pointer;
	}
	.change-next {
		margin-left: 0.4rem;
		border: 1px solid rgb(244 214 140 / 45%);
		border-radius: 999px;
		padding: 0.1rem 0.65rem;
		color: #f4d68c;
		font-size: 0.8rem;
		font-weight: 700;
		cursor: pointer;
	}
	.change-next:hover {
		background: rgb(244 214 140 / 12%);
	}
	/* Phones: a compact pick so it clears your raised hand. */
	.arena.portrait .result {
		gap: 0.15rem;
		padding: 0.6rem 0.7rem 0.55rem;
	}
	.arena.portrait .result :global(.trophy) {
		display: none;
	}
	.arena.portrait .result-title {
		font-size: 1.1rem;
	}
	.arena.portrait .pick {
		gap: 0.45rem;
		margin-top: 0.25rem;
		padding: 0.55rem;
	}
	.arena.portrait .pick-ring {
		width: 2rem;
		height: 2rem;
		font-size: 0.75rem;
	}
	.arena.portrait .pick-title {
		font-size: 0.9rem;
	}
	.arena.portrait .pick-sub {
		display: none;
	}
	.arena.portrait .pick-option {
		grid-auto-flow: column;
		gap: 0.3rem;
		align-items: center;
		padding: 0.45rem 0.3rem;
	}
	.arena.portrait .pick-option small {
		display: none;
	}
	.arena.portrait .pick-options.four {
		grid-template-columns: repeat(2, 1fr);
	}
	.arena.portrait .pick-option strong {
		font-size: 0.85rem;
	}
	/* The full list of games, in the side drawer. */
	.pick-drawer-clock {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.85rem;
	}
	.pick-ring.small {
		width: 2.1rem;
		height: 2.1rem;
		font-size: 0.78rem;
	}
	.pick-list {
		display: grid;
		gap: 0.45rem;
	}
	.pick-list button {
		display: grid;
		gap: 0.15rem;
		border: 1px solid rgb(240 209 140 / 18%);
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.7rem 0.85rem;
		color: #f1ebdc;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 140ms ease,
			background 140ms ease;
	}
	.pick-list button strong {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.95rem;
	}
	.pick-list button em {
		border-radius: 999px;
		background: rgb(244 214 140 / 16%);
		padding: 0.05rem 0.5rem;
		color: #f4d68c;
		font-size: 0.68rem;
		font-style: normal;
		font-weight: 650;
	}
	.pick-list button small {
		color: rgb(241 235 220 / 55%);
		font-size: 0.78rem;
		line-height: 1.35;
	}
	.pick-list button:hover {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 10%);
	}
	.pick-list button.current {
		border-color: rgb(244 214 140 / 45%);
	}
	.next-game {
		margin-top: 0.3rem;
		color: rgb(241 235 220 / 75%);
		font-size: 0.95rem;
	}
	.next-game strong {
		color: #f7dc95;
	}
	.next-game small {
		color: rgb(241 235 220 / 50%);
	}
	.next-game.waiting {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 999px;
		background: rgb(244 214 140 / 10%);
		padding: 0.3rem 0.8rem;
	}
	.pulse {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 999px;
		background: #f4d68c;
		animation: tp-pick-pulse 1.2s ease-in-out infinite;
	}
	@keyframes tp-pick-pulse {
		50% {
			opacity: 0.3;
		}
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
	/* With cards on the table: the pot on the left, the mat and joker tray beside it. */
	.center.with-mat {
		width: min(56rem, 80%);
		translate: -50% calc(-50% - 0.9rem);
		flex-direction: row-reverse;
		justify-content: center;
		gap: 1.2rem;
	}
	/* After a table-card hand: the result sits beside the mat, narrower and shorter. */
	.center.with-mat .result {
		width: auto;
		min-width: 0;
		max-width: 27rem;
		flex: 1 1 24rem;
		padding: 0.7rem 1rem 0.75rem;
	}
	/* The result is taller than the pot: lift the row clear of your cards. */
	.center.with-mat.reviewing {
		translate: -50% calc(-50% - 2.4rem);
	}
	.center.with-mat .result :global(.trophy),
	.center.with-mat .result-bots {
		display: none;
	}
	/* The pot steps back so the cards on the table lead; still easy to read. */
	.center.with-mat .pot {
		flex: none;
		padding: 0.3rem 0.6rem 0.4rem;
	}
	.center.with-mat .pot-amount {
		font-size: clamp(1.15rem, 2vw, 1.6rem);
	}
	.center.with-mat .stakes {
		font-size: 0.68rem;
	}
	.arena.portrait .center.with-mat {
		width: 92%;
		flex-direction: column-reverse;
		gap: 0.4rem;
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
		left: 0;
		z-index: 4;
		display: flex;
		max-width: min(17rem, calc(50% - var(--seat-w, 12rem) / 2 - 1rem));
		margin: 0;
		padding: 0;
		list-style: none;
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
	   as one pill aligned left above your hand. */
	.arena.portrait .feed {
		top: auto;
		bottom: 0.4rem;
		left: 0;
		max-width: calc(100% - 1.5rem);
		align-items: flex-start;
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
	.cut-note {
		color: #f4d68c;
		font-size: 0.85rem;
		font-weight: 700;
	}
	.verify-link {
		color: rgb(241 235 220 / 70%);
		font-size: 0.78rem;
		text-decoration: underline;
		text-decoration-color: rgb(244 214 140 / 40%);
		cursor: pointer;
	}
	.verify-link:hover {
		color: #f4d68c;
	}
	/* Top bar: where the night is in tonight's lineup; opens the lineup. */
	.lineup-pill {
		border: 1px solid rgb(244 214 140 / 35%);
		border-radius: 999px;
		background: rgb(244 214 140 / 8%);
		padding: 0.15rem 0.6rem;
		color: #f4d68c;
		font-size: 0.78rem;
		font-weight: 750;
		cursor: pointer;
	}
	.lineup-pill:hover {
		background: rgb(244 214 140 / 18%);
	}
	.game-log {
		position: absolute;
		top: 0.4rem;
		right: 0;
		z-index: 4;
		display: flex;
		max-width: min(17rem, calc(50% - var(--seat-w, 12rem) / 2 - 1rem));
		margin: 0;
		padding: 0;
		list-style: none;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
		text-align: right;
		pointer-events: none;
	}
	.game-line {
		color: #f1ebdc;
		font-size: 0.85rem;
		line-height: 1.2;
		text-shadow: 0 1px 3px rgb(0 0 0 / 70%);
		white-space: nowrap;
	}
	.game-line strong {
		color: #f4d68c;
		font-weight: 650;
	}
	.game-line span {
		color: rgb(241 235 220 / 75%);
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
	/* The end-of-hand card: wider than the centre column, gold-edged, glowing like the pot. */
	.result {
		display: flex;
		width: max(100%, min(32rem, 92cqw));
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		border-radius: 1.5rem;
		background:
			radial-gradient(ellipse 80% 60% at 50% 0%, rgb(244 214 140 / 14%), transparent 70%),
			linear-gradient(180deg, rgb(10 30 20 / 92%), rgb(5 16 11 / 92%));
		padding: 1.1rem 1.3rem 1rem;
		box-shadow:
			inset 0 0 0 1px rgb(240 200 120 / 40%),
			inset 0 1px 0 rgb(255 240 200 / 12%),
			0 1.2rem 2.8rem rgb(0 0 0 / 50%),
			0 0 3.5rem rgb(240 200 110 / 16%);
		backdrop-filter: blur(6px);
	}
	.result :global(.trophy) {
		color: #f4d68c;
		filter: drop-shadow(0 0 0.6rem rgb(244 214 140 / 55%));
	}
	.result-title {
		font-size: clamp(1.25rem, 2.4vw, 1.7rem);
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
		gap: 0.5rem;
		width: 100%;
	}
	/* The waiting room gets the middle of the table, a little below the top seat. */
	.center.waiting {
		width: min(48rem, 84%);
		translate: -50% calc(-50% + 0.6rem);
	}
	.night-game :global(.demo.compact) {
		--card-w: 38px;
		--card-h: 55px;
		min-height: 76px;
		padding: 12px 4px 4px;
	}
	.night-game :global(.demo.compact .scene-number) {
		font-size: 72px;
		top: 4px;
	}
	.lobby-eyebrow {
		color: rgb(244 227 181 / 60%);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}
	.here {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.here li {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid rgb(244 214 140 / 22%);
		border-radius: 999px;
		background: rgb(6 14 10 / 55%);
		padding: 0.2rem 0.65rem;
		color: #f1ebdc;
		font-size: 0.85rem;
		font-weight: 650;
		animation: pop-in 380ms calc(var(--i) * 70ms) both cubic-bezier(0.2, 0.9, 0.3, 1.3);
	}
	.here li small {
		color: #f4d68c;
		font-size: 0.68rem;
		font-weight: 800;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.here li.bot small {
		color: rgb(241 235 220 / 50%);
	}
	.here .dot {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 999px;
		background: rgb(255 255 255 / 25%);
	}
	.here .dot.on {
		background: #6fe0a0;
		box-shadow: 0 0 8px #6fe0a0;
	}
	.night {
		display: flex;
		max-width: 100%;
		gap: 0.6rem;
		overflow-x: auto;
		padding: 0.6rem 0.2rem 0.5rem;
		scroll-snap-type: x mandatory;
	}
	.night-game {
		position: relative;
		display: grid;
		flex: 0 0 8.6rem;
		justify-items: center;
		gap: 0.1rem;
		border: 1px solid rgb(244 214 140 / 25%);
		border-radius: 1rem;
		background:
			radial-gradient(ellipse at 50% 0%, rgb(244 214 140 / 12%), transparent 70%),
			rgb(6 14 10 / 78%);
		padding: 0.2rem 0.6rem 0.65rem;
		cursor: pointer;
		scroll-snap-align: start;
		animation: pop-in 460ms calc(var(--i) * 110ms) both cubic-bezier(0.2, 0.9, 0.3, 1.2);
		transition:
			transform 160ms ease,
			border-color 160ms ease;
	}
	.night-game:hover {
		transform: translateY(-3px);
		border-color: #f4d68c;
	}
	.night-game :global(.demo) {
		width: 100%;
	}
	.night-game strong {
		color: #f7dc95;
		font-size: 0.92rem;
	}
	.night-game small {
		color: rgb(241 235 220 / 70%);
		font-size: 0.72rem;
		line-height: 1.3;
		text-align: center;
	}
	.night-no {
		position: absolute;
		top: 0.4rem;
		left: 0.5rem;
		display: grid;
		width: 1.35rem;
		height: 1.35rem;
		place-items: center;
		border-radius: 999px;
		background: #f4d68c;
		color: #2d1f05;
		font-size: 0.72rem;
		font-weight: 850;
	}
	.night-game.mystery {
		border-color: rgb(196 155 255 / 40%);
		background:
			radial-gradient(ellipse at 50% 20%, rgb(196 155 255 / 22%), transparent 70%),
			rgb(6 14 10 / 78%);
	}
	.mystery-face {
		display: grid;
		height: 76px;
		place-items: center;
		font-size: 2.6rem;
		animation: wobble 2.4s ease-in-out infinite;
	}
	.lobby-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
	}
	.lobby-actions :global(.bot-adder) {
		margin: 0;
	}
	@keyframes pop-in {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.92);
		}
	}
	@keyframes wobble {
		50% {
			transform: rotate(-10deg) scale(1.08);
		}
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
	.money {
		display: grid;
		gap: 0.5rem;
		margin-top: 1.2rem;
		border-top: 1px solid rgb(255 255 255 / 8%);
		padding-top: 1rem;
	}
	.money h3 {
		color: #f4d68c;
		font-size: 0.8rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.money-note {
		color: rgb(241 235 220 / 60%);
		font-size: 0.8rem;
		line-height: 1.4;
	}
	.money ul {
		display: grid;
		gap: 0.35rem;
		margin: 0 0 0.6rem;
		padding: 0;
		list-style: none;
	}
	.real li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-radius: 0.6rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.45rem 0.7rem;
	}
	.real li.me {
		box-shadow: inset 0 0 0 1px rgb(244 214 140 / 35%);
	}
	.real small {
		margin-left: 0.4rem;
		color: #f4d68c;
		font-size: 0.7rem;
		font-weight: 800;
	}
	.real strong {
		font-variant-numeric: tabular-nums;
	}
	.real strong.up {
		color: #8fe0a8;
	}
	.real strong.down {
		color: #ee9a8c;
	}
	.payments li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 0.7rem;
		background: linear-gradient(90deg, rgb(244 214 140 / 10%), rgb(255 255 255 / 3%));
		padding: 0.55rem 0.8rem;
	}
	.payments .arrow {
		color: rgb(241 235 220 / 55%);
		font-size: 0.82rem;
	}
	.payments .amount {
		margin-left: auto;
		color: #f7dc95;
		font-size: 1.05rem;
		font-weight: 850;
		font-variant-numeric: tabular-nums;
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
