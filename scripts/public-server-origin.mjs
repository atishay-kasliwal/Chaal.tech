import { isIP } from 'node:net';

/**
 * Production browser builds must point at a public HTTPS origin, not a
 * developer machine, private IP, or path that changes the configured API base.
 * @param {unknown} value
 */
export function isPublicServerOrigin(value) {
	if (typeof value !== 'string' || !value.trim()) return false;

	let endpoint;
	try {
		endpoint = new URL(value.trim());
	} catch {
		return false;
	}

	const hostname = endpoint.hostname
		.toLowerCase()
		.replace(/^\[|\]$/g, '')
		.replace(/\.+$/, '');
	const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');

	return (
		endpoint.protocol === 'https:' &&
		!isLocalhost &&
		isIP(hostname) === 0 &&
		!endpoint.username &&
		!endpoint.password &&
		endpoint.pathname === '/' &&
		!endpoint.search &&
		!endpoint.hash
	);
}
