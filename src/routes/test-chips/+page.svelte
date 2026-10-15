<script lang="ts">
	import { asset } from '$app/paths';
	import CasinoChip from '#lib/components/CasinoChip.svelte';
	const denominations = [5, 10, 20, 25, 50, 100, 200, 500, 1000] as const;
</script>

<svelte:head>
	<title>PROBO PLAYER · Chip collection</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<header>
		<p class="eyebrow">PROBO PLAYER / CT</p>
		<h1>The chip collection</h1>
		<p>Nine denominations. One signature design.</p>
	</header>
	<section class="collection" aria-label="All chip denominations">
		{#each denominations as denomination (denomination)}
			<figure>
				<CasinoChip {denomination} size="clamp(110px, 18vw, 210px)" />
				<figcaption>
					{denomination}
					<a href={asset(`chips/probo-player-${denomination}.svg`)} download>Download SVG</a>
				</figcaption>
			</figure>
		{/each}
	</section>
	<section class="felt" aria-label="Chips on a dark background">
		<h2>Made for the table</h2>
		<div class="sizes">
			<CasinoChip denomination={25} size={32} />
			<CasinoChip denomination={25} size={64} />
			<CasinoChip denomination={25} size={128} />
			<CasinoChip denomination={25} size={220} />
		</div>
	</section>
</main>

<style>
	main {
		min-height: 100vh;
		background: #f5f0e5;
		color: #173d31;
		padding: clamp(24px, 5vw, 72px);
	}
	header {
		max-width: 1100px;
		margin: 0 auto 40px;
	}
	.eyebrow {
		font: 700 12px system-ui;
		letter-spacing: 0.2em;
	}
	h1 {
		font:
			500 clamp(32px, 5vw, 60px) Georgia,
			serif;
		margin: 12px 0;
	}
	header > p:last-child {
		color: #52675c;
	}
	.collection {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 32px 16px;
		max-width: 1100px;
		margin: auto;
	}
	figure {
		text-align: center;
		margin: 0;
	}
	figcaption {
		font:
			600 20px Georgia,
			serif;
		margin: 8px 0;
	}
	a {
		display: block;
		margin-top: 8px;
		font: 12px system-ui;
		color: #52675c;
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.felt {
		max-width: 1100px;
		margin: 48px auto 0;
		padding: 32px;
		border-radius: 20px;
		background: radial-gradient(ellipse at top, #195541, #082b23);
		color: #f2e5c9;
	}
	h2 {
		font:
			400 28px Georgia,
			serif;
	}
	.sizes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 24px;
		padding: 24px 0;
	}
	@media (max-width: 480px) {
		.collection {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
