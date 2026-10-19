import { dev } from '$app/env';

/** Release switch for the single-character review. Normal tables remain unchanged. */
export const presencePreviewAvailable = dev || import.meta.env.VITE_BOT_PRESENCE_PREVIEW === 'true';

export function wantsPresencePreview(search: string) {
	return presencePreviewAvailable && new URLSearchParams(search).get('botPresence') === 'dhoni';
}
