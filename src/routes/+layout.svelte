<script lang="ts">
	import '../app.css';
	import { Toasts } from '#lib/components/Toasts/index.js';
	import { page } from '$app/state';
	import { fade, fly } from 'svelte/transition';

	let { children } = $props();
</script>

<nav
	class="navbar bg-base-100 relative z-20 container mx-auto"
	class:room-route={page.route.id === '/[roomName]'}
>
	<div class="navbar-start">
		<a class="text-xl normal-case" href="/">Chaal.tech</a>
	</div>
	<div class="navbar-end">
		<a
			class="link link-hover mr-4"
			href="https://github.com/mustafa-kapadia1483/teen-patti"
			target="_blank"
			rel="noreferrer">Github</a
		>
		<a href="/create-room" class="btn btn-primary">Join / Create Room</a>
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

<style>
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
