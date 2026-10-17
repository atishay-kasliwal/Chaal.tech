<script lang="ts">
	import { page } from '$app/state';
	import Bots from '#lib/bots/Bots.svelte';
</script>

<Bots id={page.params.botId} />
