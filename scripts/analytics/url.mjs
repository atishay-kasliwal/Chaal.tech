/** Same URL shape as src/lib/analytics/api.ts analyticsUrl, for the dev fixture. */
export function analyticsUrl(route, params = {}) {
	const query = new URLSearchParams();
	for (const [key, value] of Object.entries(params))
		if (value !== undefined && value !== null && value !== '' && value !== 'all') query.set(key, String(value));
	const qs = query.toString();
	return `/analytics/${route}${qs ? `?${qs}` : ''}`;
}
