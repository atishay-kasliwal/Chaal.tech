<script lang="ts">
	import { onMount } from 'svelte';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { MediaController, type MediaState } from '#lib/media/controller.js';
	import { attachTrack } from '#lib/media/attach.js';
	import SeatVideo from './SeatVideo.svelte';
	import { Video, VideoOff, Mic, MicOff, PhoneOff, Headphones, Volume2 } from '@lucide/svelte';
	let {
		roomName,
		playerId,
		connected,
		members,
		preview = false,
		compact = false,
		onstate
	}: {
		roomName: string;
		playerId: string;
		connected: boolean;
		members: User[];
		preview?: boolean;
		/** Icon-only controls for the game table's top bar. */
		compact?: boolean;
		onstate: (view: MediaState) => void;
	} = $props();
	let controller: MediaController | undefined;
	let view = $state.raw<MediaState | null>(null);
	const admitted = $derived(members.filter((p) => !p.hasLeft && p.connected));
	onMount(() => {
		controller = new MediaController(roomName, playerId, async () => {
			if (!socket.connected)
				return { ok: false, error: 'Reconnect to the game before joining media.' };
			return socket.socket.timeout(8000).emitWithAck('mediaToken', roomName);
		});
		const unsubscribe = controller.subscribe((next) => {
			view = next;
			onstate(next);
		});
		return () => {
			controller?.disconnect();
			unsubscribe();
		};
	});
	$effect(() => {
		if (!connected || !admitted.some((p) => p.id === playerId)) controller?.disconnect();
	});
</script>

{#if compact}
	<div class="media-compact" data-testid="room-media">
		{#if view?.status === 'connected' || view?.status === 'reconnecting'}
			<button
				class="mc-btn"
				class:off={!view.cameraOn}
				disabled={!connected || view.status !== 'connected' || view.cameraBusy}
				onclick={() => controller?.setDevice('camera', !view?.cameraOn)}
				title={view.cameraOn ? 'Turn camera off' : 'Turn camera on'}
				aria-label={view.cameraOn ? 'Turn camera off' : 'Turn camera on'}
				>{#if view.cameraOn}<Video class="h-4 w-4" />{:else}<VideoOff
						class="h-4 w-4"
					/>{/if}</button
			>
			<button
				class="mc-btn"
				class:off={!view.microphoneOn}
				disabled={!connected || view.status !== 'connected' || view.microphoneBusy}
				onclick={() => controller?.setDevice('microphone', !view?.microphoneOn)}
				title={view.microphoneOn ? 'Mute microphone' : 'Unmute microphone'}
				aria-label={view.microphoneOn ? 'Mute microphone' : 'Unmute microphone'}
				>{#if view.microphoneOn}<Mic class="h-4 w-4" />{:else}<MicOff
						class="h-4 w-4"
					/>{/if}</button
			>
			<button
				class="mc-btn"
				disabled={view.status !== 'connected' || view.cameraBusy || view.microphoneBusy}
				onclick={() => controller?.audioOnly()}
				title="Audio only: saves battery and data"
				aria-label="Audio only"><Headphones class="h-4 w-4" /></button
			>
			<button
				class="mc-btn"
				onclick={() => controller?.disconnect()}
				title="Leave camera and audio"
				aria-label="Leave camera and audio"><PhoneOff class="h-4 w-4" /></button
			>
			{#if view.status === 'reconnecting'}<span class="mc-note">Reconnecting…</span>{/if}
		{:else}
			<button
				class="mc-join"
				disabled={!connected || view?.status === 'connecting'}
				onclick={() => controller?.connect()}
				><Video class="h-4 w-4" />
				<span>{view?.status === 'connecting' ? 'Connecting…' : 'Join video'}</span></button
			>
		{/if}
		{#if view?.audioBlocked}<button class="mc-join" onclick={() => controller?.startAudio()}
				><Volume2 class="h-4 w-4" /> <span>Enable sound</span></button
			>{/if}
		{#each [view?.error, view?.cameraError, view?.microphoneError].filter(Boolean) as message (message)}
			<span class="mc-note" role="status" title={message}>{message}</span>
		{/each}
		{#each view?.participants.filter((p) => p.identity !== playerId && admitted.some((m) => m.id === p.identity) && p.audio) || [] as participant (participant.identity)}
			<audio autoplay use:attachTrack={participant.audio} data-player-audio={participant.identity}
			></audio>
		{/each}
	</div>
{:else}
	<div
		class="room-media-panel mt-1 flex flex-wrap items-center justify-end gap-1.5 px-3 py-1"
		data-testid="room-media"
	>
		<div class="flex w-full flex-wrap items-center justify-end gap-1.5">
			{#if preview}<span class="room-media-title text-base-content/50 mr-auto text-xs"
					>Camera preview</span
				>{/if}
			<span class="room-media-status text-base-content/50 mr-auto text-[0.65rem]" role="status"
				>{view?.status === 'connected'
					? 'Media connected'
					: view?.status === 'reconnecting'
						? 'Media reconnecting…'
						: view?.status === 'connecting'
							? 'Connecting media…'
							: 'Camera and audio off'}</span
			>
			{#if view?.status === 'connected' || view?.status === 'reconnecting'}
				<button
					class="btn btn-xs btn-outline"
					disabled={!connected || view.status !== 'connected' || view.cameraBusy}
					onclick={() => controller?.setDevice('camera', !view?.cameraOn)}
					>{view.cameraOn ? 'Camera off' : 'Camera on'}</button
				>
				<button
					class="btn btn-xs btn-outline"
					disabled={!connected || view.status !== 'connected' || view.microphoneBusy}
					onclick={() => controller?.setDevice('microphone', !view?.microphoneOn)}
					>{view.microphoneOn ? 'Mute mic' : 'Unmute mic'}</button
				>
				<button
					class="btn btn-xs btn-outline"
					disabled={view.status !== 'connected' || view.cameraBusy || view.microphoneBusy}
					onclick={() => controller?.audioOnly()}>Audio only</button
				>
				<button class="btn btn-xs btn-ghost" onclick={() => controller?.disconnect()}
					>Leave media</button
				>
			{:else}
				<button
					class="btn btn-xs btn-outline btn-primary"
					disabled={!connected || view?.status === 'connecting'}
					onclick={() => controller?.connect()}>Join camera/audio</button
				>
			{/if}
			{#if view?.audioBlocked}<button
					class="btn btn-xs btn-primary"
					onclick={() => controller?.startAudio()}>Enable sound</button
				>{/if}
		</div>
		{#each [view?.error, view?.cameraError, view?.microphoneError].filter(Boolean) as message (message)}
			<p class="text-warning mt-2 text-xs" role="status">{message}</p>
		{/each}
		{#if preview && view?.participants.length}
			<div class="mt-2 grid w-full grid-cols-2 gap-2 md:grid-cols-3">
				{#each admitted as member (member.id)}
					<SeatVideo
						participant={view.participants.find((p) => p.identity === member.id)}
						name={member.username}
						playerId={member.id}
						local={member.id === playerId}
					/>
				{/each}
			</div>
		{/if}
		{#each view?.participants.filter((p) => p.identity !== playerId && admitted.some((m) => m.id === p.identity) && p.audio) || [] as participant (participant.identity)}
			<audio autoplay use:attachTrack={participant.audio} data-player-audio={participant.identity}
			></audio>
		{/each}
	</div>
{/if}

<style>
	.media-compact {
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 0.3rem;
	}
	.mc-btn,
	.mc-join {
		display: inline-flex;
		height: 2.1rem;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border: 1px solid rgb(248 242 229 / 14%);
		border-radius: 999px;
		background: rgb(255 255 255 / 5%);
		color: #f8f2e5;
		font-size: 0.8rem;
		font-weight: 650;
		cursor: pointer;
		transition: background 150ms ease;
	}
	.mc-btn {
		width: 2.1rem;
	}
	.mc-join {
		padding-inline: 0.8rem;
		border-color: rgb(242 220 145 / 45%);
		color: #f2dc91;
	}
	.mc-btn:hover:not(:disabled),
	.mc-join:hover:not(:disabled) {
		background: rgb(255 255 255 / 11%);
	}
	.mc-btn.off {
		border-color: rgb(240 113 95 / 45%);
		background: rgb(240 113 95 / 14%);
		color: #ffb3a6;
	}
	.mc-btn:disabled,
	.mc-join:disabled {
		cursor: default;
		opacity: 0.45;
	}
	.mc-note {
		max-width: 12rem;
		overflow: hidden;
		color: #f0cc78;
		font-size: 0.7rem;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 639px) {
		.mc-join span {
			display: none;
		}
		.mc-join {
			width: 2.1rem;
			padding: 0;
		}
		.mc-note {
			display: none;
		}
	}
</style>
