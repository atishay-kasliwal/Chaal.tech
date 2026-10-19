<script lang="ts">
	import { onMount } from 'svelte';
	import TpSeat from '#lib/teen-patti/TpSeat.svelte';
	import type { FeedEvent } from '#lib/teen-patti/feed.js';
	import type { PublicPresenceTurn } from '#lib/mascots/presence/table-bridge.js';
	let enabled = $state(true),
		feed = $state<FeedEvent[]>([]),
		turn = $state<PublicPresenceTurn | null>(null),
		width = $state(210);
	let hand = $state('review-1'),
		playing = $state(false),
		serial = 0;
	const bot: User = {
		id: 'dhoni',
		username: 'MS Dhoni',
		balance: 1000,
		handBet: 0,
		seatNumber: 1,
		cardsInHand: [
			{ rank: 0, suit: '' },
			{ rank: 0, suit: '' },
			{ rank: 0, suit: '' }
		],
		bot: 'normal',
		botMascotId: 'bot-ms-dhoni',
		botId: 'ms-dhoni',
		isBlind: true,
		isPacked: false,
		connected: true,
		hasLeft: false
	};
	const geometry = {
		seats: [
			{ id: 'dhoni', x: 50, y: 20 },
			{ id: 'you', x: 20, y: 80 },
			{ id: 'guddu', x: 80, y: 80 }
		],
		pot: { x: 50, y: 60 }
	};
	let timers: ReturnType<typeof setTimeout>[] = [];
	function stop() {
		timers.forEach(clearTimeout);
		timers = [];
		playing = false;
	}
	function emit(kind: 'raise' | 'chaal' | 'pack' | 'win', playerId = 'guddu') {
		feed = [
			...feed,
			{
				id: ++serial,
				kind,
				playerId,
				text:
					kind === 'win'
						? `${playerId === 'dhoni' ? 'Dhoni' : 'Guddu'} wins`
						: `${playerId === 'you' ? 'You' : 'Guddu'} ${kind}`,
				amount: 40
			}
		].slice(-40);
	}
	function playHand() {
		stop();
		playing = true;
		hand = `review-${++serial}`;
		turn = null;
		const beats: [number, () => void][] = [
			[600, () => emit('chaal', 'you')],
			[
				4000,
				() => {
					emit('raise');
					turn = { key: `${hand}:turn-1`, playerId: 'dhoni' };
				}
			],
			[
				8500,
				() => {
					turn = null;
					emit('pack', 'you');
				}
			],
			[12500, () => emit('win', 'dhoni')],
			[
				17800,
				() => {
					hand = `review-${++serial}`;
					turn = null;
				}
			],
			[19000, () => emit('raise', 'you')],
			[
				23000,
				() => {
					turn = null;
					emit('win', 'guddu');
				}
			],
			[
				28000,
				() => {
					hand = `review-${++serial}`;
					playing = false;
				}
			]
		];
		for (const [at, fn] of beats) timers.push(setTimeout(fn, at));
	}
	onMount(() => stop);
</script>

<svelte:head
	><title>Dhoni · Table seat review · Chaal</title><meta
		name="robots"
		content="noindex,nofollow"
	/></svelte:head
>
<main>
	<a href="/prototypes/bot-presence">← Motion study</a>
	<header>
		<p>CHAAL / LOCAL TABLE REVIEW</p>
		<h1>At the table.</h1>
		<p>The real seat component and public-event bridge, at desktop and phone sizes.</p>
	</header>
	<div class="controls">
		<button onclick={playHand}>{playing ? 'Restart hand' : 'Play public hand'}</button>
		<button
			onclick={() => {
				stop();
				emit('raise');
			}}>Raise</button
		><button
			onclick={() => {
				stop();
				emit('win', 'dhoni');
			}}>Dhoni wins</button
		><button
			onclick={() => {
				stop();
				emit('win', 'guddu');
			}}>Dhoni loses</button
		>
		<label><input type="checkbox" bind:checked={enabled} /> Dhoni preview</label>
		<label
			>Seat width <select bind:value={width}
				><option value={150}>150px · small phone</option><option value={180}>180px · phone</option
				><option value={210}>210px · desktop</option><option value={260}>260px · large</option
				></select
			></label
		>
	</div>
	<div class="felt" data-testid="seat-review">
		<div class="seat" style:width="{width}px" style:--seat-w="{width}px">
			<TpSeat
				user={bot}
				boot={10}
				active={turn?.playerId === 'dhoni'}
				host={false}
				inHand
				showdown={false}
				winner={false}
				loser={false}
				handLabel={null}
				remaining={60000}
				total={90000}
				dealKey={hand}
				showMedia={false}
				presencePreview={enabled}
				publicFeed={feed}
				publicTurn={turn}
				publicHandKey={hand}
				publicGeometry={geometry}
			/>
		</div>
		<div class="pot">♠<span>Public table events only</span></div>
	</div>
	<p class="public-status" aria-live="polite">{feed.at(-1)?.text ?? 'Waiting at the table.'}</p>
	<p class="note">
		Add <code>?botPresence=dhoni</code> to a table URL to preview this renderer for Dhoni only. Remove
		it to restore the existing mascot. Production previews require the release flag.
	</p>
</main>

<style>
	main {
		max-width: 68rem;
		margin: auto;
		padding: 2rem 1.25rem 4rem;
		color: #f1ebdc;
	}
	a {
		color: #cbb478;
	}
	header {
		margin: 2rem 0;
	}
	header > p:first-child {
		letter-spacing: 0.2em;
		font-size: 0.7rem;
		color: #b8bcac;
	}
	h1 {
		font-size: clamp(2.5rem, 6vw, 4rem);
		font-weight: 750;
		line-height: 1.2;
		margin: 0.7rem 0;
	}
	header p,
	.note {
		color: #a1aa99;
		line-height: 1.7;
	}
	.controls {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
		align-items: center;
		margin: 1.5rem 0;
	}
	button,
	select {
		background: #d5b365;
		color: #172315;
		padding: 0.6rem 1rem;
		border-radius: 0.45rem;
	}
	label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}
	select {
		background: #1c3023;
		color: #f1ebdc;
	}
	.felt {
		min-height: 26rem;
		border: 1px solid #324134;
		border-radius: 50% / 30%;
		background: radial-gradient(ellipse, #163c2a, #0b2117 72%);
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem 1rem;
		gap: 3rem;
	}
	.pot {
		display: flex;
		flex-direction: column;
		align-items: center;
		font-size: 2rem;
		color: #c8b67c;
		gap: 0.5rem;
	}
	.pot span {
		font-size: 0.7rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.public-status {
		margin: 1.5rem 0;
		color: #e9ce89;
	}
	.note {
		max-width: 48rem;
		font-size: 0.85rem;
	}
	@media (max-width: 500px) {
		.felt {
			min-height: 22rem;
			padding-top: 1.5rem;
			border-radius: 3rem;
		}
		.controls {
			gap: 0.5rem;
		}
		button {
			font-size: 0.8rem;
		}
	}
</style>
