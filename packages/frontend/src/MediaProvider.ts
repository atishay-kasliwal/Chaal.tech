import { Room, RoomEvent, LocalParticipant, RemoteParticipant, Track } from 'livekit-client';

// MediaProvider interface
export interface MediaProvider {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  publish: (mediaStream: MediaStream) => Promise<void>;
  subscribe: (track: Track) => Promise<void>;
  on: (event: RoomEvent, listener: (arg: any) => void) => void;
  off: (event: RoomEvent, listener: (arg: any) => void) => void;
  getLocalParticipant: () => LocalParticipant | undefined;
  getRemoteParticipants: () => RemoteParticipant[];
}

// LiveKitMediaProvider implements MediaProvider using livekit-client
export class LiveKitMediaProvider implements MediaProvider {
  private room: Room | null = null;
  private listeners: Map<RoomEvent, Set<(arg: any) => void>> = new Map();

  async connect(url: string, token: string): Promise<void> {
    this.room = new Room();
    this.room.on(RoomEvent.Connected, () => this.emit(RoomEvent.Connected));
    this.room.on(RoomEvent.Disconnected, (reason) => this.emit(RoomEvent.Disconnected, reason));
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) =>
      this.emit(RoomEvent.TrackSubscribed, { track, publication, participant }));
    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) =>
      this.emit(RoomEvent.TrackUnsubscribed, { track, publication, participant }));
    this.room.on(RoomEvent.ParticipantConnected, (participant) =>
      this.emit(RoomEvent.ParticipantConnected, participant));
    this.room.on(RoomEvent.ParticipantDisconnected, (participant) =>
      this.emit(RoomEvent.ParticipantDisconnected, participant));

    await this.room.connect(url, token);
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }
  }

  async publish(mediaStream: MediaStream): Promise<void> {
    if (!this.room) throw new Error('Not connected to room');
    await this.room.localParticipant.publishTrack(mediaStream);
  }

  async subscribe(track: Track): Promise<void> {
    // Subscription is handled automatically by the room when TrackSubscribed event fires
    // We can also manually subscribe if needed
    if (!this.room) throw new Error('Not connected to room');
    // The room automatically subscribes to published tracks; we can also explicitly subscribe
    // For simplicity, we rely on automatic subscription
  }

  on(event: RoomEvent, listener: (arg: any) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(listener);
  }

  off(event: RoomEvent, listener: (arg: any) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: RoomEvent, arg: any): void {
    this.listeners.get(event)?.forEach(listener => listener(arg));
  }

  getLocalParticipant(): LocalParticipant | undefined {
    return this.room?.localParticipant;
  }

  getRemoteParticipants(): RemoteParticipant[] {
    return this.room ? Array.from(this.room.remoteParticipants.values()) : [];
  }
}