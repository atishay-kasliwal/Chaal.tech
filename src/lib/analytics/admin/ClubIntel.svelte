<script lang="ts">
	/** The owner's club view: who plays, what they play, and how each variant is doing. Counts, not ranks. */
	import { club } from '#lib/club/club.svelte.js';
	import { gameName, percent, plural } from '../format.js';
	import type { ClubIntel } from './types.js';

	let data = $state<ClubIntel | null>(null);
	let error = $state('');
	$effect(() => {
		club.request('/admin/intel/club').then(({ response, body }) => {
			if (!response.ok) throw new Error(body.error ?? 'Club analytics are unavailable');
			data = body;
		}).catch((e) => (error = e.message));
	});
	const FLAG: Record<string, string> = {
		'often-switched-away': 'Players often switch away after a hand or two',
		'many-unfinished-hands': 'Many hands end unfinished',
		'players-come-back': 'Players come back to it'
	};
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<p class="muted">Counting the club…</p>
{:else if data.overview.empty}<section class="panel empty"><h2>No recorded hands yet</h2><p class="muted">The club’s numbers appear after the first night.</p></section>
{:else}
	{@const o = data.overview}
	<section class="panel">
		<h2>The club</h2>
		<ul class="stats">
			<li><strong>{o.players}</strong><span>players</span></li>
			<li><strong>{o.active?.days7}</strong><span>played this week</span></li>
			<li><strong>{o.active?.days30}</strong><span>in 30 days</span></li>
			<li><strong>{o.nights}</strong><span>nights</span></li>
			<li><strong>{o.hands}</strong><span>hands</span></li>
			<li><strong>{o.avgNightMinutes} min</strong><span>average night</span></li>
			<li><strong>{o.avgPlayersPerNight}</strong><span>players a night</span></li>
		</ul>
	</section>
	<section class="panel two">
		<div>
			<h2>Games</h2>
			<table class="data-table"><thead><tr><th>Game</th><th>Hands</th><th>Share</th><th>Night length</th></tr></thead><tbody>
				{#each o.games ?? [] as g (g.game)}
					{@const s = o.sessionByGame?.find((x) => x.game === g.game)}
					<tr><td>{gameName(g.game)}</td><td>{g.hands}</td><td>{percent(g.share)}</td><td>{s?.avgMinutes ? `${s.avgMinutes} min` : '–'}{#if s && s.evidence === 'insufficient'}<small class="muted"> few nights</small>{/if}</td></tr>
				{/each}
			</tbody></table>
		</div>
		<div>
			<h2>Bots at the table</h2>
			<table class="data-table"><thead><tr><th>Bot</th><th>Hands</th><th>Nights</th></tr></thead><tbody>
				{#each o.bots ?? [] as b (b.botId)}<tr><td>{b.name}</td><td>{b.hands}</td><td>{b.nights} ({percent(b.nightShare)})</td></tr>{/each}
			</tbody></table>
		</div>
	</section>
	<section class="panel">
		<h2>Variant health</h2>
		<p class="muted small">{data.variants.note}</p>
		<div class="scroll">
			<table class="data-table">
				<thead><tr><th>Variant</th><th>Hands</th><th>Chosen</th><th>Players</th><th>Come back</th><th>Run</th><th>Switch away</th><th>Finished</th><th>With bots</th></tr></thead>
				<tbody>
					{#each data.variants.variants as v (v.key)}
						<tr class:dim={v.evidence === 'insufficient'}>
							<td>{v.label}{#each v.flags as f (f)}<small class="flag">{FLAG[f]}</small>{/each}</td>
							<td>{v.hands}</td><td>{v.selections}×</td><td>{v.uniquePlayers}</td><td>{percent(v.repeatRate)}</td>
							<td>{v.avgRunHands ?? '–'} hands</td><td>{percent(v.quickSwitchRate)}</td><td>{percent(v.completionRate)}</td><td>{percent(v.withBotsRate)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="muted tiny">“Come back”: share of its players who played it on more than one night. “Switch away”: how often a run of it lasted only a hand or two. Faded rows have too few hands to read.</p>
	</section>
	<section class="panel two">
		<div>
			<h2>Variants over the last 30 days</h2>
			<ul class="plain">{#each (o.variants ?? []).slice(0, 8) as v (v.key)}<li><span>{v.label}</span><span class="muted">{v.hands} hands</span><span>{v.trend === 'growing' ? 'Growing' : v.trend === 'declining' ? 'Fading' : v.trend === 'new' ? 'New' : v.trend === 'steady' ? 'Steady' : 'Too few to say'}</span></li>{/each}</ul>
		</div>
		<div>
			<h2>Who keeps coming back</h2>
			{#if o.retention?.cohorts.length}
				<ul class="plain">{#each o.retention.cohorts.slice(-6) as c (c.month)}<li><span>{c.month}</span><span class="muted">{plural(c.players, 'player')}</span><span>{percent(c.rate)} played the next month</span></li>{/each}</ul>
			{:else}<p class="muted small">{o.retention?.note}</p>{/if}
			{#if o.groups?.length}<h3>Regular tables</h3><ul class="plain">{#each o.groups as g (g.names.join())}<li><span>{g.names.join(', ')}</span><span class="muted">{plural(g.nights, 'night')}</span><span></span></li>{/each}</ul>{/if}
		</div>
	</section>
{/if}

<style>
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: 0.6rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.stats li {
		display: grid;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.7rem 0.8rem;
	}
	.stats strong {
		font-size: 1.35rem;
	}
	.stats span {
		color: #b1b9ae;
		font-size: 0.75rem;
	}
	.scroll {
		overflow-x: auto;
	}
	.flag {
		display: block;
		color: #e7c784;
		font-size: 0.68rem;
	}
</style>
