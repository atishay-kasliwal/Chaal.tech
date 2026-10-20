<script lang="ts">
	import StartPanel from '#lib/start/StartPanel.svelte';
	import ClubGate from '#lib/club/ClubGate.svelte';
</script>

<svelte:head
	><title>Take a seat · Chaal</title><meta
		name="description"
		content="Start a private Chaal table, invite your club friends, or join a game night."
	/></svelte:head
>
<div class="setup-page">
	<div class="setup-intro">
		<a href="/club">← Back to the club</a>
		<h1>A good night<br />starts with<br /><span>one table.</span></h1>
		<p>Pick your game. Invite your people.<br />We’ll save you a seat.</p>
		<span class="setup-suit" aria-hidden="true">♠</span>
	</div>
	<section class="setup-card" aria-label="Start or join a table">
		<ClubGate heading="h2"><StartPanel /></ClubGate>
	</section>
</div>

<style>
	.setup-page {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 80px;
		align-items: center;
		max-width: 1160px;
		margin: auto;
		padding: 60px 0 80px;
		min-height: calc(100dvh - 88px);
	}
	.setup-intro > a {
		font-size: 12px;
		color: var(--muted);
		display: inline-block;
		margin-bottom: 32px;
	}
	.setup-intro h1 {
		font-family: var(--font-display);
		font-size: clamp(48px, 5.8vw, 82px);
		font-weight: 700;
		line-height: 0.95;
		letter-spacing: -0.055em;
	}
	.setup-intro h1 span {
		color: var(--butter);
	}
	.setup-intro p {
		font-size: 16px;
		line-height: 1.7;
		color: var(--muted);
		margin-top: 26px;
	}
	.setup-suit {
		font-family: Georgia, serif;
		font-size: 100px;
		display: block;
		line-height: 1.2;
		color: #c5bddb;
		margin-top: 26px;
		rotate: -12deg;
		width: fit-content;
	}
	.setup-card {
		padding: 30px;
		border: 1px solid var(--line);
		border-radius: 18px;
		background: var(--surface);
	}
	.setup-card :global(.gate) {
		border: 0;
		padding: 20px 0;
		margin: 0;
		background: transparent;
	}
	.setup-card :global(h2) {
		font-family: var(--font-display);
		letter-spacing: -0.035em;
	}
	@media (max-width: 700px) {
		.setup-page {
			grid-template-columns: 1fr;
			gap: 32px;
			padding: 32px 0 48px;
			min-height: 0;
		}
		.setup-intro h1 {
			font-size: 51px;
		}
		.setup-intro p {
			font-size: 14px;
			margin-top: 20px;
		}
		.setup-intro > a {
			margin-bottom: 24px;
		}
		.setup-suit {
			display: none;
		}
		.setup-card {
			padding: 24px;
		}
		.setup-card :global(.gate) {
			min-height: 260px;
		}
	}
</style>
