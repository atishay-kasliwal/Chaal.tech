<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import { club } from './club.svelte.js';
	import GoogleButton from './GoogleButton.svelte';
	import CharacterAvatar from './CharacterAvatar.svelte';
	import CharacterPicker from './CharacterPicker.svelte';

	/**
	 * Members-only content. Shows sign-in when needed, a one-time welcome for a new friend,
	 * and otherwise just the content, with the same URL throughout.
	 */
	let {
		children,
		invited = false,
		heading = 'h1'
	}: { children: Snippet; invited?: boolean; heading?: 'h1' | 'h2' } = $props();

	let nickname = $state('');
	let characterId = $state('');
	let choosing = $state(false);
	let error = $state('');

	onMount(() => club.start());

	$effect(() => {
		if (club.member && !club.member.onboarded && !nickname) {
			nickname = club.member.nickname;
			characterId = club.member.characterId;
		}
	});

	async function join(event: SubmitEvent) {
		event.preventDefault();
		error = (await club.save({ nickname, characterId }, true)) ?? '';
	}
</script>

{#if club.status === 'loading'}
	<div class="gate" aria-busy="true">
		<svelte:element this={heading} class="sr-only">Your private club</svelte:element>
		<p class="muted">Opening the club…</p>
	</div>
{:else if club.status === 'signedOut'}
	<section class="gate" aria-labelledby="club-sign-in">
		<span class="suits" aria-hidden="true">♠ ♥ ♦ ♣</span>
		<svelte:element this={heading} id="club-sign-in"
			>{invited ? 'Your seat is waiting' : 'Your people are here.'}</svelte:element
		>
		<p class="muted">
			Chaal is a private table for friends. Sign in with the Google account you were invited with.
		</p>
		{#if club.notice}<p class="notice" role="alert">{club.notice}</p>{/if}
		<GoogleButton />
		{#if club.busy}<p class="muted" role="status">Checking the guest list…</p>{/if}
	</section>
{:else if club.member && !club.member.onboarded}
	<form class="gate" onsubmit={join} aria-labelledby="club-welcome">
		<CharacterAvatar
			photoDataUrl={club.member?.photoDataUrl}
			{characterId}
			size={96}
			label="Your character"
		/>
		<svelte:element this={heading} id="club-welcome">Welcome to the club</svelte:element>
		<p class="muted">This is you at the table. Change it now or any time later.</p>
		<label class="field">
			<span>Nickname</span>
			<input bind:value={nickname} maxlength="24" required autocomplete="nickname" />
		</label>
		{#if choosing}
			<CharacterPicker bind:value={characterId} />
		{:else}
			<button type="button" class="text-btn" onclick={() => (choosing = true)}
				>Choose a different character</button
			>
		{/if}
		{#if error}<p class="notice" role="alert">{error}</p>{/if}
		<button class="primary" disabled={club.busy || !nickname.trim()}
			>{club.busy ? 'Saving…' : 'Join the club'}</button
		>
	</form>
{:else}
	{@render children()}
{/if}

<style>
	.gate {
		display: grid;
		justify-items: center;
		gap: 0.9rem;
		margin: 0 auto;
		max-width: 24rem;
		padding: 1.5rem 0.5rem;
		text-align: center;
		color: #f8f2e5;
	}
	.suits {
		color: #f2dc91;
		letter-spacing: 0.4em;
	}
	h1,
	h2 {
		font-size: 1.6rem;
		font-weight: 700;
	}
	.muted {
		color: rgb(248 242 229 / 70%);
	}
	.notice {
		border: 1px solid rgb(240 140 120 / 40%);
		border-radius: 0.8rem;
		background: rgb(120 30 20 / 25%);
		padding: 0.6rem 0.8rem;
		color: #ffd9cf;
		font-size: 0.9rem;
	}
	.field {
		display: grid;
		width: 100%;
		gap: 0.35rem;
		text-align: left;
		font-size: 0.85rem;
		color: rgb(248 242 229 / 75%);
	}
	.field input {
		border: 1px solid rgb(242 220 145 / 25%);
		border-radius: 0.8rem;
		background: rgb(0 0 0 / 30%);
		padding: 0.75rem 0.9rem;
		color: #f8f2e5;
		font-size: 1rem;
	}
	.text-btn {
		color: #f2dc91;
		font-size: 0.9rem;
		text-decoration: underline;
	}
	.primary {
		width: 100%;
		border-radius: 999px;
		background: linear-gradient(#f2dc91, #f2dc91);
		padding: 0.85rem 1rem;
		color: #211c2e;
		font-weight: 700;
	}
	.primary:disabled {
		opacity: 0.6;
	}

	.gate {
		margin: 56px auto;
		max-width: 440px;
		min-height: 330px;
		align-content: center;
		padding: 36px 28px;
		border: 1px solid var(--line);
		border-radius: 18px;
		background: var(--surface);
		gap: 20px;
	}
	.suits {
		color: var(--butter);
		font-size: 23px;
		letter-spacing: 0.24em;
		margin-bottom: 4px;
	}
	h1,
	h2 {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 40px;
		line-height: 1;
		letter-spacing: -0.05em;
	}
	.muted {
		font-size: 15px;
		line-height: 1.7;
		color: var(--muted);
	}
	.primary {
		min-height: 48px;
		transition: translate 0.2s;
	}
	.primary:hover:not(:disabled) {
		translate: 0 -2px;
	}
	@media (max-width: 600px) {
		.gate {
			margin: 32px auto;
			padding: 30px 22px;
			min-height: 340px;
			width: 100%;
		}
		h1,
		h2 {
			font-size: 34px;
		}
		.muted {
			font-size: 14px;
		}
	}
</style>
