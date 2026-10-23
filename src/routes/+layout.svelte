<script lang="ts">
	import { properName } from '#lib/names.js';
	import '../app.css';
	import { Toasts } from '#lib/components/Toasts/index.js';
	import { page, updated } from '$app/state';
	import StartModal from '#lib/start/StartModal.svelte';
	import { onMount } from 'svelte';
	import { club } from '#lib/club/club.svelte.js';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import ProfilePanel from '#lib/club/ProfilePanel.svelte';
	import { profileModal } from '#lib/club/profile-modal.svelte.js';
	import { afterNavigate, beforeNavigate, onNavigate } from '$app/navigation';
	/** One-screen pages that lay out their own width (content lines up with the header). */
	const FULL_BLEED = new Set(['/stats', '/games', '/bots', '/bots/[botId]', '/test-league']);
	import { identify, trackPage } from '#lib/analytics.js';
	import { openStart } from '#lib/start/start-modal.svelte.js';
	let { children } = $props();
	import { goto } from '$app/navigation';
	let menuOpen = $state(false);
	let meOpen = $state(false);
	let scrolled = $state(false);
	let meBox = $state<HTMLDivElement>();
	const links = $derived([
		{ href: '/games', label: 'Games' },
		{ href: '/bots', label: 'Bots' },
		{ href: '/club', label: 'Club' },
		...(club.member ? [{ href: '/stats', label: 'Stats' }] : [])
	]);
	function signOut() {
		menuOpen = meOpen = false;
		club.signOut();
		void goto('/');
	}
	const isRoom = $derived(page.route.id === '/[roomName]' || page.route.id === '/test-table');
	const isHome = $derived(page.route.id === '/');
	/** One-screen app pages: no footer under them, so they never scroll. */
	const isApp = $derived(['/club', '/stats', '/test-stats'].includes(page.route.id ?? ''));
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
	// A newer deploy is live: load the next page fresh instead of from this tab's old code.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
	afterNavigate(({ to }) => {
		menuOpen = meOpen = false;
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
		if (event.key === 'Escape') menuOpen = meOpen = false;
	}}
	onclick={(event) => {
		if (meOpen && !meBox?.contains(event.target as Node)) meOpen = false;
	}}
	onscroll={() => (scrolled = window.scrollY > 4)}
/>
<a class="skip-link" href="#main">Skip to content</a>
<header
	class="site-header"
	class:home-header={isHome}
	class:table-header={isRoom}
	class:scrolled
	class:open={menuOpen}
>
	<nav class="site-nav" aria-label="Main navigation">
		<a class="brand" href="/" aria-label="Chaal home"
			>chaal<span class="brand-suit" aria-hidden="true">♠</span></a
		>
		<div class="nav-links" class:expanded={menuOpen} id="site-links">
			{#each links as link (link.href)}
				<a
					href={link.href}
					aria-current={page.url.pathname === link.href ||
					page.url.pathname.startsWith(link.href + '/')
						? 'page'
						: undefined}>{link.label}</a
				>
			{/each}
			{#if club.member}
				<div class="sheet-only sheet-account">
					<button onclick={() => (profileModal.open = true)}>Your profile</button>
					{#if club.member.role === 'owner'}<a
							href="/admin"
							aria-current={page.route.id === '/admin' ? 'page' : undefined}>Admin</a
						>{/if}
					<button onclick={signOut}>Sign out</button>
				</div>
			{/if}
		</div>
		<div class="nav-actions">
			{#if !isRoom}<button class="nav-play" onclick={openStart}
					><span class="play-suit" aria-hidden="true">♠</span> Let’s play</button
				>{/if}
			{#if club.member}
				<div class="me" bind:this={meBox}>
					<button
						class="profile-button"
						aria-haspopup="menu"
						aria-expanded={meOpen}
						aria-label="Your account: {properName(club.member.nickname)}"
						onclick={() => (meOpen = !meOpen)}
						><CharacterAvatar
							photoDataUrl={club.member.photoDataUrl}
							characterId={club.member.characterId}
							size={30}
						/><span class="chevron" aria-hidden="true"></span></button
					>
					{#if meOpen}
						<div class="me-menu" role="menu">
							<p class="me-name">
								{properName(club.member.nickname)}<span
									>{club.member.role === 'owner' ? 'Club owner' : 'Member'}</span
								>
							</p>
							<button role="menuitem" onclick={() => ((profileModal.open = true), (meOpen = false))}
								>Your profile</button
							>
							{#if club.member.role === 'owner'}<a
									role="menuitem"
									href="/admin"
									aria-current={page.route.id === '/admin' ? 'page' : undefined}>Admin</a
								>{/if}
							<button role="menuitem" class="me-out" onclick={signOut}>Sign out</button>
						</div>
					{/if}
				</div>
			{/if}
			<button
				class="menu-toggle"
				aria-expanded={menuOpen}
				aria-controls="site-links"
				aria-label={menuOpen ? 'Close menu' : 'Open menu'}
				onclick={() => (menuOpen = !menuOpen)}><span aria-hidden="true"></span></button
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
	class:stats-main={FULL_BLEED.has(page.route.id ?? '')}
	class:room-main={isRoom}
>
	{@render children?.()}
	<Toasts />
</main>
{#if !isRoom && !isApp}
	<footer class="site-footer">
		<a class="footer-wordmark" href="/" aria-label="Chaal home"
			>chaal<span aria-hidden="true">♠</span></a
		>
		<nav aria-label="Footer navigation">
			<a href="/games">Games</a><a href="/bots">Bots</a><a href="/club">Club</a><a
				href="/create-room">Take a seat</a
			>
		</nav>
		<p>Made for friends, wherever they are.</p>
	</footer>
{/if}
<StartModal />
<ProfilePanel />

<style>
	/* Header height, shared with pages that fill the viewport under it; and one page width for
	   every page, so header, content and footer line up on wide screens. */
	:global(:root) {
		--header-h: 64px;
		--page-max: 1680px;
	}
	@media (max-width: 720px) {
		:global(:root) {
			--header-h: 56px;
		}
	}
	.site-header {
		position: sticky;
		top: 0;
		z-index: 30;
		background: var(--night);
		color: var(--paper);
		border-bottom: 1px solid transparent;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
		--pill: #ffffff14;
		--pill-on: var(--butter);
		--pill-on-ink: var(--night);
		--edge: var(--line);
	}
	.home-header {
		background: var(--butter);
		color: var(--night);
		--pill: #211c2e12;
		--pill-on: var(--night);
		--pill-on-ink: var(--butter);
		--edge: #211c2e26;
	}
	.site-header.scrolled,
	.site-header.open {
		border-bottom-color: var(--edge);
		box-shadow: 0 6px 18px #0000001f;
	}
	.table-header {
		position: relative;
		border-bottom-color: var(--line);
	}
	.site-nav {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 20px;
		max-width: var(--page-max);
		margin: auto;
		padding: 0 var(--gutter);
		height: var(--header-h);
	}
	.table-header .site-nav {
		height: 52px;
		padding-inline: 14px;
	}
	.brand {
		justify-self: start;
		font-family: var(--font-display);
		font-weight: 800;
		font-size: 30px;
		line-height: 1;
		letter-spacing: -0.07em;
		display: inline-flex;
		align-items: flex-start;
	}
	.table-header .brand {
		font-size: 24px;
	}
	.brand-suit {
		font-family: Georgia, serif;
		font-size: 0.5em;
		margin: 0.12em 0 0 0.12em;
		color: var(--red);
	}
	.home-header .brand-suit {
		color: inherit;
	}

	/* The links: one centred pill group; the current page is the filled pill. */
	.nav-links {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 4px;
		border-radius: 100px;
		background: var(--pill);
	}
	.nav-links > a {
		font-size: 13px;
		font-weight: 600;
		padding: 7px 16px;
		border-radius: 100px;
		white-space: nowrap;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.nav-links > a:hover {
		background: var(--pill);
	}
	.nav-links > a[aria-current] {
		background: var(--pill-on);
		color: var(--pill-on-ink);
	}
	.sheet-only {
		display: none;
	}

	.nav-actions {
		justify-self: end;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.nav-play {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		height: 40px;
		padding: 0 18px;
		border-radius: 100px;
		background: var(--pill-on);
		color: var(--pill-on-ink);
		font-size: 13px;
		font-weight: 700;
		cursor: pointer;
		transition:
			translate 0.2s,
			box-shadow 0.2s;
	}
	.nav-play:hover,
	.nav-play:focus-visible {
		translate: 0 -1px;
		box-shadow: 0 3px 0 #0000002e;
	}
	.play-suit {
		font-family: Georgia, serif;
		color: var(--red);
	}

	/* Account: avatar with a small menu (profile, admin, sign out). */
	.me {
		position: relative;
	}
	.profile-button {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px 3px 3px;
		border-radius: 100px;
		cursor: pointer;
		transition: background 0.2s;
	}
	.profile-button:hover,
	.profile-button[aria-expanded='true'] {
		background: var(--pill);
	}
	.chevron {
		width: 6px;
		height: 6px;
		border-right: 1.5px solid currentColor;
		border-bottom: 1.5px solid currentColor;
		rotate: 45deg;
		translate: 0 -2px;
		opacity: 0.7;
	}
	.me-menu {
		position: absolute;
		right: 0;
		top: calc(100% + 10px);
		min-width: 210px;
		padding: 6px;
		border-radius: 16px;
		background: var(--surface);
		color: var(--paper);
		border: 1px solid var(--line);
		box-shadow: 0 14px 34px #0000004d;
		display: flex;
		flex-direction: column;
	}
	.me-name {
		padding: 10px 12px 12px;
		margin-bottom: 4px;
		border-bottom: 1px solid var(--line);
		font-weight: 700;
		font-size: 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.me-name span {
		font-weight: 400;
		font-size: 12px;
		color: var(--muted);
	}
	.me-menu > a,
	.me-menu > button {
		text-align: left;
		padding: 10px 12px;
		border-radius: 10px;
		font-size: 13px;
		cursor: pointer;
	}
	.me-menu > a:hover,
	.me-menu > button:hover,
	.me-menu > a:focus-visible,
	.me-menu > button:focus-visible {
		background: #ffffff12;
	}
	.me-out {
		color: var(--red);
	}

	.menu-toggle {
		display: none;
	}

	.site-main {
		width: 100%;
		min-height: calc(100dvh - var(--header-h));
		padding: 0 var(--gutter);
		max-width: var(--page-max);
		margin: auto;
		outline: none;
	}
	.site-main.home-main,
	.site-main.club-main,
	.site-main.stats-main {
		padding: 0;
		max-width: none;
	}
	.site-main.room-main {
		padding-inline: 8px;
		max-width: none;
	}

	/* Footer: one quiet line. */
	.site-footer {
		max-width: var(--page-max);
		margin: auto;
		padding: 28px var(--gutter);
		display: flex;
		align-items: center;
		gap: 32px;
		border-top: 1px solid var(--line);
		font-size: 12px;
		color: var(--muted);
	}
	.footer-wordmark {
		font-family: var(--font-display);
		font-size: 22px;
		font-weight: 800;
		letter-spacing: -0.07em;
		color: var(--paper);
		display: inline-flex;
		align-items: flex-start;
	}
	.footer-wordmark span {
		font-family: Georgia, serif;
		font-size: 0.5em;
		margin: 0.12em 0 0 0.12em;
		color: var(--red);
	}
	.site-footer nav {
		display: flex;
		gap: 24px;
	}
	.site-footer nav a {
		transition: color 0.2s;
	}
	.site-footer nav a:hover,
	.site-footer nav a:focus-visible {
		color: var(--paper);
	}
	.site-footer > p {
		margin-left: auto;
	}

	@media (max-width: 720px) {
		.site-nav {
			grid-template-columns: auto 1fr;
			gap: 12px;
		}
		.brand {
			font-size: 27px;
		}
		.nav-play {
			height: 36px;
			padding: 0 14px;
			font-size: 12px;
		}
		.chevron {
			display: none;
		}
		.profile-button {
			padding: 2px;
		}
		.menu-toggle {
			display: grid;
			place-items: center;
			width: 40px;
			height: 40px;
			border-radius: 100px;
			cursor: pointer;
		}
		.menu-toggle:hover {
			background: var(--pill);
		}
		/* Two lines that close into a cross. */
		.menu-toggle span,
		.menu-toggle span::before {
			display: block;
			width: 18px;
			height: 1.5px;
			background: currentColor;
			transition:
				rotate 0.2s,
				translate 0.2s;
		}
		.menu-toggle span {
			translate: 0 -3px;
		}
		.menu-toggle span::before {
			content: '';
			translate: 0 6px;
		}
		.menu-toggle[aria-expanded='true'] span {
			translate: 0;
			rotate: 45deg;
		}
		.menu-toggle[aria-expanded='true'] span::before {
			translate: 0;
			rotate: -90deg;
		}
		.nav-links {
			display: none;
			position: absolute;
			left: 0;
			right: 0;
			top: 100%;
			padding: 12px var(--gutter) 22px;
			border-radius: 0;
			background: inherit;
			background-color: var(--night);
			color: var(--paper);
			border-bottom: 1px solid var(--line);
			box-shadow: 0 16px 24px #0003;
		}
		.home-header .nav-links {
			background-color: var(--butter);
			color: var(--night);
			border-bottom-color: #211c2e26;
		}
		.nav-links.expanded {
			display: flex;
			flex-direction: column;
			align-items: stretch;
		}
		.nav-links > a {
			font-family: var(--font-display);
			font-size: 26px;
			font-weight: 700;
			letter-spacing: -0.03em;
			padding: 10px 14px;
			border-radius: 14px;
		}
		.sheet-only {
			display: flex;
		}
		.sheet-account {
			flex-direction: column;
			margin-top: 10px;
			padding-top: 10px;
			border-top: 1px solid var(--edge);
		}
		.sheet-account > a,
		.sheet-account > button {
			text-align: left;
			font-size: 15px;
			padding: 11px 14px;
			border-radius: 12px;
			cursor: pointer;
		}
		.sheet-account > a[aria-current] {
			background: var(--pill-on);
			color: var(--pill-on-ink);
		}
		.site-footer {
			flex-wrap: wrap;
			gap: 14px 24px;
			padding-block: 24px;
		}
		.site-footer > p {
			margin-left: 0;
			width: 100%;
		}
	}
	@media (max-width: 380px) {
		.nav-play .play-suit {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.site-header,
		.nav-play,
		.nav-links > a,
		.menu-toggle span,
		.menu-toggle span::before {
			transition: none;
			translate: none;
		}
	}
</style>
