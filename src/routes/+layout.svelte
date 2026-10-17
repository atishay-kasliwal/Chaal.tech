<script lang="ts">
	import { properName } from '#lib/names.js';
	import '../app.css';
	import { Toasts } from '#lib/components/Toasts/index.js';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import StartModal from '#lib/start/StartModal.svelte';
	import { onMount } from 'svelte';
	import { club } from '#lib/club/club.svelte.js';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import ProfilePanel from '#lib/club/ProfilePanel.svelte';
	import { profileModal } from '#lib/club/profile-modal.svelte.js';
	import { afterNavigate } from '$app/navigation';
	import { identify, trackPage } from '#lib/analytics.js';

	let { children } = $props();
	onMount(() => club.start());
	// Tag before the first page view so it already belongs to the signed-in friend.
	$effect(() => {
		if (club.status !== 'loading') identify(club.member?.memberId ?? null, club.member?.role);
	});
	afterNavigate(({ to }) => {
		if (to) trackPage(to.url, to.route.id);
	});
</script>

<nav class="site-nav navbar relative z-20" aria-label="Main navigation">
	<div class="navbar-start min-w-0 flex-1">
		<a class="inline-flex shrink-0 items-center" href="/" aria-label="Chaal.tech home">
			<img
				class="brand-logo"
				src="/brand/chaal-logo.svg"
				width="208"
				height="52"
				alt="Chaal.tech"
			/>
		</a>
	</div>
	<div class="navbar-end w-auto shrink-0 gap-2">
		{#if club.member}
			<a
				href="/club"
				class="btn btn-ghost rounded-full"
				aria-current={page.route.id === '/club' ? 'page' : undefined}>Club</a
			>
		{/if}
		{#if club.member}
			<a
				href="/stats"
				class="btn btn-ghost rounded-full"
				aria-current={page.route.id === '/stats' ? 'page' : undefined}>Stats</a
			>
			<a href="/bots" class="btn btn-ghost rounded-full" aria-current={page.url.pathname.startsWith('/bots') ? 'page' : undefined}>Bots</a>
		{/if}
		{#if club.member?.role === 'owner'}
			<a
				href="/admin"
				class="btn btn-ghost rounded-full"
				aria-current={page.route.id === '/admin' ? 'page' : undefined}>Admin</a
			>
		{/if}
		{#if club.member}
			<button
				class="rounded-full"
				onclick={() => (profileModal.open = true)}
				aria-label="Your profile: {properName(club.member.nickname)}"
			>
				<CharacterAvatar
					photoDataUrl={club.member.photoDataUrl}
					characterId={club.member.characterId}
					size={38}
				/>
			</button>
		{/if}
	</div>
</nav>

<main
	class="container mx-auto min-h-[calc(100dvh-72px)] px-2"
	class:club-main={page.route.id === '/club'}
	class:room-main={page.route.id === '/[roomName]'}
>
	<div class="relative grid w-full">
		{#key page.url.pathname}
			<div
				class="col-start-1 row-start-1 min-w-0 w-full"
				in:fly={{ y: 20, opacity: 0, duration: 400, delay: 400 }}
				out:fade={{ duration: 400 }}
			>
				{@render children?.()}
			</div>
		{/key}
	</div>
	<Toasts />
</main>

<StartModal />
<ProfilePanel />

<style>
	.site-nav {
		width: 100%;
		max-width: none;
		height: 72px;
		min-height: 72px;
		padding-inline: max(1rem, calc((100vw - 1240px) / 2));
		background: #07140e;
		border-bottom: 1px solid #e7c78418;
	}
	.club-main {
		max-width: none;
		width: 100%;
		min-height: 0;
		padding: 0;
	}

	.brand-logo {
		display: block;
		width: 176px;
		height: auto;
		max-width: none;
	}

	.site-nav a[aria-current='page'] {
		background: rgb(231 199 132 / 12%);
		color: #e7c784;
	}
	@media (min-width: 640px) {
		.brand-logo {
			width: 208px;
		}
	}
	@media (max-width: 479px) {
		.brand-logo {
			width: 144px;
		}
		.site-nav .navbar-end {
			gap: 0.25rem;
		}
		.site-nav .btn {
			padding-inline: 0.65rem;
		}
	}

	@media (max-width: 959px) and (max-height: 500px) {
		.room-main {
			min-height: calc(100dvh - 72px);
			overflow: hidden;
		}
	}
</style>
