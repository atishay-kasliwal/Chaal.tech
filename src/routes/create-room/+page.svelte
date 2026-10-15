<!-- Start or join a table. The same panel opens as a pop-up from the landing page and nav. -->
<script lang="ts">
	import StartPanel from '#lib/start/StartPanel.svelte';
	import ClubGate from '#lib/club/ClubGate.svelte';
</script>

<div class="relative flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-10">
	<div
		class="w-full max-w-md rounded-3xl border border-[rgb(240_209_140_/_18%)] bg-[#101a16] p-6 shadow-2xl sm:p-8"
	>
		<ClubGate><StartPanel /></ClubGate>
	</div>
</div>
