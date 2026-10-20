<script lang="ts">
	import { properName } from '#lib/names.js';
	import '../app.css';
	import { Toasts } from '#lib/components/Toasts/index.js';
	import { page } from '$app/state';
	import StartModal from '#lib/start/StartModal.svelte';
	import { onMount } from 'svelte';
	import { club } from '#lib/club/club.svelte.js';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import ProfilePanel from '#lib/club/ProfilePanel.svelte';
	import { profileModal } from '#lib/club/profile-modal.svelte.js';
	import { afterNavigate, onNavigate } from '$app/navigation';
	import { identify, trackPage } from '#lib/analytics.js';
	import { openStart } from '#lib/start/start-modal.svelte.js';
	let { children } = $props();
	let menuOpen = $state(false);
	const isRoom = $derived(page.route.id === '/[roomName]' || page.route.id === '/test-table');
	const isHome = $derived(page.route.id === '/');
	onMount(() => club.start());
	$effect(() => {
		if (club.status !== 'loading') identify(club.member?.memberId ?? null, club.member?.role);
	});
	onNavigate((navigation) => {
		if (
			!document.startViewTransition ||
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		)
			return;
		return new Promise<void>((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});
	afterNavigate(({ to }) => {
		menuOpen = false;
		if (to) trackPage(to.url, to.route.id);
	});

	const description = $derived(
		(
			{
				'/club':
					'Your Chaal clubhouse: find friends, start a card table and catch up on the club record.',
				'/stats': 'Your recorded Chaal hands, nights, game history and card statistics.',
				'/admin': 'Manage the Chaal guest list, table defaults and game nights.',
				'/availability/[key]': 'Pick the times you can join your friends for a Chaal game night.'
			} as Record<string, string>
		)[page.route.id ?? ''] ??
			'Good cards. Better company. Your friends and favourite card games around one video table.'
	);
</script>

<svelte:head>
	{#if !['/', '/games', '/create-room'].includes(page.route.id ?? '')}<meta
			name="description"
			content={description}
		/>{/if}
	{#if page.route.id && !['/', '/games'].includes(page.route.id)}<meta
			name="robots"
			content="noindex, nofollow"
		/>{:else}<link rel="canonical" href={'https://chaal.tech' + page.url.pathname} />{/if}
</svelte:head>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape') menuOpen = false;
	}}
/>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header" class:home-header={isHome} class:table-header={isRoom}>
	<nav class="site-nav" aria-label="Main navigation">
		<a class="brand" href="/" aria-label="Chaal home"
			>chaal<span class="brand-suit" aria-hidden="true">♠</span><span class="brand-dot">.</span></a
		>
		<span class="brand-note">Good cards.<br />Better company.</span>
		<div class="nav-links" class:expanded={menuOpen} id="site-links">
			<a href="/games" aria-current={page.route.id === '/games' ? 'page' : undefined}>The games</a>
			<a href="/club" aria-current={page.route.id === '/club' ? 'page' : undefined}>The club</a>
			{#if club.member}
				<a href="/stats" aria-current={page.route.id === '/stats' ? 'page' : undefined}
					>Your stats</a
				>
			{/if}
			{#if club.member?.role === 'owner'}<a
					href="/admin"
					aria-current={page.route.id === '/admin' ? 'page' : undefined}>Admin</a
				>{/if}
		</div>
		<div class="nav-actions">
			{#if !isRoom}<button class="nav-play" onclick={openStart}
					>Let’s play <span aria-hidden="true">↗</span></button
				>{/if}
			{#if club.member}<button
					class="profile-button"
					onclick={() => (profileModal.open = true)}
					aria-label="Your profile: {properName(club.member.nickname)}"
					><CharacterAvatar
						photoDataUrl={club.member.photoDataUrl}
						characterId={club.member.characterId}
						size={34}
					/></button
				>{/if}
			<button
				class="menu-toggle"
				aria-expanded={menuOpen}
				aria-controls="site-links"
				onclick={() => (menuOpen = !menuOpen)}
				>{menuOpen ? 'Close' : 'Menu'}<span aria-hidden="true">{menuOpen ? '×' : '+'}</span></button
			>
		</div>
	</nav>
</header>

<main
	id="main"
	tabindex="-1"
	class="site-main"
	class:home-main={isHome}
	class:club-main={page.route.id === '/club'}
	class:room-main={isRoom}
>
	{@render children?.()}
	<Toasts />
</main>
{#if !isRoom}
	<footer class="site-footer">
		<a class="footer-wordmark" href="/" aria-label="Chaal home"
			>chaal<span aria-hidden="true">♠</span>.</a
		>
		<p>Good cards. Better company.</p>
		<nav aria-label="Footer navigation">
			<a href="/games">The games</a>
			<a href="/bots" aria-current={page.url.pathname.startsWith('/bots') ? 'page' : undefined}
				>The bots</a
			><a href="/club">The club</a><a href="/create-room">Take a seat</a>
		</nav>
		<span class="footer-note">Made for friends, wherever they are.</span>
	</footer>
{/if}
<StartModal />
<ProfilePanel />

<style>
	.site-header {
		position: relative;
		z-index: 30;
		background: var(--night);
		color: var(--paper);
		border-bottom: 1px solid var(--line);
	}
	.home-header {
		background: var(--butter);
		color: var(--night);
		border-bottom-color: #211c2e30;
	}
	.site-nav {
		display: flex;
		align-items: center;
		gap: 24px;
		max-width: 1440px;
		margin: auto;
		padding: 0 var(--gutter);
		min-height: 88px;
	}
	.brand {
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 47px;
		line-height: 1;
		letter-spacing: -0.07em;
		display: inline-flex;
		align-items: center;
	}
	.brand-suit {
		font-family: Georgia, serif;
		font-size: 26px;
		margin-left: 4px;
		align-self: flex-start;
		line-height: 1.6;
	}
	.brand-dot {
		margin-left: -2px;
	}
	.brand-note {
		font-size: 10px;
		line-height: 1.45;
		border-left: 1px solid currentColor;
		padding-left: 18px;
		opacity: 0.7;
	}
	.nav-links {
		display: flex;
		align-items: center;
		gap: 28px;
		margin-left: auto;
	}
	.nav-links > a {
		font-size: 13px;
		position: relative;
		padding: 12px 0;
		white-space: nowrap;
	}
	.nav-links > a:after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: 6px;
		height: 1px;
		background: currentColor;
		scale: 0 1;
		transform-origin: left;
		transition: scale 0.25s;
	}
	.nav-links > a:hover:after,
	.nav-links > a:focus-visible:after,
	.nav-links > a[aria-current]:after {
		scale: 1 1;
	}
	.nav-actions {
		display: flex;
		align-items: center;
		gap: 14px;
	}
	.nav-play {
		display: flex;
		align-items: center;
		gap: 26px;
		padding: 11px 19px;
		border: 1px solid currentColor;
		border-radius: 100px;
		font-size: 13px;
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s,
			translate 0.2s;
	}
	.nav-play:hover {
		background: var(--butter);
		color: var(--night);
		translate: 0 -2px;
	}
	.home-header .nav-play:hover {
		background: var(--night);
		color: var(--butter);
	}
	.nav-play > span {
		font-size: 19px;
	}
	.profile-button {
		border-radius: 100px;
		cursor: pointer;
		transition: scale 0.2s;
	}
	.profile-button:hover {
		scale: 1.08;
	}
	.menu-toggle {
		display: none;
	}
	.site-main {
		width: 100%;
		min-height: calc(100dvh - 88px);
		padding: 0 var(--gutter);
		max-width: 1440px;
		margin: auto;
		outline: none;
	}
	.site-main.home-main,
	.site-main.club-main {
		padding: 0;
		max-width: none;
	}
	.site-main.room-main {
		padding-inline: 8px;
		max-width: none;
	}
	.site-footer {
		padding: 40px var(--gutter) 30px;
		max-width: 1440px;
		margin: auto;
		display: grid;
		grid-template-columns: auto 1fr auto;
		align-items: center;
		gap: 25px 35px;
		border-top: 1px solid var(--line);
	}
	.footer-wordmark {
		font-family: var(--font-display);
		font-size: 40px;
		letter-spacing: -0.07em;
		font-weight: 800;
	}
	.footer-wordmark span {
		font-family: Georgia, serif;
		font-size: 22px;
		vertical-align: top;
		margin-left: 4px;
	}
	.site-footer > p {
		color: var(--muted);
		font-size: 12px;
	}
	.site-footer nav {
		display: flex;
		gap: 24px;
		font-size: 12px;
	}
	.site-footer nav a:hover {
		text-decoration: underline;
		text-underline-offset: 5px;
	}
	.footer-note {
		grid-column: 1/-1;
		color: var(--muted);
		font-size: 10px;
	}
	@media (max-width: 900px) {
		.brand-note {
			display: none;
		}
		.site-nav {
			gap: 20px;
		}
		.nav-links {
			gap: 20px;
		}
		.nav-actions {
			gap: 10px;
		}
		.site-footer {
			grid-template-columns: auto 1fr;
		}
		.site-footer nav {
			grid-column: 1/-1;
		}
		.site-footer > p {
			text-align: right;
		}
	}
	@media (max-width: 900px) {
		.site-nav {
			min-height: 72px;
			gap: 12px;
		}
		.brand {
			font-size: 38px;
		}
		.brand-suit {
			font-size: 21px;
		}
		.nav-actions {
			margin-left: auto;
			gap: 12px;
		}
		.nav-play {
			padding: 8px 13px;
			font-size: 12px;
			gap: 14px;
		}
		.nav-play > span {
			font-size: 17px;
		}
		.menu-toggle {
			display: flex;
			align-items: center;
			gap: 7px;
			font-size: 12px;
			min-height: 40px;
			cursor: pointer;
		}
		.menu-toggle span {
			font-size: 20px;
		}
		.nav-links {
			display: none;
			position: absolute;
			left: 0;
			right: 0;
			top: 100%;
			padding: 18px var(--gutter) 24px;
			background: var(--night);
			color: var(--paper);
			border-bottom: 1px solid var(--line);
			margin: 0;
			box-shadow: 0 12px 20px #0002;
		}
		.nav-links.expanded {
			display: flex;
			flex-direction: column;
			align-items: stretch;
			gap: 2px;
		}
		.nav-links > a {
			font-family: var(--font-display);
			font-size: 24px;
			padding: 10px 0;
		}
		.nav-links > a:after {
			right: auto;
			width: 50px;
		}
		.site-main {
			min-height: calc(100dvh - 72px);
		}
		.site-footer {
			padding-block: 30px;
			gap: 18px;
		}
		.site-footer nav {
			justify-content: space-between;
			gap: 16px;
		}
		.footer-wordmark {
			font-size: 34px;
		}
		.site-footer > p {
			font-size: 11px;
		}
		.profile-button {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.nav-play,
		.profile-button,
		.nav-links > a:after {
			transition: none;
			translate: none;
			scale: 1;
		}
	}
</style>
