<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import { page } from '$app/state';
	import TeenPattiTable from '#lib/teen-patti/TeenPattiTable.svelte';
	import TableMat, { type MatCard, type MatLine } from '#lib/teen-patti/TableMat.svelte';

	/**
	 * Design preview for games that put cards on the table (Chatai, Running, Rotating Joker,
	 * Auction, Kiss-Miss-Bliss). The real table with made-up hands; nothing here talks to a server.
	 */
	type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
	const R: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11 };
	const S: Record<string, Suit> = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
	const c = (text: string) => ({
		rank: R[text.slice(0, -1)] ?? Number(text.slice(0, -1)),
		suit: S[text.slice(-1)]
	});
	const hidden = (n = 3) => Array.from({ length: n }, () => ({ rank: 0, suit: '' }));

	type Seat = Partial<User>;
	function user(id: string, seat: number, username: string, over: Seat = {}): User {
		return {
			id,
			username,
			balance: 1000,
			handBet: 20,
			seatNumber: seat,
			cardsInHand: hidden(),
			isBlind: false,
			isPacked: false,
			connected: true,
			ready: true,
			hasLeft: false,
			...over
		};
	}
	function room(over: Partial<RoomData>, users: User[], turn = 0): RoomData {
		return {
			name: 'preview',
			selfId: 'me',
			hostId: 'me',
			revision: 1,
			handId: 'h1',
			rulesVersion: 'classic-1',
			currentPlayer: turn,
			gameShow: false,
			isStarted: true,
			initiator: null,
			maxStake: 400,
			pot: 240,
			table: 1000,
			boot: 10,
			autoReady: true,
			potLimit: 0,
			turnMs: 90000,
			deadline: Date.now() + 70000,
			usersList: users,
			result: null,
			legalActions: {
				start: false,
				bet: turn === 0,
				pack: turn === 0,
				show: turn === 0,
				minBet: 20,
				maxBet: 40
			},
			...over
		};
	}
	const others = (over: Record<string, Seat> = {}) => [
		user('raju', 1, 'raju', { ...over.raju }),
		user('tinku', 2, 'tinku', { isBlind: true, ...over.tinku }),
		user('pinky', 3, 'pinky', { ...over.pinky })
	];
	const me = (cards: string[], over: Partial<User> = {}) =>
		user('me', 0, 'atishay', { cardsInHand: cards.map(c), ...over });

	const open = (text: string, extra: Partial<MatCard> = {}): MatCard => ({
		card: c(text),
		open: true,
		wild: true,
		...extra
	});
	const shut = (extra: Partial<MatCard> = {}): MatCard => ({ ...extra });
	const ALL_LINES: [number, number][][] = [
		[
			[0, 0],
			[0, 2]
		],
		[
			[1, 0],
			[1, 2]
		],
		[
			[2, 0],
			[2, 2]
		],
		[
			[0, 0],
			[2, 0]
		],
		[
			[0, 1],
			[2, 1]
		],
		[
			[0, 2],
			[2, 2]
		],
		[
			[0, 0],
			[2, 2]
		],
		[
			[0, 2],
			[2, 0]
		]
	];
	const faint: MatLine[] = ALL_LINES.map(([from, to]) => ({
		from,
		to,
		color: '#ffffff',
		faint: true
	}));

	interface Scene {
		title: string;
		game: string;
		room: RoomData;
		mat: ComponentProps<typeof TableMat>;
	}
	const scenes: Scene[] = [
		{
			title: 'Chatai: your turn to open a card',
			game: 'Chatai 3×3',
			room: room({}, [
				me(['K♥', '5♠', '9♦'], { handName: 'Pair of 9s', wildCards: [0] }),
				...others()
			]),
			mat: {
				layout: 'grid',
				prompt: 'Paid ₹20 · <b>Tap a card to open it</b>',
				cards: [
					shut({ tappable: true }),
					open('7♦'),
					shut({ tappable: true }),
					shut({ tappable: true }),
					shut({ tappable: true }),
					open('K♣'),
					open('2♥'),
					shut({ tappable: true }),
					open('Q♠')
				],
				caption: '4 of 9 open',
				tray: { title: 'Jokers', ranks: '7 · K · 2 · Q', note: 'any card of these ranks' }
			}
		},
		{
			title: 'Chatai: all 9 open, pick your joker line',
			game: 'Chatai 3×3',
			room: room(
				{ pot: 480 },
				[
					me(['K♥', '5♠', '2♦'], { handName: 'Trail of 5s with this line', wildCards: [0, 2] }),
					...others({ raju: { handName: '🔒 Line locked' } })
				],
				1
			),
			mat: {
				layout: 'grid',
				prompt: '<b>Pick your joker line.</b> Once locked, it can’t change.',
				cards: [
					open('4♣', { dim: true, wild: false }),
					open('7♦', { dim: true, wild: false }),
					open('K♠', { picked: true }),
					open('9♥', { dim: true, wild: false }),
					open('7♦', { picked: true }),
					open('K♣', { dim: true, wild: false }),
					open('2♣', { picked: true }),
					open('J♠', { dim: true, wild: false }),
					open('Q♠', { dim: true, wild: false })
				],
				lines: [...faint, { from: [0, 2], to: [2, 0], color: '#f4d68c' }],
				actions: [{ label: '🔒 Lock K♠ 7♦ 2♣ as my jokers', primary: true }]
			}
		},
		{
			title: 'Chatai: the Show, every locked line drawn',
			game: 'Chatai 3×3',
			room: room(
				{ pot: 620 },
				[
					me(['K♥', '5♠', '2♦'], { handName: 'Trail of 5s', wildCards: [0, 2] }),
					...others({
						raju: { cardsInHand: ['9♠', '3♥', 'J♦'].map(c), handName: 'Pair of 9s · middle row' },
						tinku: { isPacked: true, isBlind: false },
						pinky: { isPacked: true }
					})
				],
				1
			),
			mat: {
				layout: 'grid',
				cards: [
					open('4♣', { wild: false }),
					open('7♦', { wild: false }),
					open('K♠'),
					open('9♥'),
					open('7♦'),
					open('K♣'),
					open('2♣'),
					open('J♠', { wild: false }),
					open('Q♠', { wild: false })
				],
				lines: [
					{ from: [0, 2], to: [2, 0], color: '#f4d68c' },
					{ from: [1, 0], to: [1, 2], color: '#3fa7ff' }
				],
				caption: '<b>atishay</b> (gold line) beats <b style="color:#7cc4ff">raju</b> (blue line)'
			}
		},
		{
			title: 'Rotating Joker: tinku packs, his cards become the jokers',
			game: 'Rotating Joker',
			room: room({ pot: 180 }, [
				me(['9♣', '9♠', 'A♦'], { handName: 'Trail of Aces', wildCards: [0, 1] }),
				...others({ tinku: { isPacked: true, cardsInHand: [] } })
			]),
			mat: {
				layout: 'none',
				prompt: 'tinku packed: <b>4♠ 9♥ Q♦</b> are the new jokers',
				tray: {
					title: 'Jokers now',
					cards: [c('4♠'), c('9♥'), c('Q♦')],
					before: [c('3♣'), c('8♦'), c('A♠')]
				}
			}
		},
		{
			title: 'Running: first card opened at ₹200',
			game: 'Running',
			room: room({ pot: 310 }, [
				me(['8♠', 'A♥', 'A♣'], { handName: 'Trail of Aces', wildCards: [0] }),
				...others()
			]),
			mat: {
				layout: 'row',
				cards: [
					open('7♣', { wild: false, tag: '✓ ₹200', tagTone: 'done' }),
					shut({ tag: '₹400' }),
					shut({ tag: '☠ ₹600', tagTone: 'danger' })
				],
				progress: { label: '₹310 of ₹400 · next card soon', value: 110 / 200 },
				tray: { title: 'Jokers', ranks: '6 · 8', note: 'one above and one below the 7' }
			}
		},
		{
			title: 'Running: third card at ₹600, the killer suit',
			game: 'Running',
			room: room({ pot: 640 }, [
				me(['8♠', 'A♥', 'A♣'], { handName: 'Safe · Trail of Aces', wildCards: [0] }),
				...others({
					raju: {
						isPacked: true,
						cardsInHand: ['K♠', '10♦', '3♣'].map(c),
						handName: 'Packed: had 10♦'
					}
				})
			]),
			mat: {
				layout: 'row',
				prompt: '<b>♦ is out.</b> raju packed: had 10♦',
				promptTone: 'danger',
				cards: [
					open('7♣', { wild: false, tag: '✓ ₹200', tagTone: 'done' }),
					open('J♥', { tag: '✓ ₹400', tagTone: 'done' }),
					open('4♦', { wild: false, killer: true, tag: '☠ ♦ is out', tagTone: 'danger' })
				],
				tray: { title: 'Jokers', ranks: '6 · 8 · 10 · J · Q', danger: '☠ any ♦ is out' }
			}
		},
		{
			title: 'Auction: bidding on the piles',
			game: 'Auction',
			room: room({ pot: 120, legalActions: { start: false } }, [
				me(['A♦', '6♣', '3♥'], { isBlind: true, cardsInHand: hidden() }),
				...others({ raju: { handName: 'Bid ₹60 on pile 1' } })
			]),
			mat: {
				layout: 'piles',
				prompt: '<b>Auction:</b> pile 1 · your bid · 9s',
				piles: [
					{ top: c('A♠'), label: 'Pile 1 · high bid ₹60 (raju)', live: true },
					{ top: c('9♥'), label: 'Pile 2 · next' }
				],
				actions: [
					{ label: 'Pass' },
					{ label: '+₹10 → ₹70' },
					{ label: '+₹50 → ₹110', primary: true }
				]
			}
		},
		{
			title: 'Kiss-Miss-Bliss: make your joker from two of your cards',
			game: 'Kiss-Miss-Bliss',
			room: room({ pot: 160, legalActions: { start: false } }, [
				me(['2♠', '3♥', '9♣', 'K♦', 'Q♠'], { handName: '💋 Kiss 2-3: joker ✓' }),
				...others({ raju: { handName: 'Joker made' } })
			]),
			mat: {
				layout: 'none',
				prompt: 'Tap two of your cards to make your joker',
				tray: {
					title: 'Make your joker',
					rules: [
						{ icon: '💋', name: 'Kiss', text: 'Next to each other, like 2-3' },
						{ icon: '🙈', name: 'Miss', text: 'One gap between, like 8-10' },
						{ icon: '✨', name: 'Bliss', text: 'Same rank, like K-K' }
					]
				},
				actions: [{ label: 'Clear' }, { label: 'Make joker', primary: true }]
			}
		},
		{
			title: 'Waiting room with three characters',
			game: 'Classic',
			room: room(
				{ isStarted: false, pot: 0, handId: null as unknown as string, legalActions: { start: true, bet: false, pack: false, show: false, minBet: 0, maxBet: 0 } },
				[
					me([]),
					user('b1', 1, 'Rohit Sharma', { bot: 'normal', botMascotId: 'bot-rohit-sharma', cardsInHand: [], handBet: 0 }),
					user('b2', 2, 'Virat Kohli', { bot: 'normal', botMascotId: 'bot-virat-kohli', cardsInHand: [], handBet: 0 }),
					user('b3', 3, 'MS Dhoni', { bot: 'normal', botMascotId: 'bot-ms-dhoni', cardsInHand: [], handBet: 0 })
				]
			),
			mat: { layout: 'grid', prompt: '', cards: [] }
		}
	];

	let index = $state(
		Math.min(Math.max(Number(page.url.searchParams.get('scene') ?? 1) - 1, 0), scenes.length - 1)
	);
	const scene = $derived(scenes[index]);
	const noop = async () => true;
</script>

<svelte:head><title>Table cards preview</title><meta name="robots" content="noindex" /></svelte:head
>

{#key index}
	<TeenPattiTable
		room={scene.room}
		selfId="me"
		connected
		mediaState={null}
		gameTitle={scene.game}
		send={noop}
		ondeal={noop}
		oninvite={() => {}}
		onleave={() => {}}
		emailInvites={async () => ({ ok: true })}
	>
		{#snippet media()}{/snippet}
		{#snippet settings()}{/snippet}
		{#snippet tableCards()}<TableMat {...scene.mat} />{/snippet}
	</TeenPattiTable>
{/key}

<nav class="scenes" aria-label="Preview scenes">
	<span>{index + 1}. {scene.title}</span>
	{#each scenes as scene, i (scene.title)}
		<button class:on={i === index} onclick={() => (index = i)}>{i + 1}</button>
	{/each}
</nav>

<style>
	.scenes {
		position: fixed;
		top: 3.6rem;
		left: 50%;
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 0.3rem;
		translate: -50% 0;
		border: 1px solid rgb(244 214 140 / 40%);
		border-radius: 999px;
		background: rgb(8 12 10 / 92%);
		padding: 0.3rem 0.4rem 0.3rem 0.9rem;
		color: #f1ebdc;
		font-size: 0.8rem;
		white-space: nowrap;
	}
	.scenes span {
		margin-right: 0.4rem;
		color: #f4d68c;
		font-weight: 700;
	}
	.scenes button {
		width: 1.7rem;
		height: 1.7rem;
		border-radius: 999px;
		color: #f1ebdc;
		font-weight: 700;
	}
	.scenes button.on {
		background: #f4d68c;
		color: #2d1f05;
	}
</style>
