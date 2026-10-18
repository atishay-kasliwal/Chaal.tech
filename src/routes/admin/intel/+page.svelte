<script lang="ts">
	import ClubGate from '#lib/club/ClubGate.svelte';
	import { club } from '#lib/club/club.svelte.js';
	import IntelAdmin from '#lib/analytics/admin/IntelAdmin.svelte';
</script>

<svelte:head><title>Club intelligence · Chaal admin</title></svelte:head>
<ClubGate
	>{#if club.member?.role === 'owner'}<IntelAdmin />{:else}<p class="p-8">Only club owners see club intelligence.</p>{/if}</ClubGate
>
