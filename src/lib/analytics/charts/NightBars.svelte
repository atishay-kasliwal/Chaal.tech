<script lang="ts">
	/** One bar per night, up for a winning night, down for a losing one. */
	import { day } from '../format.js';
	let { nights }: { nights: { nightId: string; at: number; units: number; hands: number }[] } =
		$props();
	const top = $derived(Math.max(1, ...nights.map((n) => Math.abs(n.units))));
</script>

{#if nights.length}
	<ol class="nights" aria-label="Recent nights in boots">
		{#each nights as night (night.nightId)}
			<li
				title="{day(night.at)}: {night.units > 0
					? '+'
					: ''}{night.units} boots over {night.hands} hands"
			>
				<span class="half up"
					>{#if night.units > 0}<span class="bar" style:height="{(night.units / top) * 100}%"
						></span>{/if}</span
				>
				<span class="half down"
					>{#if night.units < 0}<span class="bar" style:height="{(-night.units / top) * 100}%"
						></span>{/if}</span
				>
				<small>{day(night.at).split(' ').slice(1).join(' ')}</small>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.nights {
		display: flex;
		align-items: stretch;
		gap: 0.35rem;
		height: 7.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		flex: 1;
		grid-template-rows: 1fr 1fr auto;
		min-width: 0;
	}
	.half {
		display: flex;
		position: relative;
	}
	.up {
		align-items: flex-end;
		border-bottom: 1px solid rgb(248 242 229 / 25%);
	}
	.down {
		align-items: flex-start;
	}
	.bar {
		width: 100%;
		border-radius: 0.3rem 0.3rem 0 0;
		background: #f2dc91;
	}
	.down .bar {
		border-radius: 0 0 0.3rem 0.3rem;
		background: #e0806e;
	}
	small {
		overflow: hidden;
		color: #beb5c9;
		font-size: 0.6rem;
		text-align: center;
		white-space: nowrap;
	}
</style>
