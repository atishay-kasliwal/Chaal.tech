<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head><title>Table unavailable · Chaal</title></svelte:head>
<section class="room-error">
	<span class="error-suit" aria-hidden="true">♠</span>
	<p>Looks like we missed the deal.</p>
	<h1>This table<br />isn’t here.</h1>
	<p class="error-note">
		{page.error?.message || 'The game may have ended, or the link might be incomplete.'}
	</p>
	<a href="/club">Find your people <span aria-hidden="true">↗</span></a><a class="home" href="/"
		>Back to Chaal</a
	>
</section>

<style>
	.room-error {
		max-width: 700px;
		margin: 52px auto;
		padding: clamp(30px, 6vw, 64px);
		background: var(--butter);
		color: var(--night);
		border-radius: 18px;
	}
	.error-suit {
		font-size: 60px;
		font-family: Georgia, serif;
		display: block;
		line-height: 1;
		margin-bottom: 30px;
	}
	.room-error > p {
		font-size: 14px;
	}
	.room-error h1 {
		font-family: var(--font-display);
		font-size: clamp(48px, 7vw, 82px);
		font-weight: 700;
		line-height: 0.94;
		letter-spacing: -0.055em;
		margin: 20px 0 24px;
	}
	.error-note {
		opacity: 0.8;
		max-width: 400px;
	}
	.room-error a {
		display: inline-flex;
		gap: 30px;
		background: var(--night);
		color: var(--paper);
		border-radius: 100px;
		padding: 14px 22px;
		margin-top: 28px;
		font-size: 14px;
		transition: translate 0.2s;
	}
	.room-error a:hover {
		translate: 0 -3px;
	}
	.room-error .home {
		display: block;
		width: fit-content;
		background: none;
		color: var(--night);
		text-decoration: underline;
		padding: 0;
		margin-top: 20px;
		font-size: 12px;
	}
	.room-error :focus-visible {
		outline-color: var(--night);
	}
</style>
