<script lang="ts">
	import DeckCard from '#lib/components/DeckCard.svelte';

	type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
	type Card = [string, Suit];
	const rounds: {
		game: string;
		rule: string;
		hands: [Card[], Card[]];
		winner: number;
		why: string;
	}[] = [
		{
			game: 'Classic',
			rule: 'Which hand wins?',
			hands: [
				[
					['8', 'spades'],
					['8', 'hearts'],
					['8', 'clubs']
				],
				[
					['A', 'hearts'],
					['K', 'hearts'],
					['Q', 'hearts']
				]
			],
			winner: 0,
			why: 'Three of a kind beats a pure sequence. Those three 8s take it.'
		},
		{
			game: 'Muflis',
			rule: 'The lowest hand wins. Your pick?',
			hands: [
				[
					['2', 'spades'],
					['2', 'hearts'],
					['4', 'clubs']
				],
				[
					['3', 'clubs'],
					['5', 'hearts'],
					['8', 'diamonds']
				]
			],
			winner: 1,
			why: 'In Muflis, a high-card hand beats a pair. Hand B wins, even with its 8.'
		},
		{
			game: 'Classic',
			rule: 'Two pure sequences. Who takes it?',
			hands: [
				[
					['A', 'clubs'],
					['2', 'clubs'],
					['3', 'clubs']
				],
				[
					['A', 'spades'],
					['K', 'spades'],
					['Q', 'spades']
				]
			],
			winner: 1,
			why: 'A-K-Q is the highest pure sequence, followed by A-2-3.'
		},
		{
			game: 'AK47',
			rule: 'A, K, 4 and 7 are wild. Which hand wins?',
			hands: [
				[
					['4', 'hearts'],
					['7', 'clubs'],
					['9', 'spades']
				],
				[
					['Q', 'hearts'],
					['J', 'hearts'],
					['10', 'hearts']
				]
			],
			winner: 0,
			why: 'The 4 and 7 can both become 9s. A trail of 9s beats a pure sequence.'
		},
		{
			game: 'Classic',
			rule: 'One last call. Which hand wins?',
			hands: [
				[
					['A', 'hearts'],
					['8', 'hearts'],
					['3', 'hearts']
				],
				[
					['K', 'spades'],
					['K', 'diamonds'],
					['Q', 'clubs']
				]
			],
			winner: 0,
			why: 'A colour (flush) beats a pair. All three hearts win this one.'
		}
	];
	let index = $state(0);
	let choice = $state<number | null>(null);
	let score = $state(0);
	let finished = $state(false);
	const round = $derived(rounds[index]);
	function pick(hand: number) {
		if (choice !== null) return;
		choice = hand;
		if (hand === round.winner) score++;
	}
	function next() {
		if (index === rounds.length - 1) finished = true;
		else {
			index++;
			choice = null;
		}
	}
	function restart() {
		index = 0;
		choice = null;
		score = 0;
		finished = false;
	}
</script>

<section class="warmup" aria-labelledby="warmup-title">
	<div class="heading">
		<p class="eyebrow">The warm-up corner</p>
		<span>{finished ? 'Round complete' : `${index + 1} / ${rounds.length}`}</span>
	</div>
	{#if finished}
		<div class="finish" aria-live="polite">
			<span class="finish-mark" aria-hidden="true">♠</span>
			<h2 id="warmup-title">
				{score === rounds.length ? 'You know your cards.' : 'Ready for the real table?'}
			</h2>
			<p>{score} of {rounds.length} right. Just for practice, just for you.</p>
			<button class="next" onclick={restart}>Another go <span aria-hidden="true">↺</span></button>
		</div>
	{:else}
		<div class="intro">
			<div>
				<h2 id="warmup-title">Make the call.</h2>
				<p>{round.rule}</p>
			</div>
			<span class="game">{round.game}</span>
		</div>
		<div class="matchup">
			{#each round.hands as hand, handIndex (`${index}-${handIndex}`)}
				<button
					class="hand"
					class:chosen={choice === handIndex}
					class:winner={choice !== null && round.winner === handIndex}
					disabled={choice !== null}
					onclick={() => pick(handIndex)}
					aria-label="Pick hand {handIndex === 0 ? 'A' : 'B'}: {hand
						.map(([rank, suit]) => `${rank} of ${suit}`)
						.join(', ')}"
				>
					<span class="fan" aria-hidden="true"
						>{#each hand as [rank, suit], cardIndex (cardIndex)}<span
								class="card"
								style:--tilt="{(cardIndex - 1) * 8}deg"><DeckCard {rank} {suit} /></span
							>{/each}</span
					>
					<span class="hand-label"
						>Hand {handIndex === 0 ? 'A' : 'B'}<span aria-hidden="true"
							>{choice !== null && round.winner === handIndex ? '✓' : '↗'}</span
						></span
					>
				</button>
			{/each}
		</div>
		<div class="answer" aria-live="polite">
			{#if choice !== null}<p>
					<strong>{choice === round.winner ? 'Good call.' : 'A little twist.'}</strong>
					{round.why}
				</p>
				<button class="next" onclick={next}
					>{index === rounds.length - 1 ? 'See how you did' : 'Next hand'}
					<span aria-hidden="true">→</span></button
				>
			{:else}<p class="hint">Tap a hand. No chips, no pressure.</p>{/if}
		</div>
	{/if}
</section>

<style>
	.warmup {
		padding: clamp(1.25rem, 2.5vw, 2rem);
		border: 1px solid #d7c29124;
		border-radius: 1rem;
		background: #18261f;
		color: #f1ebdc;
	}
	.heading,
	.intro,
	.hand-label {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.8rem;
	}
	.heading {
		margin-bottom: 1.3rem;
	}
	.heading > span,
	.hint {
		font-size: 0.72rem;
		color: #aebaae;
	}
	.eyebrow {
		color: #d8b87b;
		font-size: 0.65rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
	}
	h2 {
		font-family: Georgia, serif;
		font-size: clamp(1.65rem, 2.5vw, 2.2rem);
		line-height: 1.15;
	}
	.intro p {
		margin-top: 0.5rem;
		color: #bdc6bb;
		font-size: 0.85rem;
	}
	.game {
		border: 1px solid #d7c29140;
		border-radius: 999px;
		padding: 0.3rem 0.6rem;
		color: #e5c58b;
		font-size: 0.7rem;
		white-space: nowrap;
	}
	.matchup {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		margin-top: 1.4rem;
	}
	.hand {
		min-width: 0;
		border: 1px solid #ffffff1c;
		border-radius: 0.6rem;
		padding: 1.2rem 1rem 0.8rem;
		background: #0b171155;
		cursor: pointer;
		transition:
			background 180ms,
			border-color 180ms;
	}
	.hand:hover:not(:disabled),
	.hand.chosen {
		border-color: #cbb47d;
		background: #d7c2910c;
	}
	.hand.winner {
		border-color: #93bd93;
		background: #81b58312;
	}
	.hand:disabled {
		cursor: default;
	}
	.hand:focus-visible,
	.next:focus-visible {
		outline: 2px solid #e5c58b;
		outline-offset: 4px;
	}
	.fan {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.7rem 0 1.2rem;
	}
	.card {
		width: clamp(45px, 6vw, 67px);
		flex: none;
		rotate: var(--tilt);
		filter: drop-shadow(0 6px 5px #0005);
	}
	.card + .card {
		margin-left: -12px;
	}
	.card :global(.deck-card) {
		width: 100%;
		height: auto;
	}
	.hand-label {
		padding-top: 0.65rem;
		border-top: 1px solid #ffffff18;
		font-size: 0.75rem;
		color: #e1d8c6;
	}
	.answer {
		min-height: 5.7rem;
		margin-top: 1.1rem;
		font-size: 0.8rem;
		color: #bdc6bb;
		line-height: 1.6;
	}
	.answer strong {
		color: #e5c58b;
	}
	.next {
		display: inline-flex;
		align-items: center;
		gap: 1.5rem;
		padding: 0.45rem 0;
		margin-top: 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: #e5c58b;
		cursor: pointer;
	}
	.finish {
		min-height: 330px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		gap: 0.8rem;
	}
	.finish p {
		color: #bdc6bb;
		font-size: 0.85rem;
	}
	.finish-mark {
		color: #e5c58b;
		font-size: 3rem;
	}
	@media (max-width: 480px) {
		.matchup {
			gap: 0.6rem;
		}
		.hand {
			padding: 0.7rem 0.65rem;
		}
		.card {
			width: clamp(36px, 11vw, 52px);
		}
		.intro {
			align-items: flex-start;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.hand {
			transition: none;
		}
	}
	:global([data-reduced-motion]) .hand {
		transition: none;
	}
</style>
