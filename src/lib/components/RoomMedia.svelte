<script lang="ts">
	import { onMount } from 'svelte';
	import { socket } from '#lib/stores/socket-store.svelte.js';
	import { MediaController, type MediaState } from '#lib/media/controller.js';
	import { attachTrack } from '#lib/media/attach.js';
	import SeatVideo from './SeatVideo.svelte';
	let {
		roomName,
		playerId,
		connected,
		members,
		preview = false,
		onstate
	}: {
		roomName: string;
		playerId: string;
		connected: boolean;
		members: User[];
		preview?: boolean;
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

<div
	class="room-media-panel border-primary/20 bg-base-100 rounded-box mt-4 border p-3"
	data-testid="room-media"
>
	<div class="flex flex-wrap items-center gap-2">
		<span class="room-media-title text-primary mr-auto text-sm font-semibold"
			>Friends at the table</span
		>
		<span class="room-media-status text-base-content/60 text-xs" role="status"
			>{view?.status === 'connected'
				? 'Media connected'
				: view?.status === 'reconnecting'
					? 'Media reconnecting…'
					: view?.status === 'connecting'
						? 'Connecting media…'
						: 'Camera and audio optional'}</span
		>
		{#if view?.status === 'connected' || view?.status === 'reconnecting'}
			<button
				class="btn btn-sm btn-outline"
				disabled={!connected || view.status !== 'connected' || view.cameraBusy}
				onclick={() => controller?.setDevice('camera', !view?.cameraOn)}
				>{view.cameraOn ? 'Camera off' : 'Camera on'}</button
			>
			<button
				class="btn btn-sm btn-outline"
				disabled={!connected || view.status !== 'connected' || view.microphoneBusy}
				onclick={() => controller?.setDevice('microphone', !view?.microphoneOn)}
				>{view.microphoneOn ? 'Mute mic' : 'Unmute mic'}</button
			>
			<button
				class="btn btn-sm btn-outline"
				disabled={view.status !== 'connected' || view.cameraBusy || view.microphoneBusy}
				onclick={() => controller?.audioOnly()}>Audio only</button
			>
			<button class="btn btn-sm btn-ghost" onclick={() => controller?.disconnect()}
				>Leave media</button
			>
		{:else}
			<button
				class="btn btn-sm btn-outline btn-primary"
				disabled={!connected || view?.status === 'connecting'}
				onclick={() => controller?.connect()}>Join camera/audio</button
			>
		{/if}
		{#if view?.audioBlocked}<button
				class="btn btn-sm btn-primary"
				onclick={() => controller?.startAudio()}>Enable sound</button
			>{/if}
	</div>
	{#each [view?.error, view?.cameraError, view?.microphoneError].filter(Boolean) as message (message)}
		<p class="text-warning mt-2 text-xs" role="status">{message}</p>
	{/each}
	{#if preview && view?.participants.length}
		<div class="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
			{#each admitted as member (member.id)}
				<SeatVideo
					participant={view.participants.find((p) => p.identity === member.id)}
					name={member.username}
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
