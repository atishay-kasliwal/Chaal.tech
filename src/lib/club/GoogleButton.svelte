<script lang="ts">
	import { onMount } from 'svelte';
	import { club, type GoogleIdentity } from './club.svelte.js';

	const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
	let target: HTMLDivElement | undefined = $state();
	let failed = $state(false);

	let scriptLoad: Promise<void> | undefined;
	function loadScript() {
		scriptLoad ??= new Promise<void>((resolve, reject) => {
			const script = document.createElement('script');
			script.src = 'https://accounts.google.com/gsi/client';
			script.async = true;
			script.onload = () => resolve();
			script.onerror = () => reject(new Error('Google sign-in did not load'));
			document.head.append(script);
		});
		return scriptLoad;
	}

	onMount(() => {
		if (!clientId) return;
		void loadScript()
			.then(() => {
				const google = (window as unknown as { google: GoogleIdentity }).google;
				google.accounts.id.initialize({
					client_id: clientId,
					callback: ({ credential }: { credential?: string }) =>
						credential && club.signIn(credential),
					// No redirect: the popup returns here, so the invite link you opened stays put.
					ux_mode: 'popup',
					cancel_on_tap_outside: true
				});
				if (target)
					google.accounts.id.renderButton(target, {
						theme: 'filled_black',
						size: 'large',
						shape: 'pill',
						text: 'continue_with',
						width: Math.min(320, target.clientWidth || 320)
					});
			})
			.catch(() => (failed = true));
	});
</script>

{#if !clientId}
	<p class="note">Sign-in is not set up yet. Set VITE_GOOGLE_CLIENT_ID and rebuild.</p>
{:else if failed}
	<p class="note">
		Google sign-in could not load. Check your connection or ad blocker, then reload.
	</p>
{:else}
	<div class="google-slot" bind:this={target} aria-busy={club.busy}></div>
{/if}

<style>
	.google-slot {
		display: flex;
		min-height: 44px;
		width: 100%;
		justify-content: center;
	}
	.note {
		color: #e9c8a0;
		font-size: 0.875rem;
		text-align: center;
	}
</style>
