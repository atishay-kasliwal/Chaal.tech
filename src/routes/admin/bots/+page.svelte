<script lang="ts">
	import ClubGate from '#lib/club/ClubGate.svelte';
	import { club } from '#lib/club/club.svelte.js';
	import BotAdmin from '#lib/bots/BotAdmin.svelte';
</script>

<svelte:head><title>Characters · Chaal admin</title></svelte:head>
<ClubGate
	>{#if club.member?.role === 'owner'}<BotAdmin />{:else}<p class="p-8">
			Only club owners manage characters.
		</p>{/if}</ClubGate
>
