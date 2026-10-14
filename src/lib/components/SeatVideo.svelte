<script lang="ts">
	import type { MediaParticipant } from '#lib/media/controller.js';
	import { attachTrack } from '#lib/media/attach.js';
	let {
		participant,
		name,
		local = false
	}: { participant?: MediaParticipant; name: string; local?: boolean } = $props();
</script>

<div
	class="border-primary/20 bg-base-200 relative overflow-hidden rounded-lg border"
	data-testid="seat-video"
	data-player-id={participant?.identity}
>
	{#if participant?.video}
		<video
			class="aspect-video w-full object-contain"
			style:transform={local ? 'scaleX(-1)' : undefined}
			autoplay
			muted
			playsinline
			use:attachTrack={participant.video}
			aria-label={`${name} camera`}
		></video>
	{:else}
		<div class="text-base-content/50 flex aspect-video items-center justify-center text-sm sm:text-base">
			{name} · Camera off
		</div>
	{/if}
	<div class="bg-base-100/90 flex flex-wrap justify-between gap-2 px-2 py-1 text-xs sm:text-sm">
		<span class:text-primary={participant?.speaking}
			>{participant?.speaking ? 'Speaking · ' : ''}{participant?.microphoneOn
				? 'Mic on'
				: 'Mic muted'}</span
		>
		<span
			>{participant?.quality === 'poor' || participant?.quality === 'lost'
				? 'Weak connection · try audio only'
				: ''}</span
		>
	</div>
</div>
