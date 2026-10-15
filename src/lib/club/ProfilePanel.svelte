<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { X } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { club } from './club.svelte.js';
	import CharacterPicker from './CharacterPicker.svelte';
	import CharacterAvatar from './CharacterAvatar.svelte';
	import { profileModal } from './profile-modal.svelte.js';

	let nickname = $state('');
	let characterId = $state('');
	let reducedMotion = $state(false);
	let error = $state('');
	let saved = $state(false);

	$effect(() => {
		if (profileModal.open && club.member) {
			nickname = club.member.nickname;
			characterId = club.member.characterId;
			reducedMotion = club.member.reducedMotion;
			error = '';
			saved = false;
		}
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		error = (await club.save({ nickname, characterId, reducedMotion })) ?? '';
		saved = !error;
	}

	function signOut() {
		profileModal.open = false;
		club.signOut();
		void goto('/');
	}
</script>

<svelte:window
	onkeydown={(event) => event.key === 'Escape' && profileModal.open && (profileModal.open = false)}
/>

{#if profileModal.open && club.member}
	<div
		class="scrim"
		onclick={() => (profileModal.open = false)}
		aria-hidden="true"
		transition:fade={{ duration: 160 }}
	></div>
	<div
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label="Your profile"
		transition:fly={{ y: 24, duration: 220 }}
	>
		<form class="sheet-body" onsubmit={save}>
			<button
				type="button"
				class="close"
				onclick={() => (profileModal.open = false)}
				aria-label="Close"><X class="h-4 w-4" /></button
			>
			<div class="who">
				<CharacterAvatar {characterId} size={64} />
				<div>
					<h2>{club.member.nickname}</h2>
					<p>{club.member.role === 'owner' ? 'Club owner' : 'Club member'}</p>
				</div>
			</div>
			<label class="field">
				<span>Nickname</span>
				<input bind:value={nickname} maxlength="24" required autocomplete="nickname" />
			</label>
			<CharacterPicker bind:value={characterId} />
			<label class="motion">
				<input type="checkbox" class="toggle toggle-sm" bind:checked={reducedMotion} />
				<span>Reduce motion</span>
			</label>
			<p class="hint">Name changes show at your next table join.</p>
			{#if error}<p class="notice" role="alert">{error}</p>{/if}
			<button class="primary" disabled={club.busy}
				>{club.busy ? 'Saving…' : saved ? 'Saved' : 'Save'}</button
			>
			<button type="button" class="text-btn" onclick={signOut}>Sign out</button>
		</form>
	</div>
{/if}

<style>
	/* Profile setting: reduce motion for this member, whatever the device says. */
	:global(:root[data-reduced-motion] *),
	:global(:root[data-reduced-motion] *::before),
	:global(:root[data-reduced-motion] *::after) {
		animation-duration: 0.01ms !important;
		animation-iteration-count: 1 !important;
		transition-duration: 0.01ms !important;
		scroll-behavior: auto !important;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 70;
		background: rgb(2 6 4 / 70%);
		backdrop-filter: blur(4px);
	}
	.sheet {
		position: fixed;
		top: 50%;
		left: 50%;
		z-index: 71;
		display: grid;
		gap: 0.9rem;
		width: min(24rem, calc(100% - 2rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		translate: -50% -50%;
		border: 1px solid rgb(240 209 140 / 18%);
		border-radius: 1.5rem;
		background: #101a16;
		padding: 1.4rem;
		color: #f1ebdc;
		box-shadow: 0 2rem 5rem rgb(0 0 0 / 60%);
	}
	.sheet-body {
		display: grid;
		gap: 0.9rem;
	}
	.close {
		position: absolute;
		top: 0.8rem;
		right: 0.8rem;
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(255 255 255 / 6%);
	}
	.who {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	h2 {
		font-size: 1.25rem;
		font-weight: 700;
	}
	.who p,
	.hint {
		color: rgb(241 235 220 / 65%);
		font-size: 0.85rem;
	}
	.field {
		display: grid;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: rgb(241 235 220 / 75%);
	}
	.field input {
		border: 1px solid rgb(240 209 140 / 25%);
		border-radius: 0.8rem;
		background: rgb(0 0 0 / 30%);
		padding: 0.7rem 0.9rem;
		color: #f1ebdc;
		font-size: 1rem;
	}
	.motion {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.notice {
		color: #ffd9cf;
		font-size: 0.9rem;
	}
	.primary {
		border-radius: 999px;
		background: linear-gradient(#f0d18c, #c9963d);
		padding: 0.8rem 1rem;
		color: #1c1406;
		font-weight: 700;
	}
	.text-btn {
		color: #e2b862;
		font-size: 0.9rem;
	}
	@media (max-width: 639px) {
		.sheet {
			top: auto;
			bottom: 0;
			width: 100%;
			translate: -50% 0;
			border-radius: 1.5rem 1.5rem 0 0;
			padding-bottom: calc(1.4rem + env(safe-area-inset-bottom));
		}
	}
</style>
