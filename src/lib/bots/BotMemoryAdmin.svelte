<script lang="ts">
	import { club } from '#lib/club/club.svelte.js';
	interface Analysis {
		hands: number; nights: number; decisions: number; adapted: number; redirected: number; unavailable: number; behaviorChanges: number;
		performance: Record<string, {hands: number; nights: number; boots: number; bootsPerHand: number | null; wins: number; fairShare: number; status: string}>;
		predictability: {samples: number; accuracy: number | null; baselineAccuracy: number | null; method: string};
		exploitability: {context: string; decisions: number; action: string; frequency: number}[];
		reasons: Record<string, number>;
		latency: Record<string, {samples: number; mean: number | null; p95: number | null}>;
		causality: string;
	}
	interface HealthBot {
		botId: string; contexts: number; playerModels: number; observations: number; episodes: number; staleModels: number; styles: string[];
		status: {status?: string; lastUpdated?: number; lastError?: string; errors?: number} | null;
		analysis: Analysis;
	}
	let data = $state<{status: string; schema: string; bots: HealthBot[]} | null>(null);
	let error = $state('');
	let busy = $state(false);
	let notice = $state('');
	const number = (n: number | null) => n === null ? 'Not enough data' : n.toFixed(2);
	async function load(botId?: string) {
		busy = true; error = ''; notice = '';
		try {
			const { response, body } = await club.request('/admin/bots/memory', botId ? {method:'POST', body:JSON.stringify({action:'rebuild', botId})} : {});
			if (!response.ok) throw new Error(body.error ?? 'Memory tools unavailable');
			data = body;
			if (botId) notice = `${botId}: derived memory rebuilt from its own observed hands.`;
		} catch (e) { error = e instanceof Error ? e.message : 'Memory tools unavailable'; }
		finally { busy = false; }
	}
</script>

<details class="memory-tools" ontoggle={e => { if (e.currentTarget.open && !data && !busy) void load(); }}>
	<summary>Memory & learning <span>Owner diagnostics</span></summary>
	<div class="tools-content">
		<p>Each character remembers only tables it played. These tools show observation health and descriptive results.</p>
		<button disabled={busy} onclick={() => load()}>{busy ? 'Working…' : 'Refresh memory health'}</button>
		{#if error}<p role="alert">{error}</p>{/if}
		{#if notice}<p role="status">{notice}</p>{/if}
		{#if data?.status === 'not-migrated'}<p>Memory storage is not enabled yet. Run the explicit memory migration and rebuild before publishing adaptive styles.</p>
		{:else if data}
			<p class="muted">{data.schema} · {data.bots.length} characters with memory or update status</p>
			{#each data.bots as bot (bot.botId)}
				<article>
					<header><h3>{bot.botId}</h3><button disabled={busy} onclick={() => load(bot.botId)}>Rebuild derived memory</button></header>
					<p>{bot.playerModels} player models · {bot.observations} decision opportunities · {bot.episodes} retained episodes · {bot.staleModels} stale models</p>
					<p class="muted">{bot.contexts} game contexts · {bot.styles.join(', ')} · {bot.status?.status ?? 'Ready'}</p>
					{#if bot.status?.lastError}<p role="alert">{bot.status.lastError} · {bot.status.errors ?? 0} update errors; archive outbox will retry.</p>{/if}
					<p>{bot.analysis.adapted} / {bot.analysis.decisions} decisions used adaptation · {bot.analysis.redirected} changed the sampled base action · {bot.analysis.unavailable} memory fallbacks</p>
					<div class="scroll"><table>
						<caption>Descriptive performance · last 2,000 bot hands</caption>
						<thead><tr><th>Group</th><th>Hands</th><th>Nights</th><th>Boots / hand</th><th>Wins / fair share</th><th>Evidence</th></tr></thead>
						<tbody>{#each Object.entries(bot.analysis.performance) as [group, row] (group)}<tr>
							<th>{group}</th><td>{row.hands}</td><td>{row.nights}</td><td>{number(row.bootsPerHand)}</td><td>{number(row.wins)} / {number(row.fairShare)}</td><td>{row.status}</td>
						</tr>{/each}</tbody>
					</table></div>
					<p>Action prediction: {bot.analysis.predictability.accuracy === null ? 'Still collecting evidence' : `${Math.round(bot.analysis.predictability.accuracy * 100)}%`} · {bot.analysis.predictability.samples} predictions. Majority baseline: {bot.analysis.predictability.baselineAccuracy === null ? '—' : `${Math.round(bot.analysis.predictability.baselineAccuracy * 100)}%`}.</p>
					<p class="muted">{bot.analysis.predictability.method}. Each prediction uses only earlier public observations.</p>
					<p>{bot.analysis.behaviorChanges} recent-change signals · {bot.analysis.exploitability.length} repetition signals to review</p>
					{#each bot.analysis.exploitability as signal (signal.context)}<p class="muted">{signal.action}: {Math.round(signal.frequency * 100)}% of {signal.decisions} decisions in {signal.context}</p>{/each}
					<details><summary>Reason counts and latency</summary>
						{#each Object.entries(bot.analysis.reasons) as [reason, count] (reason)}<p class="muted">{reason}: {count}</p>{/each}
						{#each Object.entries(bot.analysis.latency) as [name, metric] (name)}<p class="muted">{name}: mean {number(metric.mean)} ms · p95 {number(metric.p95)} ms · {metric.samples} samples</p>{/each}
					</details>
					<p class="muted">{bot.analysis.causality}</p>
				</article>
			{/each}
		{/if}
	</div>
</details>

<style>
	.memory-tools { margin: 1.5rem 0; border: 1px solid #41463b; border-radius: .7rem; background: #131b15; color: #e5dfce; }
	summary { padding: 1rem; cursor: pointer; font-weight: 700; }
	summary span { color: #aaa999; font-size: .8rem; margin-left: .5rem; font-weight: 400; }
	.tools-content { padding: 0 1rem 1rem; }
	p { margin: .75rem 0; line-height: 1.6; overflow-wrap: anywhere; }
	.muted { color: #aeb4a5; font-size: .82rem; }
	article { border-top: 1px solid #41463b; margin-top: 1.25rem; padding-top: 1rem; }
	header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
	h3 { font-weight: 700; font-size: 1.1rem; }
	button { background: #d6b467; color: #181a14; padding: .6rem .9rem; border-radius: .4rem; font-weight: 600; cursor: pointer; }
	button:disabled { opacity: .5; cursor: wait; }
	.scroll { overflow-x: auto; max-width: 100%; }
	table { width: 100%; text-align: left; font-size: .8rem; border-collapse: collapse; }
	caption { text-align: left; margin: .7rem 0; color: #aeb4a5; }
	th, td { padding: .7rem; border-bottom: 1px solid #41463b; }
	[role='alert'] { color: #e6a69b; }
</style>
