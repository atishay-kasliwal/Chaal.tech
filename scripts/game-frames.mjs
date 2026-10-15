/** Observe recipient-specific room snapshots from the app's current JSON WebSocket protocol. */
export function watchRoomData(socket, onRoomData) {
	socket.on('framereceived', (frame) => {
		try {
			const payload = typeof frame.payload === 'string'
				? frame.payload
				: Buffer.from(frame.payload).toString('utf8');
			const packet = JSON.parse(payload);
			if (packet?.type === 'event' && packet.event === 'roomData' && packet.args?.[0])
				onRoomData(packet.args[0]);
		} catch {
			// Ignore protocol control frames and non-JSON payloads.
		}
	});
}
