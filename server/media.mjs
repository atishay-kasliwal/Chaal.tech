import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';

// Media has no access to cards, chips, turns or rule evaluation.
export function createMediaService({ url, apiKey, apiSecret, revokeTokens = false } = {}, client) {
	if (!url && !apiKey && !apiSecret) return null;
	if (!url || !apiKey || !apiSecret) throw new Error('Configure all three LIVEKIT settings');
	if (typeof revokeTokens !== 'boolean')
		throw new Error('LIVEKIT_REVOKE_TOKENS must be true or false');
	const endpoint = new URL(url);
	if (
		!['ws:', 'wss:'].includes(endpoint.protocol) ||
		endpoint.username ||
		endpoint.password ||
		endpoint.search ||
		endpoint.hash
	)
		throw new Error('LIVEKIT_URL must be a ws:// or wss:// server URL');
	const revokeIssuedTokens =
		revokeTokens || endpoint.hostname.toLowerCase().endsWith('.livekit.cloud');
	const apiURL = new URL(endpoint);
	apiURL.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
	const rooms =
		client || new RoomServiceClient(apiURL.href, apiKey, apiSecret, { requestTimeout: 4 });
	return {
		async issue({ roomName, playerId, username, seatNumber }) {
			await rooms.createRoom({
				name: roomName,
				maxParticipants: 6,
				emptyTimeout: 300,
				departureTimeout: 30
			});
			const token = new AccessToken(apiKey, apiSecret, {
				identity: playerId,
				name: username,
				ttl: 60,
				metadata: JSON.stringify({ roomId: roomName, playerId, seatNumber })
			});
			token.addGrant({
				room: roomName,
				roomJoin: true,
				canSubscribe: true,
				canPublish: true,
				canPublishSources: [TrackSource.CAMERA, TrackSource.MICROPHONE],
				canPublishData: false,
				canUpdateOwnMetadata: false
			});
			return { url: endpoint.href, token: await token.toJwt(), roomName, identity: playerId };
		},
		async remove(roomName, playerId) {
			try {
				const options = revokeIssuedTokens
					? { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) }
					: undefined;
				await rooms.removeParticipant(roomName, playerId, options);
			} catch (error) {
				if (error.status !== 404 && error.code !== 'not_found') throw error;
			}
		}
	};
}
