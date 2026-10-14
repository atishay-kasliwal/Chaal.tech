<script lang="ts">
	import { Mic, MicOff, SignalLow, VideoOff } from '@lucide/svelte';
	import type { MediaParticipant } from '#lib/media/controller.js';
	import { attachTrack } from '#lib/media/attach.js';
	let {
		participant,
		name,
		local = false
	}: { participant?: MediaParticipant; name: string; local?: boolean } = $props();
	let initials = $derived(
		name
			.trim()
			.split(' ')
			.filter(Boolean)
			.slice(0, 2)
			.map((part) => part[0] ?? '')
			.join('')
			.toUpperCase()
	);
</script>

<div
	class="seat-video relative isolate overflow-hidden rounded-xl"
	data-testid="seat-video"
	data-player-id={participant?.identity}
	aria-label={name + ' video seat'}
>
	{#if participant?.video}
		<video
			class="h-full w-full object-cover"
			style:transform={local ? 'scaleX(-1)' : undefined}
			autoplay
			muted
			playsinline
			use:attachTrack={participant.video}
			aria-label={name + ' camera'}
		></video>
	{:else}
		<div class="camera-placeholder flex h-full w-full flex-col items-center justify-center">
			<span class="camera-initials" aria-hidden="true">{initials}</span>
			<span class="camera-off-label"><VideoOff class="h-3.5 w-3.5" /> Camera off</span>
		</div>
	{/if}
	<div class="seat-video-status absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
		<span class="mic-state" class:speaking={participant?.speaking}>
			{#if participant?.microphoneOn}<Mic class="h-3.5 w-3.5" />{:else}<MicOff class="h-3.5 w-3.5" />{/if}
			{participant?.speaking ? 'Speaking' : participant?.microphoneOn ? 'Mic on' : 'Muted'}
		</span>
		{#if participant?.quality === 'poor' || participant?.quality === 'lost'}
			<span class="connection-state"><SignalLow class="h-3.5 w-3.5" /> Weak connection</span>
		{/if}
	</div>
</div>

<style>
	.seat-video {
		aspect-ratio: 16 / 9;
		background: #111a17;
	}
	.camera-placeholder {
		background:
			radial-gradient(ellipse at 50% 32%, rgb(59 87 68 / 58%), transparent 52%),
			linear-gradient(145deg, #17231d, #0c1411);
		color: rgb(243 238 225 / 66%);
	}
	.camera-initials {
		display: grid;
		width: clamp(2.2rem, 4vw, 3.4rem);
		aspect-ratio: 1;
		place-items: center;
		border-radius: 999px;
		background: rgb(227 184 88 / 14%);
		color: #f0d18c;
		font-size: clamp(0.9rem, 1.7vw, 1.3rem);
		font-weight: 700;
		letter-spacing: 0.04em;
	}
	.camera-off-label,
	.mic-state,
	.connection-state {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
	}
	.camera-off-label {
		margin-top: 0.4rem;
		font-size: 0.72rem;
	}
	.seat-video-status {
		pointer-events: none;
		font-size: 0.64rem;
	}
	.mic-state,
	.connection-state {
		border-radius: 999px;
		background: rgb(5 10 8 / 68%);
		padding: 0.22rem 0.45rem;
		color: rgb(245 241 230 / 82%);
		backdrop-filter: blur(8px);
	}
	.mic-state.speaking {
		color: #f5d586;
	}
	@media (min-width: 1100px) and (max-height: 800px) {
		.seat-video {
			aspect-ratio: 2.45 / 1;
		}
	}
	@media (max-width: 1099px) {
		.seat-video {
			aspect-ratio: 1.8 / 1;
		}
		.seat-video-status {
			inset-inline: 0.25rem;
			bottom: 0.25rem;
			font-size: 0.5rem;
		}
		.mic-state,
		.connection-state {
			gap: 0.15rem;
			padding: 0.1rem 0.25rem;
		}
	}
	@media (max-width: 639px) {
		.seat-video {
			aspect-ratio: 1.55 / 1;
		}
		.camera-off-label {
			gap: 0.15rem;
			margin-top: 0.15rem;
			font-size: 0.48rem;
		}
		.camera-off-label :global(svg) {
			width: 0.65rem;
			height: 0.65rem;
		}
		.seat-video-status {
			display: none;
		}
	}
	@media (max-width: 959px) and (max-height: 500px) {
		.seat-video {
			aspect-ratio: 2.6 / 1;
		}
		.seat-video-status {
			display: none;
		}
	}
</style>
