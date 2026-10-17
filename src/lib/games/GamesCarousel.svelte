<script lang="ts">
	import { onMount } from 'svelte';
	import { GAME_GUIDES, gameColor } from './catalog.js';
	import GameDemo from './GameDemo.svelte';
	const perPage = 6;
	const pages = Array.from({ length: Math.ceil(GAME_GUIDES.length / perPage) }, (_, index) =>
		GAME_GUIDES.slice(index * perPage, (index + 1) * perPage)
	);
	// Matching end copies let the last group slide into the first without a backwards sweep.
	const slides = [pages[pages.length - 1], ...pages, pages[0]];
	let position = $state(1);
	const page = $derived((position - 1 + pages.length) % pages.length);
	let paused = $state(false);
	let hovered = $state(false);
	let focused = $state(false);
	let inView = $state(false);
	let reducedMotion = $state(false);
	let moving = $state(false);
	let transitionEnabled = $state(true);
	let section = $state<HTMLElement>();
	let resetFrame = 0;
	let readyFrame = 0;
	function move(offset: number) {
		if (moving) return;
		if (reducedMotion) {
			position = ((page + offset + pages.length) % pages.length) + 1;
			return;
		}
		moving = true;
		position += offset;
	}
	function finishSlide(event: TransitionEvent) {
		if (event.target !== event.currentTarget || event.propertyName !== 'transform') return;
		if (position === 0 || position === slides.length - 1) {
			transitionEnabled = false;
			position = position === 0 ? pages.length : 1;
			resetFrame = requestAnimationFrame(() => {
				readyFrame = requestAnimationFrame(() => {
					transitionEnabled = true;
					moving = false;
				});
			});
		} else moving = false;
	}
	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		function syncMotion() {
			reducedMotion = media.matches;
			if (media.matches) {
				paused = true;
				moving = false;
				position = page + 1;
			}
		}
		syncMotion();
		media.addEventListener('change', syncMotion);
		const observer = new IntersectionObserver(
			([entry]) => {
				inView = entry.isIntersecting;
			},
			{ threshold: 0.2 }
		);
		if (section) observer.observe(section);
		const interval = setInterval(() => {
			if (!paused && !hovered && !focused && inView && !document.hidden) move(1);
		}, 6000);
		return () => {
			clearInterval(interval);
			observer.disconnect();
			media.removeEventListener('change', syncMotion);
			cancelAnimationFrame(resetFrame);
			cancelAnimationFrame(readyFrame);
		};
	});
</script>

<section
	bind:this={section}
	class="games-section"
	aria-label="Explore games"
	aria-roledescription="carousel"
	onmouseenter={() => (hovered = true)}
	onmouseleave={() => (hovered = false)}
	onfocusin={() => (focused = true)}
	onfocusout={(event) => {
		if (!event.currentTarget.contains(event.relatedTarget as Node | null)) focused = false;
	}}
>
	<header>
		<div>
			<h2>Pick your game<span>.</span></h2>
		</div>
		<a class="view-all" href="/games">View All Games <span aria-hidden="true">↗</span></a>
	</header>
	<div class="carousel-window">
		<div
			class="carousel-track"
			class:animate={transitionEnabled && !reducedMotion}
			style:transform="translateX({-position * 100}%)"
			ontransitionend={finishSlide}
		>
			{#each slides as games, slideIndex (slideIndex)}
				<div
					class="game-grid"
					inert={slideIndex !== position}
					aria-hidden={slideIndex !== position}
					data-active={slideIndex === position}
				>
					{#each games as game (game.id)}
						<a
							class="game-tile"
							style:--poster={gameColor(game.id)}
							href="/games#{game.id}"
							aria-label="Learn {game.name}"
						>
							<div class="poster">
								<span class="poster-number" aria-hidden="true"
									>{String(GAME_GUIDES.indexOf(game) + 1).padStart(2, '0')}</span
								><GameDemo {game} compact />
							</div>
							<div class="tile-copy">
								<span class="category">{game.category}</span>
								<h3>{game.name}</h3>
								<span class="learn">See the rules <span aria-hidden="true">→</span></span>
							</div>
						</a>
					{/each}
				</div>
			{/each}
		</div>
	</div>
	<div class="controls">
		<button
			class="autoplay"
			onclick={() => (paused = !paused)}
			aria-label={paused ? 'Play game carousel' : 'Pause game carousel'}
			>{paused ? 'Play' : 'Pause'}</button
		>
		<button onclick={() => move(-1)} aria-label="Previous six games">←</button><span
			aria-live={paused || focused ? 'polite' : 'off'}
			>{page * perPage + 1}–{Math.min((page + 1) * perPage, GAME_GUIDES.length)} of {GAME_GUIDES.length}</span
		><button onclick={() => move(1)} aria-label="Next six games">→</button>
	</div>
</section>

<style>
	.games-section {
		padding: 28px 0;
		color: #f4eee1;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 16px;
		margin-bottom: 24px;
	}
	h2 {
		font:
			850 clamp(28px, 4vw, 44px)/1.05 system-ui,
			sans-serif;
		letter-spacing: -0.055em;
	}
	h2 span {
		color: #e5bb56;
	}
	.view-all {
		color: #e5d7b7;
		font-size: 12px;
		font-weight: 650;
		white-space: nowrap;
	}
	.view-all:hover {
		text-decoration: underline;
		text-underline-offset: 5px;
	}
	.carousel-window {
		overflow: hidden;
		padding-top: 10px;
		margin-top: -10px;
	}
	.carousel-track {
		display: flex;
		align-items: stretch;
	}
	.carousel-track.animate {
		transition: transform 750ms cubic-bezier(0.22, 0.61, 0.36, 1);
	}
	.autoplay {
		font-size: 11px;
		margin-right: auto;
	}
	.game-grid {
		flex: 0 0 100%;
		width: 100%;
		padding-inline: 2px;
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 14px;
	}
	.game-tile {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.poster {
		position: relative;
		overflow: hidden;
		border-radius: 4px;
		background: var(--poster);
		color: #efe6d3;
		box-shadow: inset 0 0 0 1px rgb(255 255 255 / 7%);
		transition: transform 200ms;
	}
	.poster-number {
		position: absolute;
		top: 10px;
		left: 10px;
		z-index: 2;
		font:
			700 10px ui-monospace,
			monospace;
		border-bottom: 1px solid currentColor;
	}
	.poster :global(.demo) {
		min-height: 174px;
		padding-top: 40px;
	}
	.game-tile:hover .poster {
		transform: translateY(-6px) rotate(-2deg);
	}
	.tile-copy {
		padding: 14px 0 0;
	}
	.category {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #a7b2a2;
	}
	h3 {
		font-size: 16px;
		line-height: 1.25;
		font-weight: 750;
		margin-top: 5px;
	}
	.learn {
		display: block;
		color: #a7b2a2;
		font-size: 11px;
		margin-top: 9px;
	}
	.controls {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 16px;
		margin-top: 24px;
		border-top: 1px solid #ffffff20;
		padding-top: 16px;
	}
	.controls span {
		font:
			11px ui-monospace,
			monospace;
		color: #a7b2a2;
	}
	button {
		width: 42px;
		height: 36px;
		cursor: pointer;
		font-size: 22px;
	}
	button:hover {
		color: #e5bb56;
	}
	a:focus-visible,
	button:focus-visible {
		outline: 2px solid #e5bb56;
		outline-offset: 4px;
	}
	@media (max-width: 1000px) {
		.game-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 24px 16px;
		}
	}
	@media (max-width: 550px) {
		.game-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 22px 14px;
		}
		header {
			align-items: center;
		}
		.poster :global(.demo) {
			min-height: 154px;
		}
		.view-all {
			font-size: 10px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.carousel-track.animate {
			transition: none;
		}
		.poster {
			transition: none;
		}
		.game-tile:hover .poster {
			transform: none;
		}
	}
</style>
