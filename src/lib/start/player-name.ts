const key = 'chaal-player-name-v1';
const pendingJoinPrefix = 'chaal-pending-player-name-v1:';

/** The name this device last played under, so nobody types it twice. */
export function savedName(): string {
	try {
		return (localStorage.getItem(key) ?? '').slice(0, 24);
	} catch {
		return '';
	}
}

export function saveName(name: string) {
	const clean = name.trim().slice(0, 24);
	if (!clean) return;
	try {
		localStorage.setItem(key, clean);
	} catch {
		/* Name is asked again next time when storage is blocked. */
	}
}

/** Keep the name entered in the start flow available while that flow opens its room. */
export function stageJoinName(roomName: string, name: string) {
	const clean = name.trim().slice(0, 24);
	if (!roomName || !clean) return;
	try {
		sessionStorage.setItem(`${pendingJoinPrefix}${roomName}`, clean);
	} catch {
		/* The remembered player name remains the fallback when session storage is blocked. */
	}
}

/** Read the name handed off for this room, without leaking it into the invite URL. */
export function pendingJoinName(roomName: string): string {
	try {
		return (sessionStorage.getItem(`${pendingJoinPrefix}${roomName}`) ?? '').slice(0, 24);
	} catch {
		return '';
	}
}

export function clearPendingJoinName(roomName: string) {
	try {
		sessionStorage.removeItem(`${pendingJoinPrefix}${roomName}`);
	} catch {
		/* Nothing to clear when session storage is unavailable. */
	}
}

/** A room code from anything a friend might paste: the full link, or just the code. */
export function roomCodeFrom(text: string): string | null {
	const match = text
		.trim()
		.toLowerCase()
		.match(/(?:^|\/)([0-9a-f]{32})(?:[/?#]|$)/);
	if (match) return match[1];
	const bare = text.trim().toLowerCase();
	return /^[a-z0-9][a-z0-9-]{2,31}$/.test(bare) ? bare : null;
}

const pendingFriendsPrefix = 'chaal-pending-invite-friends-v1:';

/** Friends picked on the start page (club member IDs); invited once you are seated. */
export function stageInviteFriends(roomName: string, memberIds: string[]) {
	if (!roomName || !memberIds.length) return;
	try {
		sessionStorage.setItem(`${pendingFriendsPrefix}${roomName}`, JSON.stringify(memberIds));
	} catch {
		/* The host can still invite from the table when session storage is blocked. */
	}
}

/** Read and forget the friends staged for this room, so they are invited once. */
export function takeInviteFriends(roomName: string): string[] {
	try {
		const key = `${pendingFriendsPrefix}${roomName}`;
		const ids = JSON.parse(sessionStorage.getItem(key) ?? '[]');
		sessionStorage.removeItem(key);
		return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
	} catch {
		return [];
	}
}
