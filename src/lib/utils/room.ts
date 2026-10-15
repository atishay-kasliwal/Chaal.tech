import { serverConfigError, serverURL } from '#lib/config.js';

type MemberFetch = { authorizedFetch(path: string, init?: RequestInit): Promise<Response> };

/**
 * Members-only: even whether a room exists is checked with a game credential. The page loader
 * has none, so it lets the page render and the browser checks again once signed in.
 */
export async function validateRoomAccess(
	roomName: string,
	members?: MemberFetch
): Promise<{ status: 200 | 400 | 401 | 404 | 500; error?: string }> {
	if (!serverURL) return { status: 500, error: serverConfigError };
	if (!members) return { status: 200 };

	try {
		const response = await members.authorizedFetch(`/room/${encodeURIComponent(roomName)}`);

		if (response.status === 404) {
			return {
				status: 404,
				error: 'Room not found, create room instead'
			};
		}
		if (response.status === 401) return { status: 401, error: 'Sign in to join this table' };

		if (!response.ok) {
			return { status: 500, error: 'Room service unavailable' };
		}
		// The socket session decides admission versus resume.
		// A started hand must not prevent an authenticated member from refreshing.

		return {
			status: 200
		};
	} catch {
		return {
			status: 500,
			error: 'Could not reach the table. Check your connection and try again.'
		};
	}
}
