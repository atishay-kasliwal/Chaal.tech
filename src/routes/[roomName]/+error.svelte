<script>
	import { page } from '$app/state';
</script>

<h1>{page.error?.message || 'Room unavailable'}</h1>
