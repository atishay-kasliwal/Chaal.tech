import { presencePreviewAvailable } from '#lib/mascots/presence/preview.js';
import { error } from '@sveltejs/kit';
export function load() {
	if (!presencePreviewAvailable) error(404, 'Not found');
	return {};
}
