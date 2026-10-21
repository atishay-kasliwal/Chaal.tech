<script lang="ts">
	/** Where you play, and where you play well: kept apart, and "best" only when it is clear. */
	import { fetchAnalytics, type Filter } from '../api.js';
	import { EVIDENCE_LABEL, gameName, signed, variantName, UNIT_NAMES } from '../format.js';
	import { meter, SUIT, redGame } from './meter.js';
	import type { GamesView, Pick } from '../types.js';

	let { filter }: { filter: Filter } = $props();
	let data = $state<GamesView | null>(null);
	let error = $state('');
	$effect(() => {
		const params = { window: filter.window, company: filter.company };
		data = null;
		fetchAnalytics<{ games: GamesView }>('games', params)
			.then((b) => (data = b.games))
			.catch((e) => (error = e.message));
	});
	const label = (pick: Pick, what: string) =>
		pick?.key
			? gameName(pick.key)
			: pick?.reason === 'too-close'
				? `No clear ${what} yet`
				: `Needs more hands`;
	const BADGES = [
		['🂠', 'Most played', 'mostPlayed'],
		['▲', 'Best', 'best'],
		['▼', 'Toughest', 'worst'],
		['💰', 'Most won', 'mostProfitable']
	] as const;
	const pickKey = (v: string | Pick | null) => (typeof v === 'string' ? v : (v?.key ?? null));
</script>

{#if error}<p class="notice" role="alert">{error}</p>
{:else if !data}<div class="gm" aria-busy="true"></div>
{:else if !data.games.length}<div class="v-zero">
		<span aria-hidden="true">♠</span><strong>0 hands</strong>
	</div>
{:else}
	<div class="gm">
		<ul class="badges">
			{#each BADGES as [icon, title, key] (key)}
				{@const value = data.labels[key]}
				{@const g = pickKey(value)}
				<li
					class="vt badge"
					title={g
						? `${title}: ${gameName(g)}`
						: typeof value === 'object' && value
							? label(value, title.toLowerCase())
							: 'Needs more hands'}
				>
					<span class="b-icon" aria-hidden="true">{icon}</span>
					<span class="b-title">{title}</span>
					{#if g}<strong class="b-game"
							><span class:v-red={redGame(g)} aria-hidden="true">{SUIT[g]}</span>
							{gameName(g)}</strong
						>
					{:else}<strong class="b-game v-dim">?</strong>{/if}
				</li>
			{/each}
		</ul>

		<ul class="games" style:--n={data.games.length}>
			{#each data.games as g (g.key)}
				{@const m = meter(g.results.perHand, g.results.perHandLow, g.results.perHandHigh)}
				<li
					class="vt card"
					class:v-dim={g.results.evidence === 'insufficient'}
					aria-label="{gameName(g.key)}: {g.hands} hands, {signed(
						g.results.perHand,
						2
					)} {UNIT_NAMES[g.key]?.[1] ?? 'stakes'} a hand"
				>
					<span class="corner" class:v-red={redGame(g.key)} aria-hidden="true"
						>{SUIT[g.key] ?? '•'}</span
					>
					<h2>{gameName(g.key)}</h2>
					<strong
						class="v-big per"
						class:v-pos={(g.results.perHand ?? 0) > 0}
						class:v-neg={(g.results.perHand ?? 0) < 0}>{signed(g.results.perHand, 1)}</strong
					>
					<span class="unit">{UNIT_NAMES[g.key]?.[1] ?? 'stakes'} / 🂠</span>
					{#if m}<div class="v-meter" aria-hidden="true">
							<span class="z"></span><span
								class="band"
								style:left="{m.lo}%"
								style:width="{Math.max(1, m.hi - m.lo)}%"
							></span><span class="dot" class:neg={m.neg} style:left="{m.v}%"></span>
						</div>{/if}
					<span class="facts"
						><span class="v-chip">🂠 {g.hands}</span>{#if g.fairShare.ratio != null}<span
								class="v-chip"
								title="Wins against a fair share">♛ ×{g.fairShare.ratio.toFixed(2)}</span
							>{/if}<span class="v-chip" title="Nights">☾ {g.nights}</span></span
					>
				</li>
			{/each}
		</ul>

		{#if data.variants.length}
			<section class="vt variants" aria-labelledby="var-title">
				<h2 id="var-title"><span class="ic" aria-hidden="true">♠</span> Teen Patti variants</h2>
				<ul>
					{#each data.variants.slice(0, 12) as v (v.key)}
						<li
							class:v-dim={v.results.evidence === 'insufficient'}
							class:best={data.labels.bestVariant.key === v.key}
							title="{variantName(v.key)}: {v.hands} hands, {signed(
								v.shrunkPerHand,
								2
							)} boots a hand, {EVIDENCE_LABEL[v.results.evidence]}"
						>
							{#if data.labels.bestVariant.key === v.key}<span
									class="crown"
									aria-label="Best variant">♛</span
								>{/if}
							<span class="v-name">{variantName(v.key)}</span>
							<strong
								class:v-pos={(v.shrunkPerHand ?? 0) > 0}
								class:v-neg={(v.shrunkPerHand ?? 0) < 0}>{signed(v.shrunkPerHand, 1)}</strong
							>
							<span class="v-hands">🂠 {v.hands}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}

<style>
	.gm {
		height: 100%;
		min-height: 0;
		display: grid;
		gap: 12px;
		grid-template-rows: auto minmax(0, 1.3fr) minmax(0, 1fr);
	}
	.badges {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
	}
	.badge {
		flex-direction: row;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px 10px;
		padding: 12px 14px;
	}
	.b-icon {
		font-size: 20px;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: #f2dc911a;
	}
	.b-title {
		font-size: 12px;
		color: var(--muted);
	}
	.b-game {
		width: 100%;
		font-family: var(--font-display);
		font-size: 18px;
	}
	.games {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 12px;
		min-height: 0;
	}
	.card {
		justify-content: center;
		background: linear-gradient(160deg, #332c44, #2c263b);
	}
	.corner {
		position: absolute;
		top: 10px;
		right: 14px;
		font-size: 34px;
		opacity: 0.85;
	}
	.per {
		font-size: clamp(32px, 4vw, 56px);
	}
	.unit {
		font-size: 12px;
		color: var(--muted);
		margin-top: -6px;
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.variants ul {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		grid-auto-rows: min-content;
		gap: 8px;
		min-height: 0;
		overflow: hidden;
	}
	.variants li {
		position: relative;
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 8px;
		padding: 8px 10px;
		border-radius: 12px;
		background: #ffffff08;
	}
	.variants li.best {
		box-shadow: inset 0 0 0 1px var(--butter);
	}
	.crown {
		position: absolute;
		top: -6px;
		right: 8px;
		color: var(--butter);
		font-size: 14px;
	}
	.v-name {
		font-size: 13px;
		font-weight: 700;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.variants strong {
		font-family: var(--font-display);
		grid-row: span 2;
		align-self: center;
		font-size: 18px;
	}
	.v-hands {
		font-size: 11px;
		color: var(--muted);
	}
	@media (max-width: 1000px) {
		.badges {
			grid-template-columns: repeat(2, 1fr);
		}
	}
	@media (max-width: 720px) {
		.gm {
			gap: 8px;
		}
		.badges {
			gap: 8px;
		}
		.badge {
			padding: 8px 10px;
		}
		.b-icon {
			width: 26px;
			height: 26px;
			font-size: 14px;
		}
		.b-game {
			font-size: 14px;
		}
		.games {
			gap: 8px;
		}
		.corner {
			font-size: 20px;
			top: 8px;
			right: 10px;
		}
		.card h2 {
			font-size: 12px;
		}
		.per {
			font-size: 24px;
		}
		.facts .v-chip:nth-child(n + 2) {
			display: none;
		}
		.variants ul {
			grid-template-columns: repeat(2, 1fr);
		}
	}
</style>
