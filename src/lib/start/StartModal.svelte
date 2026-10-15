<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { X } from '@lucide/svelte';
	import StartPanel from './StartPanel.svelte';
	import { startModal, closeStart } from './start-modal.svelte.js';
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && startModal.open && closeStart()} />

{#if startModal.open}
	<div
		class="scrim"
		onclick={closeStart}
		aria-hidden="true"
		transition:fade={{ duration: 160 }}
	></div>
	<div
		class="sheet"
		role="dialog"
		aria-modal="true"
		aria-label="Start or join a table"
		tabindex="-1"
		transition:fly={{ y: 24, duration: 220 }}
	>
		<button class="close" onclick={closeStart} aria-label="Close"><X class="h-4 w-4" /></button>
		<StartPanel onclose={closeStart} />
	</div>
{/if}

<style>
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
		width: min(26rem, calc(100% - 2rem));
		max-height: calc(100dvh - 2rem);
		overflow-y: auto;
		translate: -50% -50%;
		border: 1px solid rgb(240 209 140 / 18%);
		border-radius: 1.5rem;
		background: radial-gradient(ellipse at 50% 0%, rgb(226 184 98 / 12%), transparent 60%), #101a16;
		padding: 1.6rem 1.4rem 1.3rem;
		box-shadow: 0 2rem 5rem rgb(0 0 0 / 60%);
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
		color: #f1ebdc;
		cursor: pointer;
	}
	@media (max-width: 639px) {
		/* Phones: a bottom sheet, thumb-friendly. */
		.sheet {
			top: auto;
			bottom: 0;
			width: 100%;
			translate: -50% 0;
			border-radius: 1.5rem 1.5rem 0 0;
			padding-bottom: calc(1.3rem + env(safe-area-inset-bottom));
		}
	}
</style>
