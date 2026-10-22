import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// The practice table is a development harness: not a page in production.
export function load() {
	if (!dev) error(404, 'Not found');
}
