import type { Room, Track } from 'livekit-client';

type SDK = typeof import('livekit-client');
export interface MediaParticipant {
	identity: string;
	video?: Track;
	audio?: Track;
	microphoneOn: boolean;
	speaking: boolean;
	quality: string;
}
export interface MediaState {
	status: 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error';
	error: string;
	cameraError: string;
	microphoneError: string;
	cameraOn: boolean;
	microphoneOn: boolean;
	cameraBusy: boolean;
	microphoneBusy: boolean;
	audioBlocked: boolean;
	participants: MediaParticipant[];
}
interface Credentials {
	ok: boolean;
	error?: string;
	url?: string;
	token?: string;
	identity?: string;
	roomName?: string;
}
const initial = (): MediaState => ({
	status: 'off',
	error: '',
	cameraError: '',
	microphoneError: '',
	cameraOn: false,
	microphoneOn: false,
	cameraBusy: false,
	microphoneBusy: false,
	audioBlocked: false,
	participants: []
});

// Independent of game state. Only room/player identity and a credential request cross the boundary.
export class MediaController {
	state = initial();
	private room: Room | null = null;
	private sdk: SDK | null = null;
	private epoch = 0;
	private listeners = new Set<(state: MediaState) => void>();
	private readonly authorize: () => Promise<Credentials>;
	private readonly load: () => Promise<SDK>;
	private readonly identity: string;
	private readonly roomName: string;
	constructor(
		roomName: string,
		identity: string,
		authorize: () => Promise<Credentials>,
		load = () => import('livekit-client')
	) {
		this.roomName = roomName;
		this.identity = identity;
		this.authorize = authorize;
		this.load = load;
	}
	subscribe(listener: (state: MediaState) => void) {
		this.listeners.add(listener);
		listener(this.state);
		return () => {
			this.listeners.delete(listener);
		};
	}
	private update(patch: Partial<MediaState> = {}) {
		const room = this.room,
			sdk = this.sdk;
		const participants: MediaParticipant[] =
			room && sdk
				? [room.localParticipant, ...room.remoteParticipants.values()].map((p) => {
						const video = p.getTrackPublication(sdk.Track.Source.Camera),
							audio = p.getTrackPublication(sdk.Track.Source.Microphone);
						return {
							identity: p.identity,
							video: video?.isMuted ? undefined : video?.track,
							audio: p === room.localParticipant || audio?.isMuted ? undefined : audio?.track,
							microphoneOn: !!audio && !audio.isMuted,
							speaking: p.isSpeaking,
							quality: p.connectionQuality
						};
					})
				: [];
		this.state = {
			...this.state,
			participants,
			cameraOn: !!room?.localParticipant.isCameraEnabled,
			microphoneOn: !!room?.localParticipant.isMicrophoneEnabled,
			audioBlocked: !!room && !room.canPlaybackAudio,
			...patch
		};
		for (const listener of this.listeners) listener(this.state);
	}
	async connect() {
		if (['connecting', 'connected', 'reconnecting'].includes(this.state.status)) return;
		const epoch = ++this.epoch;
		this.update({ status: 'connecting', error: '', cameraError: '', microphoneError: '' });
		let candidate: Room | undefined;
		try {
			const credentials = await this.authorize();
			if (epoch !== this.epoch) return;
			if (!credentials.ok)
				throw new Error(credentials.error || 'Media is unavailable. You can keep playing.');
			if (
				credentials.identity !== this.identity ||
				credentials.roomName !== this.roomName ||
				!credentials.url ||
				!credentials.token
			)
				throw new Error('Media identity did not match your seat.');
			const sdk = await this.load();
			if (epoch !== this.epoch) return;
			this.sdk = sdk;
			const room = new sdk.Room({
				adaptiveStream: true,
				dynacast: true,
				videoCaptureDefaults: { resolution: { width: 320, height: 180, frameRate: 15 } },
				audioCaptureDefaults: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				},
				publishDefaults: {
					videoCodec: 'vp8',
					videoEncoding: { maxBitrate: 180000, maxFramerate: 15 },
					simulcast: true
				},
				stopLocalTrackOnUnpublish: true
			});
			candidate = room;
			this.room = room;
			const refresh = () => {
				if (this.room === room) this.update();
			};
			for (const event of [
				sdk.RoomEvent.ParticipantConnected,
				sdk.RoomEvent.ParticipantDisconnected,
				sdk.RoomEvent.TrackSubscribed,
				sdk.RoomEvent.TrackUnsubscribed,
				sdk.RoomEvent.TrackMuted,
				sdk.RoomEvent.TrackUnmuted,
				sdk.RoomEvent.LocalTrackPublished,
				sdk.RoomEvent.LocalTrackUnpublished,
				sdk.RoomEvent.ConnectionQualityChanged,
				sdk.RoomEvent.ActiveSpeakersChanged,
				sdk.RoomEvent.AudioPlaybackStatusChanged,
				sdk.RoomEvent.TrackStreamStateChanged
			])
				room.on(event, refresh);
			room.on(sdk.RoomEvent.Reconnecting, () => {
				if (this.room === room) this.update({ status: 'reconnecting' });
			});
			room.on(sdk.RoomEvent.Reconnected, () => {
				if (this.room === room) this.update({ status: 'connected' });
			});
			room.on(sdk.RoomEvent.Disconnected, () => {
				if (this.room !== room) return;
				this.disconnect();
				this.update({
					status: 'error',
					error: 'Media disconnected. Reconnect when ready; the game continues.'
				});
			});
			await room.connect(credentials.url, credentials.token, { autoSubscribe: true });
			if (epoch !== this.epoch) {
				await room.disconnect(true);
				return;
			}
			this.update({ status: 'connected' });
		} catch (error) {
			if (epoch !== this.epoch) {
				void candidate?.disconnect(true);
				return;
			}
			this.disconnect();
			this.update({
				status: 'error',
				error:
					error instanceof Error ? error.message : 'Could not connect media. You can keep playing.'
			});
		}
	}
	async setDevice(kind: 'camera' | 'microphone', enabled: boolean) {
		const room = this.room,
			epoch = this.epoch;
		if (!room || this.state.status !== 'connected' || this.state[`${kind}Busy`]) return;
		this.update(
			kind === 'camera'
				? { cameraBusy: true, cameraError: '' }
				: { microphoneBusy: true, microphoneError: '' }
		);
		try {
			const publication =
				kind === 'camera'
					? await room.localParticipant.setCameraEnabled(enabled)
					: await room.localParticipant.setMicrophoneEnabled(enabled);
			if (epoch !== this.epoch) {
				publication?.track?.stop();
				return;
			}
			this.update();
		} catch (error) {
			if (epoch !== this.epoch) return;
			const name = error instanceof Error ? error.name : '';
			const reason =
				name === 'NotAllowedError' || name === 'PermissionDeniedError'
					? 'Permission denied'
					: name === 'NotFoundError'
						? 'No device found'
						: 'Device unavailable';
			const message = `${kind === 'camera' ? 'Camera' : 'Microphone'}: ${reason}. Other media and the game can continue.`;
			this.update(kind === 'camera' ? { cameraError: message } : { microphoneError: message });
		} finally {
			if (epoch === this.epoch)
				this.update(kind === 'camera' ? { cameraBusy: false } : { microphoneBusy: false });
		}
	}
	async audioOnly() {
		await this.setDevice('camera', false);
		await this.setDevice('microphone', true);
	}
	async startAudio() {
		try {
			await this.room?.startAudio();
			this.update();
		} catch {
			this.update({ audioBlocked: true });
		}
	}
	disconnect() {
		++this.epoch;
		const room = this.room;
		this.room = null;
		if (room) {
			room.removeAllListeners();
			for (const pub of room.localParticipant.trackPublications.values()) pub.track?.stop();
			void room.disconnect(true).catch(() => {});
		}
		this.state = initial();
		this.update();
	}
}
