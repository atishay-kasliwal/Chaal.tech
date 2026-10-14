<script lang="ts">
	import { toastQueue } from './stores.svelte';
</script>

<div class="toast">
	{#each toastQueue as toast (toast.id)}
		<div
			class="alert"
			class:alert-error={toast.type === 'error'}
			class:alert-info={toast.type === 'info'}
			class:alert-success={toast.type === 'success'}
		>
			<div>
				<span>{toast.message}</span>
			</div>
		</div>
	{/each}
</div>
