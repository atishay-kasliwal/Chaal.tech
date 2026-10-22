<script lang="ts">
	import { openStart } from '#lib/start/start-modal.svelte.js';
	import GameDemo from '#lib/games/GameDemo.svelte';
	import { GAME_GUIDES } from '#lib/games/catalog.js';
	import ShuffleHand from '#lib/landing/ShuffleHand.svelte';
	const games = [
		{
			name: 'Teen Patti',
			note: 'Three cards. Endless possibilities.',
			suit: '♠',
			id: 'classic-1',
			className: 'patti'
		},
		{
			name: 'Poker',
			note: 'Keep a straight face.',
			suit: '♦',
			id: 'texas-holdem',
			className: 'poker'
		},
		{
			name: 'Blackjack',
			note: 'Feeling twenty-one?',
			suit: '♣',
			id: 'blackjack',
			className: 'blackjack'
		},
		{
			name: 'Rummy',
			note: 'A little order in the chaos.',
			suit: '♥',
			id: 'rummy',
			className: 'rummy'
		}
	];
	const rankings = [
		['Trail', 'Three of a kind', 'A♠ A♥ A♣'],
		['Pure sequence', 'Consecutive cards, one suit', 'A♥ K♥ Q♥'],
		['Sequence', 'Consecutive cards, mixed suits', 'A♠ K♥ Q♣'],
		['Color', 'Three cards of one suit', 'A♠ J♠ 8♠'],
		['Pair', 'Two cards of the same rank', 'K♥ K♣ 7♦'],
		['High card', 'Your highest card decides', 'A♦ J♣ 9♥']
	];
</script>

<svelte:head>
	<title>Chaal · Good cards. Better company.</title>
	<meta
		name="description"
		content="Your friends, your favourite card games, one video table. Play Teen Patti, Poker, Blackjack and Rummy in the Chaal private clubhouse."
	/>
</svelte:head>

<div class="home">
	<section class="invitation" aria-labelledby="home-title">
		<div class="hero">
			<div class="hero-art">
				<div class="circle-label" aria-hidden="true">
					<span>GOOD TIMES</span><strong>✳</strong><span>ON THE CARDS</span>
				</div>
				<ShuffleHand />
			</div>
			<h1 id="home-title">Good cards.<br /><span>Better company.</span></h1>
			<button class="club-cta" onclick={openStart}
				>Pull up a chair <span aria-hidden="true">→</span></button
			>
		</div>
		<div class="invitation-bottom">
			<span>Teen Patti & friends</span><span>Video on. Cards out.</span><a href="#games"
				>Find your game <span aria-hidden="true">↓</span></a
			>
		</div>
	</section>

	<section class="game-shelf" id="games" aria-labelledby="games-heading">
		<div class="section-heading">
			<h2 id="games-heading">Same friends.<br />Different games.</h2>
			<a class="text-link" href="/games">The whole deck <span aria-hidden="true">↗</span></a>
		</div>
		<div class="game-tiles">
			{#each games as game (game.id)}
				<a class="game-tile {game.className}" href="/games#{game.id}"
					><div class="tile-top">
						<span>{game.name}</span><span class="tile-arrow" aria-hidden="true">↗</span>
					</div>
					<div class="tile-hand">
						<GameDemo game={GAME_GUIDES.find((guide) => guide.id === game.id)!} compact />
					</div>
					<span class="tile-footer"
						><span class="tile-family"
							>{game.id === 'classic-1'
								? 'The original adda game'
								: game.id === 'texas-holdem'
									? 'Texas Hold’em'
									: game.id === 'blackjack'
										? 'Beat the dealer'
										: '13-card Indian Rummy'}</span
						><span class="tile-suit-mark" aria-hidden="true">{game.suit}</span></span
					>
					<p>{game.note}</p></a
				>
			{/each}
		</div>
		<p class="shelf-note">
			{GAME_GUIDES.length} games and variants. Your usual favourites, plus a few new arguments.
		</p>
	</section>

	<section class="night-plan" aria-labelledby="night-heading">
		<div>
			<span class="small-label">No complicated plans required.</span>
			<h2 id="night-heading">Less “when<br />are we free?”<br />More <span>“deal me in.”</span></h2>
			<p>Bring the banter back to the table.<br />We’ll take care of the cards.</p>
		</div>
		<ol class="night-steps">
			<li>
				<span class="step-symbol" aria-hidden="true">↗</span>
				<div>
					<h3>Make it a game night.</h3>
					<p>Sign in to your private club and start a table. Pick the game and set the chips.</p>
				</div>
			</li>
			<li>
				<span class="step-symbol" aria-hidden="true">♧</span>
				<div>
					<h3>Round up your people.</h3>
					<p>
						Invite your club friends or share a table link. Everyone joins right in their browser.
					</p>
				</div>
			</li>
			<li>
				<span class="step-symbol" aria-hidden="true">♠</span>
				<div>
					<h3>Read the room. Or try to.</h3>
					<p>Turn on video, play your hand, and see who really has a poker face.</p>
				</div>
			</li>
		</ol>
	</section>

	<section class="learn" aria-labelledby="learn-heading">
		<div class="learn-heading">
			<h2 id="learn-heading">A little luck.<br />A little know-how.</h2>
			<p>
				New to Teen Patti? Here’s what beats what,<br />from the strongest hand to the last resort.
			</p>
		</div>
		<div class="rankings">
			{#each rankings as [name, note, cards], i (name)}<div class="ranking-row">
					<span class="rank-position">{i + 1}</span>
					<div>
						<h3>{name}</h3>
						<p>{note}</p>
					</div>
					<span class="rank-cards">{cards}</span>
				</div>{/each}
		</div>
		<div class="learning-notes">
			<details>
				<summary>Blind or seen? <span aria-hidden="true">+</span></summary>
				<p>
					Play blind without looking at your cards. Once you look, you play seen and pay twice the
					equivalent blind stake. A-K-Q is the highest sequence, followed by A-2-3.
				</p>
			</details>
			<details>
				<summary>Chaal, pack, or show? <span aria-hidden="true">+</span></summary>
				<p>
					Chaal to match the stake and stay in. Raise to turn up the pressure, or pack to fold. With
					two players left, a Show compares the hands. The game variant decides the winner.
				</p>
			</details>
			<a class="text-link" href="/games">Learn every game <span aria-hidden="true">↗</span></a>
		</div>
	</section>

	<section class="last-hand">
		<div>
			<p>There’s always room for one more.</p>
			<h2>Chaal chal,<br />yaar.</h2>
		</div>
		<button class="club-cta" onclick={openStart}
			>Let’s play <span aria-hidden="true">↗</span></button
		><span class="last-suit" aria-hidden="true">♣</span>
	</section>
</div>

<style>
	.home {
		overflow: clip;
	}
	.invitation {
		background: var(--butter);
		color: var(--night);
		padding: 24px var(--gutter) 0;
	}
	.invitation-bottom {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
	}
	/* One centred column: the dealt hand, the line, the way in. */
	.hero {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		max-width: var(--page-max);
		margin: auto;
		/* Fills the screen under the header, leaving room for the strip below. */
		min-height: max(540px, calc(100dvh - var(--header-h, 64px) - 82px));
		padding: clamp(24px, 3dvh, 40px) 0;
		justify-content: center;
		--cw: clamp(96px, min(15vw, 22dvh), 264px);
	}
	h1 {
		font-family: var(--font-display);
		font-size: clamp(42px, min(7.2vw, 9.4dvh), 112px);
		font-weight: 800;
		line-height: 0.9;
		letter-spacing: -0.065em;
		margin: clamp(18px, 2.4dvh, 28px) 0 clamp(16px, 2.4dvh, 28px);
	}
	h1 span {
		color: var(--night);
	}
	.club-cta {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 28px;
		min-height: 56px;
		padding: 16px 24px;
		border-radius: 100px;
		background: var(--night);
		color: var(--paper);
		font-size: 15px;
		font-weight: 650;
		cursor: pointer;
		transition:
			translate 0.25s,
			box-shadow 0.25s;
	}
	.club-cta > span {
		font-size: 24px;
		line-height: 1;
		transition: translate 0.25s;
	}
	.club-cta:hover,
	.club-cta:focus-visible {
		translate: 0 -3px;
		box-shadow: 0 5px 0 rgb(33 28 46 / 20%);
	}
	.club-cta:hover > span {
		translate: 3px -3px;
	}
	.club-cta:active {
		translate: 0 1px;
		box-shadow: none;
	}
	.hero-art {
		flex-shrink: 0;
		position: relative;
		display: flex;
		justify-content: center;
		width: min(100%, calc(var(--cw) * 6.4));
	}
	/* Thirteen cards around one pivot below the hand, like cards held in a hand. */
	.circle-label {
		pointer-events: none;
		position: absolute;
		right: 10px;
		top: -12px;
		width: 116px;
		height: 116px;
		border: 1px solid var(--night);
		border-radius: 50%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		rotate: 13deg;
		z-index: 4;
		background: var(--butter);
		font-size: 9px;
		letter-spacing: 0.14em;
	}
	.circle-label strong {
		font-size: 42px;
		line-height: 1.3;
		font-weight: 400;
	}
	.invitation-bottom {
		border-top: 1px solid #211c2e35;
		padding: 20px 0;
	}
	.invitation-bottom a {
		display: flex;
		gap: 26px;
		align-items: center;
	}
	.invitation-bottom a > span {
		font-size: 20px;
	}
	.game-shelf,
	.night-plan,
	.learn {
		max-width: var(--page-max);
		margin: auto;
		padding: 90px var(--gutter);
	}
	.section-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 36px;
	}
	h2 {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(36px, 4.5vw, 64px);
		line-height: 0.98;
		letter-spacing: -0.055em;
	}
	.text-link {
		display: inline-flex;
		align-items: center;
		gap: 28px;
		font-size: 14px;
		padding: 12px 0;
		border-bottom: 1px solid currentColor;
	}
	.text-link span {
		transition: translate 0.25s;
	}
	.text-link:hover span {
		translate: 4px -4px;
	}
	.game-tiles {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 12px;
	}
	.game-tile {
		min-height: 285px;
		display: flex;
		flex-direction: column;
		border-radius: 14px;
		padding: 22px;
		color: var(--night);
		transition:
			translate 0.3s,
			rotate 0.3s;
	}
	.game-tile:hover,
	.game-tile:focus-visible {
		translate: 0 -8px;
		rotate: -1deg;
	}
	.game-tile:active {
		translate: 0 -2px;
	}
	.patti {
		background: var(--butter);
	}
	.poker {
		background: #c5bddb;
	}
	.blackjack {
		background: #a9c7b7;
	}
	.rummy {
		background: #ee8e78;
	}
	.tile-top {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.03em;
	}
	.tile-arrow {
		font-family: system-ui;
		font-size: 22px;
	}
	.tile-suit {
		font-family: Georgia, serif;
		font-size: 128px;
		line-height: 1.35;
		align-self: center;
	}
	.game-tile p {
		font-size: 12px;
		margin-top: auto;
	}
	.shelf-note {
		margin-top: 20px;
		font-size: 12px;
		color: var(--muted);
	}
	.night-plan {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 80px;
		border-block: 1px solid var(--line);
		padding-block: 100px;
	}
	.small-label {
		font-size: 12px;
		color: var(--muted);
		display: block;
		margin-bottom: 30px;
	}
	.night-plan h2 {
		font-size: clamp(40px, 5.3vw, 75px);
	}
	.night-plan h2 span {
		color: var(--butter);
	}
	.night-plan > div > p {
		margin-top: 28px;
		color: var(--muted);
		font-size: 16px;
		line-height: 1.6;
	}
	.steps {
		align-self: center;
	}
	.night-steps li {
		display: flex;
		gap: 26px;
		padding: 28px 0;
		border-bottom: 1px solid var(--line);
	}
	.night-steps li:first-child {
		padding-top: 0;
	}
	.night-steps li:last-child {
		border: 0;
		padding-bottom: 0;
	}
	.step-symbol {
		font-size: 34px;
		color: var(--butter);
		width: 40px;
		flex-shrink: 0;
	}
	.night-steps h3 {
		font-family: var(--font-display);
		font-size: 25px;
		font-weight: 600;
		letter-spacing: -0.035em;
	}
	.night-steps p {
		font-size: 15px;
		line-height: 1.65;
		color: var(--muted);
		margin-top: 10px;
		max-width: 350px;
	}
	.learn {
		display: grid;
		grid-template-columns: 1fr 1fr;
		column-gap: 80px;
	}
	.learn-heading > p {
		font-size: 15px;
		line-height: 1.6;
		color: var(--muted);
		margin-top: 24px;
	}
	.rankings {
		grid-row: span 2;
	}
	.ranking-row {
		display: flex;
		gap: 18px;
		align-items: center;
		padding: 20px 0;
		border-bottom: 1px solid var(--line);
	}
	.rank-position {
		color: var(--muted);
		font-size: 12px;
		width: 18px;
	}
	.ranking-row h3 {
		font-size: 17px;
		font-weight: 600;
	}
	.ranking-row p {
		color: var(--muted);
		font-size: 12px;
		margin-top: 4px;
	}
	.rank-cards {
		font-family: var(--font-display);
		font-size: 19px;
		color: var(--butter);
		margin-left: auto;
		white-space: nowrap;
		letter-spacing: 0.035em;
	}
	.learning-notes {
		margin-top: 36px;
	}
	.learning-notes details {
		border-top: 1px solid var(--line);
		padding: 18px 0;
		max-width: 430px;
	}
	.learning-notes summary {
		cursor: pointer;
		display: flex;
		justify-content: space-between;
		font-size: 15px;
		list-style: none;
	}
	.learning-notes summary::-webkit-details-marker {
		display: none;
	}
	.learning-notes details p {
		font-size: 14px;
		line-height: 1.7;
		color: var(--muted);
		margin-top: 14px;
	}
	.learning-notes details[open] summary span {
		rotate: 45deg;
	}
	.learning-notes .text-link {
		margin-top: 14px;
	}
	.last-hand {
		background: #c5bddb;
		color: var(--night);
		position: relative;
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		padding: 70px var(--gutter);
		overflow: hidden;
	}
	.last-hand > div,
	.last-hand > button {
		position: relative;
		z-index: 1;
	}
	.last-hand p {
		font-size: 14px;
		margin-bottom: 25px;
	}
	.last-hand h2 {
		font-size: clamp(70px, 10vw, 148px);
		font-weight: 800;
		line-height: 0.88;
		letter-spacing: -0.065em;
	}
	.last-suit {
		position: absolute;
		font-size: 430px;
		line-height: 1;
		left: 53%;
		top: -16px;
		opacity: 0.07;
		font-family: Georgia, serif;
	}
	@media (min-width: 1600px) {
		.invitation {
			padding-inline: max(var(--gutter), calc((100vw - 1320px) / 2));
		}
	}
	@media (max-width: 900px) {
		.circle-label {
			right: 0;
			top: 0;
			width: 90px;
			height: 90px;
			font-size: 7px;
		}
		.circle-label strong {
			font-size: 30px;
		}
		.game-tiles {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.game-tile {
			min-height: 250px;
		}
		.night-plan,
		.learn {
			gap: 36px;
		}
		.rank-cards {
			font-size: 15px;
		}
		.ranking-row {
			gap: 10px;
		}
		.game-shelf,
		.night-plan,
		.learn {
			padding-block: 64px;
		}
	}
	@media (max-width: 600px) {
		.invitation {
			padding-top: 18px;
		}
		.hero {
			min-height: max(520px, calc(100dvh - var(--header-h, 56px) - 66px));
			padding-top: 80px;
			--cw: clamp(78px, min(25vw, 17dvh), 118px);
		}
		h1 {
			font-size: clamp(32px, min(10.8vw, 7dvh), 64px);
		}
		.club-cta {
			min-height: 50px;
		}
		.circle-label {
			width: 76px;
			height: 76px;
			right: 4px;
			top: -100px;
			font-size: 6px;
		}
		.circle-label strong {
			font-size: 27px;
		}
		.invitation-bottom {
			font-size: 10px;
			padding: 14px 0;
		}
		.invitation-bottom > span:nth-child(2) {
			display: none;
		}
		.invitation-bottom a {
			gap: 12px;
		}
		.game-shelf,
		.night-plan,
		.learn {
			padding-block: 48px;
		}
		.section-heading {
			align-items: flex-start;
			margin-bottom: 26px;
		}
		.section-heading h2 {
			font-size: 37px;
		}
		.section-heading .text-link {
			font-size: 12px;
			gap: 10px;
			padding-top: 3px;
			white-space: nowrap;
		}
		.game-tiles {
			gap: 10px;
		}
		.game-tile {
			padding: 16px;
			min-height: 214px;
		}
		.tile-top {
			font-size: 19px;
		}
		.tile-suit {
			font-size: 102px;
		}
		.game-tile p {
			font-size: 11px;
			line-height: 1.5;
			max-width: 110px;
		}
		.shelf-note {
			font-size: 11px;
			line-height: 1.7;
		}
		.night-plan,
		.learn {
			grid-template-columns: 1fr;
			gap: 34px;
		}
		.night-plan h2 {
			font-size: 48px;
		}
		.small-label {
			margin-bottom: 22px;
		}
		.night-plan > div > p {
			font-size: 14px;
			margin-top: 22px;
		}
		.night-steps h3 {
			font-size: 23px;
		}
		.night-steps p {
			font-size: 14px;
		}
		.night-steps li {
			gap: 20px;
			padding: 22px 0;
		}
		.learn h2 {
			font-size: 43px;
		}
		.learn-heading > p {
			font-size: 14px;
			margin-top: 20px;
		}
		.rankings {
			grid-row: auto;
		}
		.rank-cards {
			font-size: 18px;
		}
		.learning-notes {
			margin-top: 0;
		}
		.last-hand {
			padding-block: 42px;
			flex-direction: column;
			align-items: flex-start;
			gap: 28px;
		}
		.last-hand h2 {
			font-size: 88px;
		}
		.last-hand p {
			font-size: 12px;
			margin-bottom: 22px;
		}
		.last-suit {
			left: 48%;
			top: 110px;
			font-size: 300px;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.club-cta,
		.club-cta > span,
		.game-tile,
		.text-link span {
			transition: none !important;
			translate: none !important;
			rotate: none !important;
		}
	}

	.game-tile {
		position: relative;
		isolation: isolate;
		min-height: 330px;
		border: 1px solid #ffffff25;
		box-shadow: 0 4px 0 #0002;
		overflow: hidden;
	}
	.game-tile::before {
		content: '';
		position: absolute;
		inset: 7px;
		border: 1px solid #211c2e20;
		border-radius: 9px;
		z-index: -1;
		pointer-events: none;
	}
	.tile-top {
		font-size: 25px;
	}
	.tile-arrow {
		display: grid;
		place-items: center;
		width: 29px;
		height: 29px;
		border: 1px solid #211c2e35;
		border-radius: 50%;
		font-size: 18px;
		transition: rotate 0.3s;
	}
	.game-tile:hover .tile-arrow {
		rotate: 45deg;
	}
	.tile-hand {
		margin: 8px -8px 10px;
		flex: 1;
	}
	.tile-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		border-top: 1px solid #211c2e25;
		padding-top: 13px;
		margin-top: auto;
	}
	.tile-family {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.015em;
	}
	.tile-suit-mark {
		font-size: 21px;
		line-height: 1;
	}
	.game-tile > p {
		margin-top: 8px;
		font-size: 11px;
		opacity: 0.85;
	}
	.hero-art::before {
		content: '';
		position: absolute;
		inset: 11% 0 18%;
		border: 1px solid #211c2e20;
		border-radius: 50%;
		rotate: -12deg;
	}
	.hero-art::after {
		content: '';
		position: absolute;
		inset: 14% 3% 21%;
		border: 1px dashed #211c2e15;
		border-radius: 50%;
		rotate: -12deg;
		pointer-events: none;
	}
	@media (max-width: 600px) {
		.game-tile {
			min-height: 276px;
			padding: 18px 15px;
		}
		.tile-top {
			font-size: 20px;
		}
		.tile-arrow {
			width: 24px;
			height: 24px;
			font-size: 15px;
		}
		.tile-hand {
			margin: 5px -9px 10px;
		}
		.tile-family {
			font-size: 9px;
			line-height: 1.4;
		}
		.game-tile > p {
			max-width: none;
			font-size: 10px;
		}
		.hero-art::before {
			inset: 11% -2% 17%;
		}
		.hero-art::after {
			inset: 14% 1% 20%;
		}
	}

	@media (max-width: 360px) {
		.game-tiles {
			grid-template-columns: 1fr;
		}
		.game-tile {
			min-height: 310px;
			padding: 22px;
		}
		.tile-top {
			font-size: 25px;
		}
		.tile-hand :global(.demo.compact) {
			--card-w: 68px;
			min-height: 170px;
		}
		.tile-family {
			font-size: 11px;
		}
		.game-tile > p {
			font-size: 12px;
		}
		.tile-arrow {
			width: 28px;
			height: 28px;
			font-size: 18px;
		}
	}
</style>
