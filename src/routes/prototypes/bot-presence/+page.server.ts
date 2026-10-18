import { dev } from '$app/env';
import { error } from '@sveltejs/kit';
/** Isolated local review. No production flag, nav link, live seat or server mutation. */
export function load() {
	if (!dev) error(404, 'Not found');
	return {};
}
