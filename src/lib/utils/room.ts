import { serverConfigError, serverURL } from '#lib/config.js';

export async function validateRoomAccess(
	roomName: string
): Promise<{ status: 200 | 400 | 404 | 500; error?: string }> {
	if (!serverURL) return { status: 500, error: serverConfigError };

	try {
		const response = await fetch(`${serverURL}/room/${roomName}`);

		if (response.status === 404) {
			return {
				status: 404,
				error: 'Room not found, create room instead'
			};
		}

		if (!response.ok) {
			return { status: 500, error: 'Room service unavailable' };
		}
		// Existence is public. The socket session decides admission versus resume.
		// A started hand must not prevent an authenticated member from refreshing.

		return {
			status: 200
		};
	} catch {
		return {
			status: 500,
			error: 'Internal Server Error: Failed to fetch room data'
		};
	}
}
