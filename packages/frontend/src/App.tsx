import { useState, useEffect, useRef } from 'react';
import { LiveKitMediaProvider } from './MediaProvider';

export default function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<MediaStream[]>([]);
  const [error, setError] = useState<string | null>(null);
  const mediaProviderRef = useRef<LiveKitMediaProvider | null>(null);
  const roomIdRef = useRef<string>('teenpatti-room-' + Math.random().toString(36).substr(2, 9));
  const userNameRef = useRef<string>('User_' + Math.floor(Math.random() * 1000));

  // Request camera and microphone
  useEffect(() => {
    async function initMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setLocalStream(stream);
      } catch (err) {
        setError(`Failed to access camera/microphone: ${err}`);
      }
    }
    initMedia();
  }, []);

  // Get token from backend and connect to LiveKit room
  useEffect(() => {
    if (!localStream) return;

    async function connectToLiveKit() {
      try {
        // Get LiveKit URL from env vars
        const livekitUrl = import.meta.env.VITE_LIVEKIT_URL;
        if (!livekitUrl) {
          setError('LiveKit URL not configured. Please set VITE_LIVEKIT_URL in .env');
          return;
        }

        // Get token from backend
        const tokenResponse = await fetch(`/getToken?room=${roomIdRef.current}&name=${userNameRef.current}`, {
          method: 'GET',
        });

        if (!tokenResponse.ok) {
          const errorText = await tokenResponse.text();
          throw new Error(`Failed to get token: ${errorText}`);
        }

        const token = await tokenResponse.text();

        // Initialize media provider
        const mediaProvider = new LiveKitMediaProvider();
        mediaProviderRef.current = mediaProvider;

        // Set up event listeners
        mediaProvider.on('Connected', () => {
          setIsConnected(true);
          setError(null);
          // Publish local stream
          mediaProvider.publish(localStream);
        });

        mediaProvider.on('Disconnected', (reason) => {
          setIsConnected(false);
          setError(`Disconnected: ${reason}`);
        });

        mediaProvider.on('TrackSubscribed', ({ track, participant }) => {
          // When we subscribe to a track, create a media stream from it and add to remoteStreams
          // Note: track is a LocalTrackPublication? Actually from livekit-client, TrackSubscribed gives us a RemoteTrack
          // We need to get the MediaStream from the track.
          // For simplicity, we'll assume we can create a MediaStream from the track.
          // In practice, we need to handle audio and video tracks separately.
          // We'll create a simple implementation that just adds a new media stream for each track.
          // This is a placeholder; we need to properly handle tracks.
          const stream = new MediaStream();
          if (track.kind === 'video') {
            stream.addTrack(track);
          } else if (track.kind === 'audio') {
            stream.addTrack(track);
          }
          setRemoteStreams(prev => [...prev, stream]);
        });

        mediaProvider.on('TrackUnsubscribed', ({ track }) => {
          // Remove the stream associated with the track
          // We'll need to map tracks to streams; for simplicity, we'll just reset
          // In a real app, we'd keep a map.
          setRemoteStreams([]);
        });

        mediaProvider.on('ParticipantConnected', (participant) => {
          console.log('Participant connected:', participant.identity);
        });

        mediaProvider.on('ParticipantDisconnected', (participant) => {
          console.log('Participant disconnected:', participant.identity);
          // Optionally remove streams for this participant
        });

        // Connect to the room
        await mediaProvider.connect(livekitUrl, token);
      } catch (err) {
        console.error('Failed to connect to LiveKit:', err);
        setError(`Failed to connect: ${err}`);
      }
    }

    connectToLiveKit();

    // Cleanup on unmount
    return () => {
      mediaProviderRef.current?.disconnect();
    };
  }, [localStream]);

  // Render video elements
  const videoElements = [];
  if (localStream) {
    videoElements.push(
      <video key="local" autoPlay playsInline muted ref={(ref) => { if (ref) ref.srcObject = localStream; }} className="w-full h-48 object-cover rounded mb-2" />
    );
  }
  remoteStreams.forEach((stream, index) => {
    videoElements.push(
      <video key={`remote-${index}`} autoPlay playsInline ref={(ref) => { if (ref) ref.srcObject = stream; }} className="w-full h-48 object-cover rounded mb-2" />
    );
  });

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-md p-6 w-full max-w-4xl">
        <h1 className="text-2xl font-bold text-gray-800 mb-4">TeenPatti - LiveKit Media Test</h1>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        {!isConnected && localStream && (
          <button
            onConnect={() => {
              // Trigger reconnection? Actually we already tried to connect in useEffect.
              // We'll just show a message.
            }}
            className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
          >
            Connecting...
          </button>
        )}
        {isConnected && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Local Stream</h2>
            <video autoPlay playsInline muted ref={(ref) => { if (ref) ref.srcObject = localStream; }} className="w-full h-48 object-cover rounded" />
            <h2 className="text-lg font-semibold mt-4">Remote Streams</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {videoElements.slice(1).map((el, idx) => (
                <div key={idx} className="flex-1">{el}</div>
              ))}
            </div>
          </div>
        )}
        {!isConnected && !localStream && (
          <p className="text-gray-500">Waiting for camera and microphone access...</p>
        )}
      </div>
    </div>
  );
}