/** Client for /analytics/*: purpose-built responses, cached per URL for the visit. */
import { club } from '#lib/club/club.svelte.js';

export interface Filter {
	window?: 'all' | '30d' | 'recent-nights' | 'recent-hands';
	game?: string;
	company?: 'all' | 'friends' | 'bots';
	/** Optional date range, YYYY-MM-DD. */
	from?: string;
	until?: string;
}

const cache = new Map<string, Promise<unknown>>();

export function analyticsUrl(route: string, params: Record<string, string | number | undefined | null> = {}) {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params))
		if (value !== undefined && value !== null && value !== '' && value !== 'all') query.set(key, String(value));
	const qs = query.toString();
	return `/analytics/${route}${qs ? `?${qs}` : ''}`;
}

export function fetchAnalytics<T = Record<string, unknown>>(route: string, params: Record<string, string | number | undefined | null> = {}): Promise<T> {
	const url = analyticsUrl(route, params);
	let pending = cache.get(url);
	if (!pending) {
		pending = club.request(url).then(({ response, body }) => {
			if (!response.ok) throw new Error(body.error || 'Stats are unavailable right now. Try again.');
			return body;
		});
		cache.set(url, pending);
		pending.catch(() => cache.delete(url));
	}
	return pending as Promise<T>;
}

export const clearAnalytics = () => cache.clear();

/** Dev fixtures only (src/routes/test-stats): answer a URL without the server. */
export function seedAnalytics(url: string, body: Record<string, unknown>) {
	cache.set(url, Promise.resolve(body));
}
