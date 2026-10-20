<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>{page.status} · A card out of place · Chaal</title></svelte:head>
<section class="missing-card">
	<div class="card-corner" aria-hidden="true">{page.status}<span>♠</span></div>
	<p>A card out of place.</p>
	<h1>{page.status === 404 ? 'This seat is empty.' : 'We lost the hand.'}</h1>
	<p class="explanation">{page.error?.message ?? 'Let’s get you back to the table.'}</p>
	<a href="/">Back to Chaal <span aria-hidden="true">↗</span></a>
</section>

<style>
	.missing-card {
		margin: 56px auto;
		max-width: 800px;
		background: var(--butter);
		color: var(--night);
		border-radius: 18px;
		padding: clamp(28px, 6vw, 72px);
		position: relative;
	}
	.card-corner {
		font-family: var(--font-display);
		font-size: 28px;
		font-weight: 700;
		display: flex;
		flex-direction: column;
		line-height: 1.1;
		margin-bottom: 40px;
	}
	.card-corner span {
		font-family: Georgia, serif;
		font-size: 36px;
	}
	.missing-card > p {
		font-size: 14px;
	}
	.missing-card h1 {
		font-family: var(--font-display);
		font-size: clamp(45px, 7vw, 80px);
		letter-spacing: -0.055em;
		line-height: 0.98;
		font-weight: 700;
		margin: 20px 0;
	}
	.explanation {
		opacity: 0.75;
	}
	.missing-card a {
		display: flex;
		width: fit-content;
		gap: 40px;
		align-items: center;
		background: var(--night);
		color: var(--paper);
		padding: 14px 22px;
		border-radius: 100px;
		margin-top: 32px;
		font-size: 14px;
		transition: translate 0.2s;
	}
	.missing-card a:hover {
		translate: 0 -3px;
	}
	.missing-card :focus-visible {
		outline-color: var(--night);
	}
</style>
