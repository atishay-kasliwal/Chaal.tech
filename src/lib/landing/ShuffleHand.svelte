<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';

	const hand = [
		'back',
		'clubs-2',
		'hearts-3',
		'spades-4',
		'diamonds-5',
		'clubs-6',
		'hearts-7',
		'spades-8',
		'diamonds-9',
		'clubs-10',
		'hearts-j',
		'diamonds-q',
		'clubs-k',
		'spades-a',
		'joker-red'
	];
	const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'j', 'q', 'k', 'a'];
	const deck = ['clubs', 'hearts', 'spades', 'diamonds'].flatMap((suit) =>
		ranks.map((rank) => `${suit}-${rank}`)
	);
	const displayCards = [...hand, ...deck.filter((card) => !hand.includes(card)), 'joker-black'];
	const midpoint = (hand.length - 1) / 2;
	let root: HTMLButtonElement;
	let busy = $state(false);
	let replay = () => {};

	onMount(() => {
		const media = gsap.matchMedia();
		media.add(
			{
				small: '(max-width: 600px)',
				full: '(min-width: 601px)',
				reduced: '(prefers-reduced-motion: reduce)'
			},
			(context) => {
				const { small, reduced } = context.conditions!;
				const allCards = Array.from(root.querySelectorAll<HTMLElement>('.shuffle-card'));
				const heroCards = allCards.slice(0, hand.length);
				const extraCards = allCards.slice(hand.length);
				const cards = allCards.slice(1); // 52 faces and two jokers; no decorative back.
				const position = (i: number) => (i / (cards.length - 1)) * 12 - 6;
				const step = small ? 4.4 : 6.2;
				const fanOffset = (i: number) => (small ? 0 : (i - midpoint) * 10);
				let sequence: gsap.core.Timeline | undefined;
				const rest = () =>
					gsap.set(allCards, {
						opacity: (i: number) => (i < hand.length ? 1 : 0),
						x: 0,
						y: 0,
						xPercent: (i: number) => (i < hand.length ? fanOffset(i) : 0),
						yPercent: -50,
						rotation: (i: number) => (i < hand.length ? (i - midpoint) * step : 0),
						rotationY: 0,
						rotationX: 0,
						scale: 1,
						z: 0,
						transformOrigin: '50% 175%',
						zIndex: (i: number) => i + 1
					});
				rest();
				const shuffle = () => {
					if (reduced || busy) return;
					busy = true;
					sequence = gsap.timeline({
						defaults: { ease: 'power3.inOut' },
						onComplete: () => {
							busy = false;
						}
					});
					// Each flourish gets time to arrive, hold, then move on.
					sequence
						.set(heroCards[0], { opacity: 0 })
						.to(heroCards, {
							rotation: 0,
							xPercent: 0,
							yPercent: -45,
							duration: 0.85,
							stagger: { amount: 0.32, from: 'center' }
						})
						.set(extraCards, { opacity: 1, xPercent: 0, yPercent: -45, rotation: 0 })
						.set(cards, { transformOrigin: '50% 50%' })
						.addLabel('ribbon')
						.to(cards, {
							xPercent: (i: number) => position(i) * (small ? 19 : 38),
							yPercent: (i: number) => -35 + position(i) * 3,
							rotation: -12,
							rotationY: -38,
							rotationX: 8,
							scale: small ? 0.72 : 0.82,
							duration: 1.2,
							stagger: { amount: 0.55 }
						})
						.addLabel('ribbon-hold')
						.to(
							cards,
							{
								xPercent: 0,
								yPercent: -40,
								rotation: 0,
								rotationY: 0,
								rotationX: 0,
								scale: 0.85,
								duration: 0.95,
								stagger: { amount: 0.55, from: 'end' }
							},
							'+=0.55'
						)
						.addLabel('air-cut')
						.to(cards, {
							xPercent: (i: number) => [-70, 10, 75][i % 3],
							yPercent: (i: number) => [-25, -68, -15][i % 3] - Math.floor(i / 3) * 0.35,
							rotation: (i: number) => [-24, 14, 29][i % 3],
							rotationY: (i: number) => [-24, 28, -15][i % 3],
							rotationX: (i: number) => [12, -12, 18][i % 3],
							scale: 0.78,
							duration: 1.05,
							stagger: { amount: 0.32 }
						})
						.to(
							cards,
							{
								xPercent: 0,
								yPercent: -40,
								rotation: 0,
								rotationY: 0,
								rotationX: 0,
								scale: 1,
								duration: 0.9,
								stagger: { amount: 0.38 }
							},
							'+=0.5'
						)
						.set(cards, { transformOrigin: '50% 100%' })
						.addLabel('thumb-fan')
						.to(cards, {
							rotation: (i: number) => position(i) * (small ? 9 : 11),
							rotationY: 180,
							scale: 0.82,
							yPercent: -45,
							duration: 1.3,
							stagger: { amount: 0.5 }
						})
						.to(
							cards,
							{
								rotation: 0,
								rotationY: 0,
								scale: 1,
								yPercent: -50,
								duration: 0.95,
								stagger: { amount: 0.32, from: 'end' }
							},
							'+=0.7'
						)
						.set(extraCards, { opacity: 0 })
						.set(heroCards, { transformOrigin: '50% 175%' })
						.addLabel('hero-fan')
						.to(heroCards, {
							xPercent: fanOffset,
							yPercent: -50,
							rotation: (i: number) => (i - midpoint) * step,
							duration: 1.4,
							ease: 'power3.out',
							stagger: { amount: 0.55 }
						});
					sequence.to(heroCards[0], { opacity: 1, duration: 0.4 }, 'hero-fan+=1');
					sequence.timeScale(1.05 * 1.05);
				};
				replay = shuffle;
				const intro = gsap.delayedCall(0.8, shuffle);
				const visibility = new IntersectionObserver(([entry]) => {
					if (entry.isIntersecting) sequence?.resume();
					else sequence?.pause();
				});
				visibility.observe(root);
				return () => {
					intro.kill();
					sequence?.kill();
					visibility.disconnect();
					busy = false;
					replay = () => {};
				};
			}
		);
		return () => media.revert();
	});
</script>

<button
	bind:this={root}
	class="shuffle-hand"
	class:busy
	type="button"
	onclick={() => replay()}
	aria-label="Shuffle the cards"
	aria-describedby="shuffle-hint"
>
	{#each displayCards as card, i (card)}
		<span
			class="shuffle-card"
			style:--k={i < hand.length ? i - midpoint : 0}
			style:opacity={i < hand.length ? 1 : 0}
		>
			<img
				src="/cards/diwali-taash/{card}.svg"
				alt=""
				width="224"
				height="314"
				loading="eager"
				draggable="false"
			/>
			<img
				class="card-back"
				src="/cards/diwali-taash/back.svg"
				alt=""
				width="224"
				height="314"
				draggable="false"
			/>
		</span>
	{/each}
</button>
<span class="shuffle-hint" id="shuffle-hint"
	><span aria-hidden="true">↻</span> Tap the cards. Change your luck.</span
>

<style>
	.shuffle-hand {
		--step: 6.2deg;
		--splay: 10%;
		position: relative;
		width: 100%;
		height: calc(var(--cw) * 2.1);
		display: grid;
		place-items: end center;
		isolation: isolate;
		z-index: 1;
		cursor: pointer;
		border-radius: 24px;
		perspective: 1100px;
		-webkit-tap-highlight-color: transparent;
	}
	.shuffle-card {
		grid-area: 1/1;
		display: block;
		width: var(--cw);
		aspect-ratio: 224 / 314;
		transform-origin: 50% 175%;
		transform: translate(calc(var(--k) * var(--splay)), -50%) rotate(calc(var(--k) * var(--step)));
		pointer-events: none;
		transform-style: preserve-3d;
	}
	.shuffle-card img {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: calc(var(--cw) * 0.07);
		box-shadow:
			0 9px 12px #211c2e24,
			0 1px 2px #211c2e30;
		user-select: none;
		backface-visibility: hidden;
	}
	.shuffle-card .card-back {
		position: absolute;
		inset: 0;
		transform: rotateY(180deg);
	}
	.shuffle-hand:focus-visible {
		outline: 2px solid var(--night);
		outline-offset: 12px;
	}
	.shuffle-hint {
		position: absolute;
		bottom: -12px;
		left: 50%;
		translate: -50% 0;
		white-space: nowrap;
		font-size: 11px;
		letter-spacing: 0.04em;
		opacity: 0.85;
		pointer-events: none;
	}
	.shuffle-hint span {
		display: inline-block;
		margin-right: 4px;
		font-size: 15px;
	}
	@media (hover: hover) {
		.shuffle-hand:hover + .shuffle-hint {
			opacity: 1;
		}
	}
	@media (max-width: 600px) {
		.shuffle-hand {
			--step: 4.4deg;
			--splay: 0%;
		}
		.shuffle-hint {
			bottom: -8px;
			font-size: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.shuffle-hint {
			display: none;
		}
	}
</style>
