<script lang="ts">
	import '../app.css';
	import { Toasts } from '#lib/components/Toasts/index.js';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';
	import StartModal from '#lib/start/StartModal.svelte';
	import { openStart } from '#lib/start/start-modal.svelte.js';
	import { onMount } from 'svelte';
	import { club } from '#lib/club/club.svelte.js';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import ProfilePanel from '#lib/club/ProfilePanel.svelte';
	import { profileModal } from '#lib/club/profile-modal.svelte.js';

	let { children } = $props();
	onMount(() => club.start());
</script>

<nav
	class="navbar bg-base-100 relative z-20 container mx-auto"
	class:room-route={page.route.id === '/[roomName]'}
>
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
		{#if club.member && page.route.id !== '/club'}
			<a href="/club" class="btn btn-ghost rounded-full">Club</a>
		{/if}
		{#if page.route.id !== '/create-room'}
			<!-- Opens the pop-up; the link still works without JavaScript. -->
			<a
				href="/create-room"
				class="btn btn-primary rounded-full"
				onclick={(event) => {
					event.preventDefault();
					openStart();
				}}>Start a table</a
			>
		{/if}
		{#if club.member}
			<button
				class="rounded-full"
				onclick={() => (profileModal.open = true)}
				aria-label="Your profile: {club.member.nickname}"
			>
				<CharacterAvatar characterId={club.member.characterId} size={38} />
			</button>
		{/if}
	</div>
</nav>

<main
	class="container mx-auto min-h-[calc(100vh-4rem)] px-2"
	class:room-main={page.route.id === '/[roomName]'}
>
	<div class="relative grid w-full">
		{#key page.url.pathname}
			<div
				class="col-start-1 row-start-1 w-full"
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
	.brand-logo {
		display: block;
		width: 176px;
		height: auto;
		max-width: none;
	}

	@media (min-width: 640px) {
		.brand-logo {
			width: 208px;
		}
	}

	@media (max-width: 959px) and (max-height: 500px) {
		.room-route {
			display: none;
		}
		.room-main {
			min-height: 100dvh;
			overflow: hidden;
		}
	}
</style>
