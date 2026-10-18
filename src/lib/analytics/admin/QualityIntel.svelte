<script lang="ts">
	/** Data quality: problems must be visible before anyone trusts a number. Ids only, never hand contents. */
	import { club } from '#lib/club/club.svelte.js';
	import { ago } from '../format.js';
	import type { Quality } from './types.js';

	let data = $state<Quality | null>(null);
	let error = $state('');
	$effect(() => {
		club.request('/admin/intel/quality').then(({ response, body }) => {
			if (!response.ok) throw new Error(body.error ?? 'Quality checks are unavailable');
			data = body;
		}).catch((e) => (error = e.message));
	});
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Checking the history…</p>
{:else}
	<section class="panel">
		<h2>{data.status === 'ok' ? 'Everything checks out' : 'Something needs a look'}</h2>
		<p class="muted small">Scanned the newest {data.scanned} hands, {ago(data.generatedAt)}.</p>
		<ul class="checks">
			{#each data.checks as c (c.id)}
				<li class:bad={c.status === 'attention'}>
					<span class="mark" aria-hidden="true">{c.status === 'ok' ? '✓' : '!'}</span>
					<span><strong>{c.label}</strong>{#if c.detail}<small>{c.detail}</small>{/if}{#if c.examples.length}<small class="ids">e.g. {c.examples.join(', ')}</small>{/if}</span>
					<span class="count">{c.count}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.checks {
		display: grid;
		gap: 0.4rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.checks li {
		display: grid;
		grid-template-columns: 1.5rem 1fr auto;
		align-items: start;
		gap: 0.6rem;
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.6rem 0.8rem;
		font-size: 0.88rem;
	}
	.checks li.bad {
		background: rgb(240 113 95 / 10%);
	}
	.mark {
		color: #8fe0ad;
	}
	.bad .mark {
		color: #f3b0a5;
	}
	small {
		display: block;
		color: #b1b9ae;
		font-size: 0.72rem;
	}
	.ids {
		font-family: ui-monospace, monospace;
		word-break: break-all;
	}
	.count {
		font-variant-numeric: tabular-nums;
	}
</style>
