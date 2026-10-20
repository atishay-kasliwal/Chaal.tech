<script lang="ts">
	import { dialogFocus } from '#lib/components/dialog-focus.js';
	import { properName } from '#lib/names.js';
	import { untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { X } from '@lucide/svelte';
	import { goto } from '$app/navigation';
	import { club } from './club.svelte.js';
	import CharacterPicker from './CharacterPicker.svelte';
	import CharacterAvatar from './CharacterAvatar.svelte';
	import { openProfilePhoto, cropProfilePhoto } from './profile-photo.js';
	import { profileModal } from './profile-modal.svelte.js';

	let nickname = $state('');
	let characterId = $state('');
	let reducedMotion = $state(false);
	let error = $state('');
	let saved = $state(false);
	let photoDataUrl = $state<string | null>(null);
	let bitmap = $state.raw<ImageBitmap | null>(null);
	let canvas = $state<HTMLCanvasElement>();
	let zoom = $state(1);
	let cropX = $state(0);
	let cropY = $state(0);
	let processing = $state(false);
	let selection = 0;
	$effect(() => {
		const current = bitmap;
		return () => current?.close();
	});
	$effect(() => {
		if (bitmap && canvas) {
			try {
				photoDataUrl = cropProfilePhoto(canvas, bitmap, zoom, cropX, cropY);
			} catch (failure) {
				error = failure instanceof Error ? failure.message : 'Could not crop this photo.';
			}
		}
	});
	async function selectPhoto(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const request = ++selection;
		processing = true;
		error = '';
		saved = false;
		try {
			const image = await openProfilePhoto(file);
			if (request !== selection || !profileModal.open) {
				image.close();
				return;
			}
			zoom = 1;
			cropX = cropY = 0;
			bitmap = image;
		} catch (failure) {
			if (request === selection)
				error = failure instanceof Error ? failure.message : 'Could not open this photo.';
		} finally {
			if (request === selection) processing = false;
		}
	}
	function removePhoto() {
		selection++;
		processing = false;
		bitmap = null;
		photoDataUrl = null;
		saved = false;
	}

	$effect(() => {
		const open = profileModal.open;
		untrack(() => {
			if (open && club.member) {
				bitmap = null;
				photoDataUrl = club.member.photoDataUrl ?? null;
				nickname = club.member.nickname;
				characterId = club.member.characterId;
				reducedMotion = club.member.reducedMotion;
				error = '';
				saved = false;
			} else {
				selection++;
				bitmap = null;
				processing = false;
			}
		});
	});

	async function save(event: SubmitEvent) {
		event.preventDefault();
		error = (await club.save({ nickname, characterId, reducedMotion, photoDataUrl })) ?? '';
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
		use:dialogFocus
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
				<CharacterAvatar {characterId} {photoDataUrl} size={64} />
				<div>
					<h2>{properName(club.member.nickname)}</h2>
					<p>{club.member.role === 'owner' ? 'Club owner' : 'Club member'}</p>
				</div>
			</div>
			<label class="field">
				<span>Nickname</span>
				<input bind:value={nickname} maxlength="24" required autocomplete="nickname" />
			</label>
			<div class="photo-controls">
				<label class="upload-photo"
					>{processing ? 'Opening photo…' : 'Upload a photo'}<input
						type="file"
						accept="image/jpeg,image/png,image/webp"
						onchange={selectPhoto}
						disabled={processing || club.busy}
					/></label
				>
				<p class="hint">JPEG, PNG or WebP · up to 5 MB. Your photo is saved when you press Save.</p>
				{#if bitmap}
					<canvas bind:this={canvas} class="crop-preview" aria-label="Photo crop preview"></canvas>
					<label class="field"
						>Zoom<input type="range" min="1" max="3" step="0.05" bind:value={zoom} /></label
					>
					<label class="field"
						>Move horizontally<input
							type="range"
							min="-1"
							max="1"
							step="0.02"
							bind:value={cropX}
						/></label
					>
					<label class="field"
						>Move vertically<input
							type="range"
							min="-1"
							max="1"
							step="0.02"
							bind:value={cropY}
						/></label
					>
				{/if}
				{#if photoDataUrl}<button type="button" class="text-btn" onclick={removePhoto}
						>Remove photo · use character</button
					>{/if}
			</div>
			<p class="hint">
				{photoDataUrl
					? 'Your character stays as a backup. Remove the photo to use it.'
					: 'Or choose a character.'}
			</p>
			<CharacterPicker bind:value={characterId} />
			<label class="motion">
				<input type="checkbox" class="toggle toggle-sm" bind:checked={reducedMotion} />
				<span>Reduce motion</span>
			</label>
			<p class="hint">Name changes show at your next table join.</p>
			{#if error}<p class="notice" role="alert">{error}</p>{/if}
			<button class="primary" disabled={club.busy || processing}
				>{club.busy ? 'Saving…' : saved ? 'Saved' : 'Save'}</button
			>
			<button type="button" class="text-btn" onclick={signOut}>Sign out</button>
		</form>
	</div>
{/if}

<style>
	.photo-controls {
		display: grid;
		gap: 0.6rem;
	}
	.upload-photo {
		display: grid;
		gap: 0.5rem;
		font-weight: 600;
	}
	.upload-photo input {
		max-width: 100%;
		font-size: 0.85rem;
	}
	.crop-preview {
		width: 144px;
		height: 144px;
		border-radius: 50%;
		margin-inline: auto;
	}
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
		border: 1px solid rgb(242 220 145 / 18%);
		border-radius: 1.5rem;
		background: #2c263b;
		padding: 1.4rem;
		color: #f8f2e5;
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
		color: rgb(248 242 229 / 65%);
		font-size: 0.85rem;
	}
	.field {
		display: grid;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: rgb(248 242 229 / 75%);
	}
	.field input {
		border: 1px solid rgb(242 220 145 / 25%);
		border-radius: 0.8rem;
		background: rgb(0 0 0 / 30%);
		padding: 0.7rem 0.9rem;
		color: #f8f2e5;
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
		background: linear-gradient(#f2dc91, #f2dc91);
		padding: 0.8rem 1rem;
		color: #211c2e;
		font-weight: 700;
	}
	.text-btn {
		color: #f2dc91;
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
