<script lang="ts">
	/** Dev only: the Stats view on a simulated history (scripts/analytics/stats-fixture.mjs). */
	import { page } from '$app/state';
	import StatsView from '#lib/analytics/StatsView.svelte';
	import { seedAnalytics } from '#lib/analytics/api.js';
	import fixture from './fixture.json';

	for (const [url, body] of Object.entries(fixture)) seedAnalytics(url, body as Record<string, unknown>);
	const handUrl = Object.keys(fixture).find((url) => url.startsWith('/analytics/hand?'));
	const initialHand = page.url.searchParams.has('hand') && handUrl ? decodeURIComponent(new URLSearchParams(handUrl.split('?')[1]).get('id') ?? '') : null;
</script>

<svelte:head><title>Stats fixture · Chaal</title></svelte:head>

<StatsView initial={page.url.searchParams.get('section') ?? 'overview'} {initialHand} />
