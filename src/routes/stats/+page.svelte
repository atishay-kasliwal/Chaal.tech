<script lang="ts">
	/** Members' stats page: the analytics view behind the club sign-in. */
	import ClubGate from '#lib/club/ClubGate.svelte';
	import StatsView from '#lib/analytics/StatsView.svelte';
</script>

<svelte:head><title>Stats · Chaal</title></svelte:head>

<ClubGate><StatsView /></ClubGate>
