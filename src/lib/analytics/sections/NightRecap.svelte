<script lang="ts">
	/**
	 * The morning-after recap: a few things worth saying about a night, then the table. The first part
	 * is what anyone at the table may know; the "you" lines come from your own history and cards.
	 */
	import { fetchAnalytics } from '../api.js';
	import { boots, day, plural, time } from '../format.js';
	import { properName } from '#lib/names.js';
	import { track } from '#lib/analytics.js';
	import type { Names, Recap } from '../types.js';

	let { nightId = null, onClose, onOpenHand }: { nightId?: string | null; onClose: () => void; onOpenHand: (id: string) => void } = $props();
	let data = $state<{ recap: Recap; names: Names; empty?: boolean } | null>(null);
	let error = $state('');
	$effect(() => {
		data = null;
		error = '';
		fetchAnalytics<{ recap: Recap; names: Names; empty?: boolean }>('recap', { night: nightId }).then((b) => (data = b)).catch((e) => (error = e.message));
	});
	const who = (subject: string, you = false) => (you ? 'You' : data?.names[subject] ? properName(data.names[subject].name) : subject.startsWith('bot:') ? 'A bot' : 'A friend');
	const LUCK: Record<string, string> = { hot: 'Your cards ran warm.', cold: 'Your cards ran cold.', average: 'Your cards were about average.' };
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Night recap">
	<div class="sheet">
		<button class="close" onclick={onClose} aria-label="Close">×</button>
		{#if error}<p class="notice" role="alert">{error}</p>
		{:else if !data}<p class="muted">Putting the night together…</p>
		{:else if data.empty || !data.recap}<p class="muted">Play a night and its recap appears here.</p>
		{:else}
			{@const r = data.recap}
			<p class="eyebrow">{day(r.startedAt)} · {time(r.startedAt)} to {time(r.endedAt)} · {plural(r.hands, 'hand')} · {r.minutes} min</p>
			<h2>The night in a few lines</h2>
			{#if r.empty}<p class="muted">{r.empty}</p>{/if}
			<ul class="highlights">
				{#each r.highlights as h (h.id)}
					<li class={h.scope}>
						<span>{h.text}</span>
						{#if h.evidence.hands?.length}<button class="link" onclick={() => onOpenHand(h.evidence.hands?.[0] ?? '')}>See the hand</button>{/if}
					</li>
				{/each}
			</ul>
			<h3>Your night</h3>
			<p>{boots(r.you.units)} over {plural(r.you.hands, 'hand')}. {r.you.luck ? LUCK[r.you.luck] ?? '' : ''}</p>
			<h3>The table</h3>
			<ul class="plain">
				{#each r.results.humans as p (p.subject)}
					<li><span>{who(p.subject, p.you)}</span><span class="muted">{p.hands} hands</span><strong class:up={p.units > 0} class:down={p.units < 0}>{boots(p.units)}</strong></li>
				{/each}
				{#each r.results.bots as p (p.subject)}
					<li><span>{who(p.subject)} <small class="muted">bot</small></span><span class="muted">{p.hands} hands</span><strong>{boots(p.units)}</strong></li>
				{/each}
			</ul>
			<button class="primary" onclick={() => (track('recap_closed'), onClose())}>Done</button>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 50;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 60%);
		padding: 1rem;
	}
	.sheet {
		position: relative;
		display: grid;
		gap: 0.7rem;
		width: min(100%, 36rem);
		max-height: 90dvh;
		overflow-y: auto;
		border: 1px solid rgb(240 209 140 / 24%);
		border-radius: 1.3rem;
		background: #0f1a16;
		padding: 1.4rem;
		color: #f1ebdc;
	}
	.close {
		position: absolute;
		top: 0.6rem;
		right: 0.8rem;
		font-size: 1.6rem;
		color: #b1b9ae;
	}
	h2 {
		font-family: Georgia, serif;
		font-size: 1.6rem;
		font-weight: 400;
	}
	h3 {
		color: #d5b67a;
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	.eyebrow {
		color: #d5b67a;
		font-size: 0.68rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.highlights {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.highlights li {
		display: grid;
		gap: 0.2rem;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.7rem 0.9rem;
		line-height: 1.4;
	}
	.highlights li.personal {
		border-left: 3px solid #e7c784;
	}
	.plain {
		display: grid;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.plain li {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 0.6rem;
		font-size: 0.88rem;
	}
	.up {
		color: #8fe0ad;
	}
	.down {
		color: #f0a090;
	}
	.link {
		justify-self: start;
		color: #e7c784;
		font-size: 0.78rem;
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.primary {
		justify-self: end;
		border-radius: 999px;
		background: #e7c784;
		padding: 0.5rem 1.4rem;
		color: #1d1405;
		font-weight: 700;
	}
</style>
