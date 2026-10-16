<script lang="ts">
	import { EyeOff, Eye, Swords, Sparkles, Coins } from '@lucide/svelte';
	import PlayingCard from '#lib/components/PlayingCard.svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { onMount } from 'svelte';
	import { openStart } from '#lib/start/start-modal.svelte.js';

	let mounted = $state(false);
	let activeMechanic = $state(-1);
	let activeHand = $state(0);
	const handsPerPage = 3;
	const rankingPages = [0, 1];
	let rankingsPaused = $state(false);
	let rankingsHovered = $state(false);
	let rankingsFocused = $state(false);

	function changeHand(offset: number) {
		activeHand = (activeHand + offset + rankingPages.length) % rankingPages.length;
	}

	function activateMechanic(index: number, event: KeyboardEvent) {
		if (event.key !== 'Enter' && event.key !== ' ') return;
		event.preventDefault();
		activeMechanic = index;
	}

	onMount(() => {
		mounted = true;
		const interval = setInterval(() => {
			activeMechanic = (activeMechanic + 1) % 4; // 0, 1, 2, and 3 (none)
		}, 3000);

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		rankingsPaused = reducedMotion.matches;
		const rankingsInterval = setInterval(() => {
			if (!rankingsPaused && !rankingsHovered && !rankingsFocused) changeHand(1);
		}, 5000);

		return () => {
			clearInterval(rankingsInterval);
			clearInterval(interval);
		};
	});

	const hands = [
		{
			rank: 1,
			name: 'Trail (Set)',
			desc: 'Three cards of same rank',
			cards: [
				{ r: 'A', s: 'hearts' },
				{ r: 'A', s: 'spades' },
				{ r: 'A', s: 'diamonds' }
			]
		},
		{
			rank: 2,
			name: 'Pure Sequence',
			desc: 'Three consecutive cards of same suit',
			cards: [
				{ r: 'A', s: 'hearts' },
				{ r: 'K', s: 'hearts' },
				{ r: 'Q', s: 'hearts' }
			]
		},
		{
			rank: 3,
			name: 'Sequence (Run)',
			desc: 'Three consecutive cards',
			cards: [
				{ r: 'A', s: 'hearts' },
				{ r: 'K', s: 'spades' },
				{ r: 'Q', s: 'diamonds' }
			]
		},
		{
			rank: 4,
			name: 'Color (Flush)',
			desc: 'Three cards of same suit',
			cards: [
				{ r: 'A', s: 'spades' },
				{ r: 'J', s: 'spades' },
				{ r: '8', s: 'spades' }
			]
		},
		{
			rank: 5,
			name: 'Pair',
			desc: 'Two cards of same rank',
			cards: [
				{ r: 'K', s: 'hearts' },
				{ r: 'K', s: 'clubs' },
				{ r: '7', s: 'diamonds' }
			]
		},
		{
			rank: 6,
			name: 'High Card',
			desc: 'Highest card in hand',
			cards: [
				{ r: 'A', s: 'diamonds' },
				{ r: 'J', s: 'clubs' },
				{ r: '9', s: 'hearts' }
			]
		}
	];
</script>

<article class="bg-base-200/50 min-h-screen p-4 md:p-8">
	<div class="mx-auto max-w-6xl space-y-8">
		<!-- Hero Section -->
		<div class="landing-hero relative overflow-hidden rounded-3xl shadow-2xl">
			<div
				class="relative z-10 flex flex-col items-center p-8 text-center md:flex-row md:p-12 md:text-left"
			>
				<div class="mb-8 md:mb-0 md:w-1/2">
					<div
						class="mb-2 inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-medium text-white backdrop-blur-md"
					>
						<Sparkles class="mr-2 h-4 w-4" /> Teen Patti · now on video
					</div>
					<h1 class="mb-4 text-5xl font-extrabold tracking-tight text-white md:text-7xl">
						Chaal chal, yaar!
					</h1>
					<p class="mb-3 text-lg text-white/90 md:text-xl">
						Play Teen Patti with friends on video. Cards, chips, one table.
					</p>
					<p class="mb-7 text-base text-white/80 md:text-lg">No download or sign-up.</p>
					<div class="flex flex-wrap justify-center gap-3 md:justify-start">
						<button class="hero-cta" onclick={openStart}>Chaal</button>
					</div>
				</div>

				<!-- Hero Visual (Floating Cards) -->
				<div class="flex h-64 w-full items-center justify-center md:w-1/2">
					<div class="relative flex h-full w-full max-w-sm items-center justify-center">
						{#if mounted}
							<div
								class="absolute"
								in:fly={{ x: 200, y: -200, duration: 600, delay: 200, easing: cubicOut }}
							>
								<div class="animate-[bounce_3s_ease-in-out_infinite] [animation-delay:0ms]">
									<PlayingCard
										rank="A"
										suit="spades"
										class="!h-28 !w-20 -translate-x-12 translate-y-4 -rotate-12 shadow-2xl sm:!h-40 sm:!w-28"
									/>
								</div>
							</div>
							<div
								class="absolute z-10"
								in:fly={{ x: 200, y: -200, duration: 600, delay: 400, easing: cubicOut }}
							>
								<div class="animate-[bounce_3.5s_ease-in-out_infinite] [animation-delay:200ms]">
									<PlayingCard
										rank="K"
										suit="hearts"
										class="!h-28 !w-20 shadow-2xl sm:!h-40 sm:!w-28"
									/>
								</div>
							</div>
							<div
								class="absolute"
								in:fly={{ x: 200, y: -200, duration: 600, delay: 600, easing: cubicOut }}
							>
								<div class="animate-[bounce_4s_ease-in-out_infinite] [animation-delay:400ms]">
									<PlayingCard
										rank="Q"
										suit="diamonds"
										class="!h-28 !w-20 translate-x-12 translate-y-4 rotate-12 shadow-2xl sm:!h-40 sm:!w-28"
									/>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<section
			class="card bg-base-100 shadow-xl"
			aria-label="Hand rankings"
			aria-roledescription="carousel"
			onmouseenter={() => (rankingsHovered = true)}
			onmouseleave={() => (rankingsHovered = false)}
			onfocusin={() => (rankingsFocused = true)}
			onfocusout={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node | null))
					rankingsFocused = false;
			}}
		>
			<div class="card-body gap-5">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="text-primary text-2xl font-bold sm:text-3xl">Hand Rankings</h2>
						<p class="text-base-content/70 mt-2 text-sm">
							Best hand: Trail (Three of a kind)<br />Highest sequence: A-K-Q followed by A-2-3
						</p>
					</div>
					<button
						class="btn btn-ghost btn-sm"
						onclick={() => (rankingsPaused = !rankingsPaused)}
						aria-label={rankingsPaused
							? 'Resume hand ranking rotation'
							: 'Pause hand ranking rotation'}>{rankingsPaused ? 'Resume' : 'Pause'}</button
					>
				</div>
				<div
					class="grid"
					aria-live={rankingsPaused || rankingsFocused ? 'polite' : 'off'}
					aria-atomic="true"
				>
					{#key activeHand}
						<div
							class="ranking-slide"
							role="group"
							aria-roledescription="slide"
							aria-label="Rankings {activeHand * handsPerPage + 1} to {(activeHand + 1) *
								handsPerPage} of {hands.length}"
							in:fade={{ duration: 180 }}
							out:fade={{ duration: 180 }}
						>
							{#each hands.slice(activeHand * handsPerPage, (activeHand + 1) * handsPerPage) as hand (hand.rank)}
								<div class="ranking-hand">
									<div>
										<p class="text-primary mb-2 text-sm font-bold">{hand.rank} / {hands.length}</p>
										<h3 class="text-xl font-bold">{hand.name}</h3>
										<p class="text-base-content/70 mt-2 text-sm">{hand.desc}</p>
									</div>
									<div class="flex justify-center gap-2">
										{#each hand.cards as card (`${card.r}-${card.s}`)}
											<PlayingCard rank={card.r} suit={card.s} class="!h-24 !w-16" />
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/key}
				</div>
				<div class="flex items-center justify-center gap-3">
					<button
						class="btn btn-circle btn-ghost btn-sm"
						aria-label="Previous three hands"
						onclick={() => changeHand(-1)}>←</button
					>
					{#each rankingPages as index (index)}
						<button
							class="ranking-dot"
							class:selected={index === activeHand}
							aria-label="Show rankings {index * handsPerPage + 1} to {(index + 1) * handsPerPage}"
							aria-current={index === activeHand ? 'true' : undefined}
							onclick={() => (activeHand = index)}
						></button>
					{/each}
					<button
						class="btn btn-circle btn-ghost btn-sm"
						aria-label="Next three hands"
						onclick={() => changeHand(1)}>→</button
					>
				</div>
			</div>
		</section>

		<!-- How to Play Mechanics -->
		<div class="grid gap-6 md:grid-cols-3">
			<!-- Blind Player -->
			<div
				class="card group bg-base-100 border-base-200 focus:ring-primary/30 cursor-pointer overflow-hidden border shadow-xl transition-all hover:-translate-y-2 hover:shadow-2xl focus:ring-2 focus:outline-none {activeMechanic ===
				0
					? '-translate-y-2 shadow-2xl'
					: ''}"
				tabindex="0"
				role="button"
				onclick={() => (activeMechanic = 0)}
				onkeydown={(event) => activateMechanic(0, event)}
				onfocus={() => (activeMechanic = 0)}
			>
				<div class="card-body items-center text-center">
					<div
						class="bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-content mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110 {activeMechanic ===
						0
							? 'bg-primary !text-primary-content scale-110'
							: ''}"
					>
						<EyeOff class="h-8 w-8" />
					</div>
					<h2 class="card-title text-2xl font-bold">Andhe mein chaal</h2>
					<p class="text-base-content/70">
						Play blind — bet without looking. Half the price, double the drama, and everyone wonders
						what you’ve got.
					</p>
					<div class="relative mt-4 flex justify-center -space-x-4">
						<!-- Badge -->
						<div
							class="badge badge-primary absolute -top-6 z-20 font-bold opacity-0 shadow-md transition-all duration-300 group-hover:-top-8 group-hover:opacity-100 {activeMechanic ===
							0
								? '-top-8 !opacity-100'
								: ''}"
						>
							Stake: 1x
						</div>

						<!-- Card 1 -->
						<div
							class="translate-y-2 -rotate-12 transition-all duration-300 group-hover:translate-x-6 group-hover:rotate-0 {activeMechanic ===
							0
								? 'translate-x-6 rotate-0'
								: ''}"
						>
							<PlayingCard faceDown={true} class="!h-16 !w-12 shadow-md" />
						</div>

						<!-- Card 2 (Middle card) -->
						<div
							class="relative z-10 transition-transform duration-300 group-hover:-translate-y-1 group-hover:scale-105 {activeMechanic ===
							0
								? '-translate-y-1 scale-105'
								: ''}"
						>
							<PlayingCard faceDown={true} class="!h-16 !w-12 shadow-md" />

							<!-- Centered Lock Icon overlay -->
							<div
								class="pointer-events-none absolute inset-0 z-20 flex scale-50 items-center justify-center opacity-0 transition-all duration-500 group-hover:scale-100 group-hover:opacity-100 {activeMechanic ===
								0
									? '!scale-100 !opacity-100'
									: ''}"
							>
								<div
									class="bg-primary text-primary-content shadow-primary/40 ring-primary-content/20 rounded-full p-2 shadow-xl ring-2"
								>
									<EyeOff class="h-6 w-6" />
								</div>
							</div>
						</div>

						<!-- Card 3 -->
						<div
							class="translate-y-2 rotate-12 transition-all duration-300 group-hover:-translate-x-6 group-hover:rotate-0 {activeMechanic ===
							0
								? '-translate-x-6 rotate-0'
								: ''}"
						>
							<PlayingCard faceDown={true} class="!h-16 !w-12 shadow-md" />
						</div>
					</div>
				</div>
			</div>

			<!-- Seen Player -->
			<div
				class="card group bg-base-100 border-base-200 focus:ring-secondary/30 cursor-pointer overflow-hidden border shadow-xl transition-all hover:-translate-y-2 hover:shadow-2xl focus:ring-2 focus:outline-none {activeMechanic ===
				1
					? '-translate-y-2 shadow-2xl'
					: ''}"
				tabindex="0"
				role="button"
				onclick={() => (activeMechanic = 1)}
				onkeydown={(event) => activateMechanic(1, event)}
				onfocus={() => (activeMechanic = 1)}
			>
				<div class="card-body items-center text-center">
					<div
						class="bg-secondary/10 text-secondary group-hover:bg-secondary group-hover:text-secondary-content mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110 {activeMechanic ===
						1
							? 'bg-secondary !text-secondary-content scale-110'
							: ''}"
					>
						<Eye class="h-8 w-8" />
					</div>
					<h2 class="card-title text-2xl font-bold">Dekh ke khelo</h2>
					<p class="text-base-content/70">
						Peek at your cards, then chaal, raise or pack. Poker face optional — the camera is on.
					</p>
					<div class="relative mt-4 flex justify-center -space-x-4 [perspective:1000px]">
						<!-- Badge -->
						<div
							class="badge badge-secondary absolute -top-6 z-20 font-bold opacity-0 shadow-md transition-all duration-300 group-hover:-top-8 group-hover:opacity-100 {activeMechanic ===
							1
								? '-top-8 !opacity-100'
								: ''}"
						>
							Stake: 2x
						</div>

						<!-- Card 1 -->
						<div
							class="z-0 translate-y-2 -rotate-12 transition-transform duration-500 group-hover:-translate-x-2 group-hover:-rotate-6 {activeMechanic ===
							1
								? '-translate-x-2 -rotate-6'
								: ''}"
						>
							<div
								class="relative !h-16 !w-12 rounded-lg shadow-md transition-transform duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)] {activeMechanic ===
								1
									? '[transform:rotateY(180deg)]'
									: ''}"
							>
								<div class="absolute inset-0 [backface-visibility:hidden]">
									<PlayingCard faceDown={true} class="!h-16 !w-12" />
								</div>
								<div
									class="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]"
								>
									<PlayingCard rank="10" suit="clubs" class="!h-16 !w-12" />
								</div>
							</div>
						</div>

						<!-- Card 2 -->
						<div
							class="z-10 transition-transform duration-500 group-hover:-translate-y-2 {activeMechanic ===
							1
								? '-translate-y-2'
								: ''}"
						>
							<div
								class="relative !h-16 !w-12 rounded-lg shadow-md transition-transform delay-100 duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)] {activeMechanic ===
								1
									? '[transform:rotateY(180deg)]'
									: ''}"
							>
								<div class="absolute inset-0 [backface-visibility:hidden]">
									<PlayingCard faceDown={true} class="!h-16 !w-12" />
								</div>
								<div
									class="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]"
								>
									<PlayingCard rank="J" suit="diamonds" class="!h-16 !w-12" />
								</div>
							</div>
						</div>

						<!-- Card 3 -->
						<div
							class="z-20 translate-y-2 rotate-12 transition-transform duration-500 group-hover:translate-x-2 group-hover:rotate-6 {activeMechanic ===
							1
								? 'translate-x-2 rotate-6'
								: ''}"
						>
							<div
								class="relative !h-16 !w-12 rounded-lg shadow-md transition-transform delay-200 duration-700 [transform-style:preserve-3d] group-hover:[transform:rotateY(180deg)] {activeMechanic ===
								1
									? '[transform:rotateY(180deg)]'
									: ''}"
							>
								<div class="absolute inset-0 [backface-visibility:hidden]">
									<PlayingCard faceDown={true} class="!h-16 !w-12" />
								</div>
								<div
									class="absolute inset-0 [transform:rotateY(180deg)] [backface-visibility:hidden]"
								>
									<PlayingCard rank="Q" suit="hearts" class="!h-16 !w-12" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Showdown -->
			<div
				class="card group bg-base-100 border-base-200 focus:ring-accent/30 cursor-pointer overflow-hidden border shadow-xl transition-all hover:-translate-y-2 hover:shadow-2xl focus:ring-2 focus:outline-none {activeMechanic ===
				2
					? '-translate-y-2 shadow-2xl'
					: ''}"
				tabindex="0"
				role="button"
				onclick={() => (activeMechanic = 2)}
				onkeydown={(event) => activateMechanic(2, event)}
				onfocus={() => (activeMechanic = 2)}
			>
				<div class="card-body items-center text-center">
					<div
						class="bg-accent/10 text-accent group-hover:bg-accent group-hover:text-accent-content mb-4 flex h-16 w-16 items-center justify-center rounded-full transition-transform group-hover:scale-110 {activeMechanic ===
						2
							? 'bg-accent !text-accent-content scale-110'
							: ''}"
					>
						<Swords class="h-8 w-8" />
					</div>
					<h2 class="card-title text-2xl font-bold">Show karo!</h2>
					<p class="text-base-content/70">
						Two players left? Call the show. Cards flip, best hand takes the pot, loser blames the
						dealer.
					</p>
					<div class="relative mt-4 flex h-24 w-full items-center justify-center space-x-2">
						<!-- Losing hand -->
						<div
							class="relative -rotate-6 transition-all duration-500 group-hover:translate-y-4 group-hover:-rotate-[25deg] group-hover:opacity-50 group-hover:grayscale {activeMechanic ===
							2
								? 'translate-y-4 -rotate-[25deg] opacity-50 grayscale'
								: ''}"
						>
							<div
								class="bg-error text-error-content absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded px-1.5 text-[10px] font-bold opacity-0 transition-opacity delay-300 duration-300 group-hover:opacity-100 {activeMechanic ===
								2
									? '!opacity-100'
									: ''}"
							>
								LOSE
							</div>
							<PlayingCard rank="K" suit="spades" class="!h-20 !w-14 shadow-md" />
						</div>

						<!-- VS Text (Fades out) -->
						<div
							class="text-accent relative flex w-8 items-center justify-center px-1 text-2xl font-bold italic transition-opacity duration-300 group-hover:opacity-0 {activeMechanic ===
							2
								? '!opacity-0'
								: ''}"
						>
							<span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">VS</span>
							<!-- Flying Chips (Animate from left to right across VS) -->
							<div
								class="pointer-events-none absolute top-1/2 left-[-20px] z-20 -translate-y-1/2 scale-50 opacity-0 transition-all duration-700 ease-in-out group-hover:left-[20px] group-hover:scale-100 group-hover:-rotate-45 group-hover:opacity-100 {activeMechanic ===
								2
									? 'left-[20px] scale-100 -rotate-45 !opacity-100'
									: ''}"
							>
								<Coins
									class="text-warning fill-warning absolute -top-4 -left-2 h-6 w-6 drop-shadow-md"
								/>
								<Coins
									class="text-warning fill-warning absolute top-0 left-2 h-5 w-5 drop-shadow-md delay-100"
								/>
							</div>
						</div>

						<!-- Winning hand -->
						<div
							class="relative rotate-6 transition-all duration-500 group-hover:-translate-y-2 group-hover:scale-110 group-hover:rotate-0 {activeMechanic ===
							2
								? '-translate-y-2 scale-110 rotate-0'
								: ''}"
						>
							<div
								class="bg-success text-success-content absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded px-1.5 text-[10px] font-bold opacity-0 shadow-sm transition-opacity delay-300 duration-300 group-hover:opacity-100 {activeMechanic ===
								2
									? '!opacity-100'
									: ''}"
							>
								WIN!
							</div>
							<div
								class="rounded-lg transition-shadow duration-500 group-hover:drop-shadow-[0_0_15px_rgba(251,191,36,0.8)] {activeMechanic ===
								2
									? 'drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]'
									: ''}"
							>
								<PlayingCard rank="A" suit="hearts" class="!h-20 !w-14 shadow-md" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<footer class="landing-footer">
			<p>Cards out. One more hand. ♠</p>
			<button class="hero-cta gold small" onclick={openStart}>Deal me in</button>
		</footer>
	</div>
</article>

<style>
	.landing-hero {
		background-color: #07110b;
		background-image:
			linear-gradient(90deg, rgb(4 12 8 / 91%) 0%, rgb(4 12 8 / 82%) 45%, rgb(4 12 8 / 58%) 100%),
			url('/email/invite-table.jpg');
		background-position: center;
		background-size: cover;
	}
	@media (max-width: 767px) {
		.landing-hero {
			background-image:
				linear-gradient(
					180deg,
					rgb(4 12 8 / 72%) 0%,
					rgb(4 12 8 / 72%) 55%,
					rgb(4 12 8 / 86%) 100%
				),
				url('/email/invite-table-phone.jpg');
			background-position: center;
		}
	}
	.hero-cta {
		border: 1px solid rgb(255 255 255 / 45%);
		border-radius: 999px;
		background: rgb(255 255 255 / 12%);
		padding: 0.85rem 1.5rem;
		color: #fff;
		font-size: 1.05rem;
		font-weight: 800;
		backdrop-filter: blur(6px);
		cursor: pointer;
		transition:
			transform 120ms ease,
			background 160ms ease;
	}
	.hero-cta:hover {
		transform: translateY(-1px);
		background: rgb(255 255 255 / 20%);
	}
	.hero-cta.gold {
		border-color: transparent;
		background: #fff7e2;
		color: #3a2608;
		box-shadow: 0 0.6rem 1.6rem rgb(0 0 0 / 25%);
	}
	.hero-cta.small {
		padding: 0.6rem 1.2rem;
		font-size: 0.95rem;
	}
	.ranking-slide {
		grid-area: 1 / 1;
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
		min-width: 0;
	}
	.ranking-hand {
		display: grid;
		grid-template-rows: 1fr auto;
		gap: 1.5rem;
		min-width: 0;
		border: 1px solid var(--color-base-300);
		border-radius: 1rem;
		padding: 1.5rem 0.75rem;
		text-align: center;
	}
	.ranking-dot {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 999px;
		background: var(--color-base-content);
		opacity: 0.3;
		cursor: pointer;
	}
	.ranking-dot.selected {
		background: var(--color-primary);
		opacity: 1;
	}
	.ranking-dot:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 4px;
	}
	@media (min-width: 900px) {
		.ranking-slide {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	.landing-footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.8rem;
		padding: 1.5rem 0 2.5rem;
		color: rgb(241 235 220 / 60%);
		text-align: center;
	}
</style>
