import { error } from '@sveltejs/kit';

// The practice table is a development harness: not a page in production.
export function load() {
	if (!import.meta.env.DEV) error(404, 'Not found');
}
