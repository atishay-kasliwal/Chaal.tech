const key = 'chaal-player-name-v1';

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
