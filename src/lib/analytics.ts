/**
 * Google Analytics 4. Only in production builds; set VITE_GA_ID to change the property or to ''
 * to turn it off. Signed-in friends are tagged with their member id (never an email or name), so
 * GA's User explorer can follow one person across devices. Table paths are sent as "/table": a
 * table's name is its invite code and must not end up in reports.
 */
import { browser } from '$app/env';

const GA_ID = (import.meta.env.VITE_GA_ID ?? 'G-97MTCQ9GGD').trim();
const enabled = browser && !import.meta.env.DEV && !!GA_ID;

declare global {
	interface Window {
		dataLayer: unknown[];
		gtag?: (...args: unknown[]) => void;
	}
}

function gtag(...args: unknown[]) {
	if (!enabled) return;
	if (!window.gtag) {
		window.dataLayer = window.dataLayer || [];
		// gtag.js reads the arguments object itself, not an array.
		window.gtag = function () {
			// eslint-disable-next-line prefer-rest-params
			window.dataLayer.push(arguments);
		};
		const script = document.createElement('script');
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
		document.head.append(script);
		window.gtag('js', new Date());
		// Page views are sent on each SvelteKit navigation instead.
		window.gtag('config', GA_ID, { send_page_view: false });
	}
	window.gtag(...args);
}

/** Record a page view. `routeId` is SvelteKit's route id, used to hide table names. */
export function trackPage(url: URL, routeId: string | null) {
	const path = routeId === '/[roomName]' ? '/table' : url.pathname;
	gtag('event', 'page_view', {
		page_path: path,
		page_location: `${url.origin}${path}`,
		page_title: document.title
	});
}

let currentUser: string | null | undefined;
/** Tag (or untag on sign-out) everything that follows with this friend's member id. */
export function identify(memberId: string | null, role?: string) {
	if (memberId === currentUser) return;
	currentUser = memberId;
	gtag('set', { user_id: memberId ?? undefined });
	gtag('set', 'user_properties', { club_role: memberId ? (role ?? 'member') : undefined });
}

/** A custom event, such as "login" or "table_join". Keep params free of names and emails. */
export function track(name: string, params: Record<string, string | number | boolean> = {}) {
	gtag('event', name, params);
}
