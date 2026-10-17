<script lang="ts">
	import { onMount } from 'svelte';
	import { club } from '#lib/club/club.svelte.js';
	import BotPortrait from './BotPortrait.svelte';

	interface Config {
		policy: string;
		supportedGames: string[];
		supportedVariants: string[];
		tendencies: Record<string, number>;
		difficulty: { declared: string };
		source?: string;
		notes?: string;
	}
	interface Style extends Config {
		_id: string;
		botId: string;
		version: number;
		parent: string | null;
		status: string;
		revision: number;
		configHash: string;
		publishedAt?: string;
		validation?: {
			passed: boolean;
			errors: string[];
			simulation: { hands: number; decisions: number };
			invariance: boolean;
			configHash: string;
		};
	}
	interface Identity {
		name: string;
		description: string;
		avatar: { mascotId: string };
		personality: { title: string; traits: string[] };
	}
	interface Bot extends Identity {
		_id: string;
		status: string;
		currentStyle: string | null;
		currentVersion: number;
	}
	let bots = $state<Bot[]>([]);
	let styles = $state<Style[]>([]);
	let enabled = $state<string[]>([]);
	let artwork = $state<{ id: string; name: string; mascotId: string }[]>([]);
	let defaults = $state<Config>();
	let selected = $state('');
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');
	let createOpen = $state(false);
	let slug = $state('');
	let identity = $state<Identity>({
		name: '',
		description: '',
		avatar: { mascotId: 'bot-rohit-sharma' },
		personality: { title: '', traits: [] }
	});
	let traits = $state('');
	let styleId = $state('');
	let configText = $state('');
	let retireRequested = $state(false);
	const bot = $derived(bots.find((b) => b._id === selected));
	const versions = $derived(styles.filter((style) => style.botId === selected));
	const chosenStyle = $derived(styles.find((style) => style._id === styleId));
	const previous = $derived(styles.find((style) => style._id === chosenStyle?.parent));
	const changes = $derived(
		chosenStyle && previous
			? Object.entries(chosenStyle.tendencies)
					.filter(([key, value]) => previous.tendencies[key] !== value)
					.map(([key, value]) => `${key}: ${previous.tendencies[key]} → ${value}`)
			: []
	);
	function accept(body: {
		bots: Bot[];
		styles: Style[];
		enabledBotIds: string[];
		artwork: typeof artwork;
		defaults: Config;
	}) {
		bots = body.bots;
		styles = body.styles;
		enabled = body.enabledBotIds;
		artwork = body.artwork;
		defaults = body.defaults;
		if (!selected && bots.length)
			choose(bots.find((bot) => !bot._id.startsWith('legacy-')) ?? bots[0]);
	}
	async function request(body?: Record<string, unknown>) {
		if (busy) return false;
		busy = true;
		error = '';
		notice = '';
		try {
			const { response, body: result } = await club.request(
				'/admin/bots',
				body ? { method: 'POST', body: JSON.stringify(body) } : {}
			);
			if (!response.ok) throw new Error(result.error ?? 'Could not save bots');
			accept(result);
			if (body) notice = 'Saved.';
			return true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not save bots';
			return false;
		} finally {
			busy = false;
		}
	}
	onMount(() => {
		void request();
	});
	function choose(b: Bot) {
		selected = b._id;
		identity = structuredClone($state.snapshot(b));
		traits = b.personality?.traits?.join(', ') ?? '';
		retireRequested = false;
		createOpen = false;
		const style =
			styles.find((s) => s._id === b.currentStyle) ?? styles.find((s) => s.botId === b._id);
		if (style) inspect(style);
		else {
			styleId = '';
			configText = JSON.stringify(defaults, null, 2);
		}
	}
	function inspect(style: Style) {
		styleId = style._id;
		configText = JSON.stringify(
			{
				policy: style.policy,
				supportedGames: style.supportedGames,
				supportedVariants: style.supportedVariants,
				tendencies: style.tendencies,
				difficulty: { declared: style.difficulty.declared },
				source: style.source ?? 'manual',
				notes: style.notes ?? ''
			},
			null,
			2
		);
	}
	async function saveIdentity(create: boolean) {
		const ok = await request({
			action: create ? 'create' : 'identity',
			botId: create ? slug : selected,
			identity: {
				...$state.snapshot(identity),
				personality: {
					title: identity.personality.title,
					traits: traits
						.split(',')
						.map((s) => s.trim())
						.filter(Boolean)
				}
			}
		});
		if (ok && create) {
			createOpen = false;
			const created = bots.find((b) => b._id === slug);
			if (created) choose(created);
		}
	}
	async function saveStyle(edit: boolean) {
		try {
			const config = JSON.parse(configText);
			const ok = await request({
				action: edit ? 'edit-style' : 'draft',
				botId: selected,
				styleId,
				revision: chosenStyle?.revision,
				config
			});
			if (ok) {
				const draft = styles.find((s) => s.botId === selected && s.status === 'draft');
				if (draft) inspect(draft);
			}
		} catch {
			error = 'Enter valid JSON for the style configuration.';
		}
	}
</script>

<div class="admin-bots">
	<a class="back" href="/admin">← Club admin</a>
	<header>
		<div>
			<p class="eyebrow">OWNER TOOLS</p>
			<h1>The character room</h1>
		</div>
		<button
			class="primary"
			onclick={() => {
				createOpen = true;
				identity = {
					name: '',
					description: '',
					avatar: { mascotId: artwork[0]?.mascotId },
					personality: { title: '', traits: [] }
				};
				traits = '';
				slug = '';
			}}>Create a character</button
		>
	</header>
	{#if error}<p role="alert" class="error">{error}</p>{/if}{#if notice}<p
			role="status"
			class="notice"
		>
			{notice}
		</p>{/if}
	<div class="workspace">
		<aside>
			<h2>Available in this club</h2>
			<p class="hint">
				Only active characters can take a new seat. Current tables keep their published style.
			</p>
			{#each bots as b (b._id)}<div class="bot-row">
					<button class:selected={selected === b._id} onclick={() => choose(b)}
						><BotPortrait mascotId={b.avatar?.mascotId} name={b.name} size={56} /><span
							><strong>{b.name}</strong><small>{b.status} · {b.currentStyle ?? 'no style'}</small
							></span
						></button
					>{#if b.status === 'active'}<input
							type="checkbox"
							aria-label={`Enable ${b.name} in club`}
							checked={enabled.includes(b._id)}
							onchange={(event) =>
								(enabled = event.currentTarget.checked
									? [...enabled, b._id]
									: enabled.filter((id) => id !== b._id))}
						/>{/if}
				</div>{/each}
			<button
				disabled={busy}
				onclick={() =>
					request({
						action: 'availability',
						botIds: enabled.filter((id) => bots.some((b) => b._id === id && b.status === 'active'))
					})}>Save club availability</button
			>
		</aside>
		<div class="editor">
			{#if createOpen || (bot && !bot._id.startsWith('legacy-'))}
				<section>
					<h2>{createOpen ? 'New character · draft' : bot?.name}</h2>
					{#if createOpen}<label
							>Permanent slug<input
								bind:value={slug}
								placeholder="lowercase-name"
								maxlength="48"
							/></label
						>{/if}
					<fieldset disabled={busy || (!createOpen && bot?.status !== 'draft')}>
						<label>Name<input bind:value={identity.name} maxlength="24" /></label><label
							>Playing style title<input
								bind:value={identity.personality.title}
								maxlength="60"
							/></label
						>
						<label
							>Description<textarea bind:value={identity.description} maxlength="400" rows="3"
							></textarea></label
						><label>Personality traits, separated by commas<input bind:value={traits} /></label>
						<label
							>Approved artwork<select bind:value={identity.avatar.mascotId}
								>{#each artwork as art (art.id)}<option value={art.mascotId}>{art.name}</option
									>{/each}</select
							></label
						>
						<button onclick={() => saveIdentity(createOpen)}
							>{createOpen ? 'Create draft identity' : 'Save draft identity'}</button
						>
					</fieldset>
					{#if !createOpen && bot}
						<p class="hint">
							Identity: {bot._id} · {bot.status}. Published names and artwork stay stable.
						</p>
						<div class="actions">
							<button
								disabled={busy || bot.status === 'active' || bot.status === 'retired'}
								onclick={() => request({ action: 'status', botId: selected, status: 'active' })}
								>Enable globally</button
							><button
								disabled={busy || bot.status !== 'active'}
								onclick={() => request({ action: 'status', botId: selected, status: 'disabled' })}
								>Disable globally</button
							><button
								disabled={busy || bot.status === 'retired'}
								onclick={() => (retireRequested = true)}>Retire…</button
							>
						</div>
						{#if retireRequested}<div class="retire">
								<p>
									Retire {bot.name} permanently? They will leave new-table selection. Existing seats and
									history stay intact.
								</p>
								<button
									disabled={busy}
									onclick={async () => {
										if (await request({ action: 'status', botId: selected, status: 'retired' }))
											retireRequested = false;
									}}>Retire permanently</button
								><button onclick={() => (retireRequested = false)}>Cancel</button>
							</div>{/if}
					{/if}
				</section>
			{/if}
			{#if !createOpen && bot}
				<section>
					<h2>Style lineage</h2>
					<div class="versions">
						{#each versions as style (style._id)}<button
								class:selected={style._id === styleId}
								onclick={() => inspect(style)}
								>{style._id} · {style.status}{style._id === bot.currentStyle
									? ' · current'
									: ''}</button
							>{/each}
					</div>
					{#if chosenStyle}<p class="hint">
							{chosenStyle.policy} · hash {chosenStyle.configHash}<br />Parent: {chosenStyle.parent ??
								'first version'}
						</p>{/if}
					{#if changes.length}<details>
							<summary>Changes from parent</summary>{#each changes as change (change)}<p
									class="hint"
								>
									{change}
								</p>{/each}
						</details>{/if}
					<label
						>Structured style configuration<textarea
							class="config"
							aria-label="Style configuration"
							bind:value={configText}
							readonly={chosenStyle?.status === 'published'}
							rows="23"
							spellcheck="false"></textarea></label
					>
					<p class="hint">
						Teen Patti only. Supported games, policy and every tendency are validated. Unknown or
						ignored options are rejected. AI proposals can enter here as drafts; gameplay runs the
						published policy.
					</p>
					{#if !bot._id.startsWith('legacy-') && bot.status !== 'retired'}
						<div class="actions">
							{#if chosenStyle?.status === 'draft'}<button
									disabled={busy}
									onclick={() => saveStyle(true)}>Save draft changes</button
								><button
									disabled={busy}
									onclick={() => request({ action: 'validate', botId: selected, styleId })}
									>Run validation</button
								><button
									class="primary"
									disabled={busy || !chosenStyle.validation?.passed}
									onclick={() => request({ action: 'publish', botId: selected, styleId })}
									>Publish immutable version</button
								>{:else}<button disabled={busy} onclick={() => saveStyle(false)}
									>Copy into next draft</button
								>{/if}
						</div>
					{/if}
					{#if chosenStyle?.validation}<div class="validation" role="status">
							<strong
								>{chosenStyle.validation.passed ? 'Validation passed' : 'Validation failed'}</strong
							>
							<p>
								{chosenStyle.validation.simulation.hands} simulated hands · {chosenStyle.validation
									.simulation.decisions} decisions · hidden-card invariance {chosenStyle.validation
									.invariance
									? 'passed'
									: 'failed'}
							</p>
							{#each chosenStyle.validation.errors as problem (problem)}<p>{problem}</p>{/each}
							<p class="hint">
								Simulation checks legality and reproducibility. Measured difficulty and
								predictability need more evidence.
							</p>
						</div>{/if}
				</section>
			{/if}
		</div>
	</div>
</div>

<style>
	.admin-bots {
		max-width: 1200px;
		margin: auto;
		padding: 2rem 1rem 5rem;
		color: #eee5d0;
	}
	.back,
	.hint {
		color: #a2ac9b;
		font-size: 0.76rem;
		line-height: 1.6;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin: 2rem 0;
	}
	.eyebrow {
		color: #d5b871;
		font-size: 0.65rem;
		letter-spacing: 0.15em;
	}
	h1 {
		font-size: clamp(1.8rem, 4vw, 2.8rem);
		font-weight: 750;
		letter-spacing: -0.04em;
	}
	h2 {
		font-size: 1.1rem;
		font-weight: 700;
		margin-bottom: 1rem;
	}
	.workspace {
		display: grid;
		grid-template-columns: 310px minmax(0, 1fr);
		gap: 2.5rem;
	}
	aside {
		min-width: 0;
	}
	section {
		border-top: 1px solid #ffffff20;
		padding: 1.5rem 0;
	}
	.bot-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.35rem 0;
	}
	.bot-row button {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem;
		flex: 1;
		min-width: 0;
		text-align: left;
	}
	small {
		display: block;
		color: #a4ae9d;
		font-size: 0.65rem;
	}
	.bot-row strong {
		font-size: 0.8rem;
	}
	button {
		border: 1px solid #ffffff26;
		border-radius: 0.5rem;
		padding: 0.6rem 0.8rem;
		color: #e9dfc5;
		font-size: 0.75rem;
		cursor: pointer;
	}
	button:hover,
	button.selected {
		background: #d4b46818;
		border-color: #bfa15b;
	}
	button:disabled {
		opacity: 0.4;
		cursor: default;
	}
	button.primary {
		background: #d3b774;
		color: #151c15;
		font-weight: 700;
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.76rem;
		margin: 1rem 0;
	}
	input:not([type='checkbox']),
	select,
	textarea {
		width: 100%;
		border: 1px solid #ffffff26;
		border-radius: 0.4rem;
		background: #121e17;
		color: #eee5d0;
		padding: 0.7rem;
	}
	input[type='checkbox'] {
		accent-color: #d3b774;
	}
	fieldset:disabled {
		opacity: 0.6;
	}
	.actions,
	.versions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 1rem 0;
	}
	.config {
		font:
			0.72rem/1.6 ui-monospace,
			monospace;
	}
	.validation,
	.retire {
		border-left: 2px solid #c8b06e;
		padding: 1rem;
		background: #ffffff05;
		font-size: 0.8rem;
		line-height: 1.7;
	}
	.retire button {
		margin: 0.6rem 0.4rem 0 0;
	}
	.error {
		color: #ffa799;
	}
	.notice {
		color: #c8d8b1;
	}
	.error,
	.notice {
		padding: 0.8rem 0;
	}
	@media (max-width: 750px) {
		.workspace {
			grid-template-columns: 1fr;
			gap: 1rem;
		}
		aside {
			max-height: 420px;
			overflow-y: auto;
		}
		header {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
