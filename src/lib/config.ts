/** Public game endpoint. The original hosted backend is unsafe and is not a fallback. */
const configuredServerURL = import.meta.env.VITE_SERVER_URL?.trim();

export const serverURL = (
	configuredServerURL || (import.meta.env.DEV ? 'http://127.0.0.1:8080' : '')
).replace(/\/+$/, '');
export const serverConfigError =
	'The game service is not configured. Set VITE_SERVER_URL and rebuild.';
