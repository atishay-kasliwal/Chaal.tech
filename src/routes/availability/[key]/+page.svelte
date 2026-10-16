<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Check } from '@lucide/svelte';
	import { serverURL } from '#lib/config.js';

	/**
	 * Game-night availability, opened from a personal link in the email. No sign-in: the link says
	 * who you are. Every hour shows in India time and US Eastern time.
	 */
	const ZONES = {
		india: { tz: 'Asia/Kolkata', short: 'IST', label: 'India' },
		us: { tz: 'America/New_York', short: 'ET', label: 'US Eastern' }
	} as const;
	type Zone = keyof typeof ZONES;

	let name = $state('');
	let slots = $state<string[]>([]);
	let picked = $state<string[]>([]);
	let savedAt = $state<string | null>(null);
	let error = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let justSaved = $state(false);
	// Show days and the big time in your own zone; the other zone sits underneath.
	let zone = $state<Zone>('india');

	const key = $derived(page.params.key);
	const token = $derived(page.url.searchParams.get('for') ?? '');
	const other = $derived<Zone>(zone === 'india' ? 'us' : 'india');

	const time = (iso: string, z: Zone) =>
		new Intl.DateTimeFormat('en-US', {
			timeZone: ZONES[z].tz,
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(iso));
	const day = (iso: string, z: Zone) =>
		new Intl.DateTimeFormat('en-GB', {
			timeZone: ZONES[z].tz,
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		}).format(new Date(iso));

	/** Hours grouped by calendar day in the chosen zone. */
	const groups = $derived.by(() => {
		const byDay: [string, string[]][] = [];
		for (const slot of slots) {
			const label = day(slot, zone);
			const last = byDay.at(-1);
			if (last?.[0] === label) last[1].push(slot);
			else byDay.push([label, [slot]]);
		}
		return byDay;
	});

	onMount(async () => {
		const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
		if (tz.startsWith('America/')) zone = 'us';
		try {
			const response = await fetch(`${serverURL}/poll/${key}?for=${encodeURIComponent(token)}`);
			const body = await response.json();
			if (!response.ok) throw new Error(body.error);
			name = body.name;
			slots = body.slots;
			picked = body.picked;
			savedAt = body.savedAt;
		} catch (failure) {
			error =
				failure instanceof Error && failure.message
					? failure.message
					: 'Can’t open this right now. Try again in a moment.';
		} finally {
			loading = false;
		}
	});

	function toggle(slot: string) {
		picked = picked.includes(slot) ? picked.filter((s) => s !== slot) : [...picked, slot].sort();
		justSaved = false;
	}

	async function save() {
		saving = true;
		error = '';
		try {
			const response = await fetch(`${serverURL}/poll/${key}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ for: token, slots: picked })
			});
			const body = await response.json();
			if (!response.ok) throw new Error(body.error);
			picked = body.saved;
			savedAt = new Date().toISOString();
			justSaved = true;
		} catch (failure) {
			error =
				failure instanceof Error && failure.message ? failure.message : 'Couldn’t save. Try again.';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:head><title>Game night · Chaal</title></svelte:head>

<div class="poll">
	{#if loading}
		<p class="note">Loading…</p>
	{:else if !name}
		<div class="card center">
			<p class="suits" aria-hidden="true">♠ ♥ ♦ ♣</p>
			<h1>Hmm, this link isn’t working</h1>
			<p class="note">{error}</p>
		</div>
	{:else}
		<header class="card center">
			<p class="suits" aria-hidden="true">♠ ♥ ♦ ♣</p>
			<h1>Hi {name}, when are you free?</h1>
			<p class="note">
				Teen Patti night. Tap every hour that works for you; you can pick as many as you like.
			</p>
			<div class="zones" role="radiogroup" aria-label="Show times in">
				{#each Object.entries(ZONES) as [id, z] (id)}
					<button
						type="button"
						role="radio"
						aria-checked={zone === id}
						class:on={zone === id}
						onclick={() => (zone = id as Zone)}>{z.label} time</button
					>
				{/each}
			</div>
		</header>

		{#each groups as [label, hours] (label)}
			<section class="card">
				<h2>{label} <small>{ZONES[zone].label}</small></h2>
				<div class="hours">
					{#each hours as slot (slot)}
						{@const on = picked.includes(slot)}
						<button
							type="button"
							class="hour"
							class:on
							aria-pressed={on}
							onclick={() => toggle(slot)}
						>
							{#if on}<span class="tick"><Check size={12} strokeWidth={3} /></span>{/if}
							<strong>{time(slot, zone)}</strong>
							<small
								>{time(slot, other)}
								{ZONES[other].short}{day(slot, other) !== day(slot, zone)
									? ` · ${day(slot, other).split(' ')[0]}`
									: ''}</small
							>
						</button>
					{/each}
				</div>
			</section>
		{/each}

		<section class="card summary">
			<h2>Your picks <small>{picked.length}</small></h2>
			{#if picked.length}
				<ul>
					{#each picked as slot (slot)}
						<li>
							<span>{day(slot, 'india')}, {time(slot, 'india')} <em>IST</em></span>
							<span class="eq">=</span>
							<span>{day(slot, 'us')}, {time(slot, 'us')} <em>ET</em></span>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="note">Nothing picked yet.</p>
			{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button class="save" disabled={saving || !picked.length || justSaved} onclick={save}>
				{saving ? 'Saving…' : justSaved ? 'Saved' : savedAt ? 'Update my times' : 'Save my times'}
			</button>
			{#if justSaved}
				<p class="ok" role="status">
					Thanks {name}! We’ll email you the time once everyone has answered. You can change your
					picks from this same link.
				</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.poll {
		display: grid;
		gap: 0.9rem;
		margin: 0 auto;
		max-width: 40rem;
		padding: 1.5rem 1rem 4rem;
		color: #f1ebdc;
	}
	.card {
		display: grid;
		gap: 0.6rem;
		border: 1px solid rgb(240 209 140 / 16%);
		border-radius: 1.2rem;
		background: #0f1a16;
		padding: 1.1rem;
	}
	.center {
		justify-items: center;
		text-align: center;
	}
	.suits {
		color: #e2b862;
		letter-spacing: 0.4em;
	}
	h1 {
		color: #f4d68c;
		font-size: 1.5rem;
		font-weight: 800;
	}
	h2 {
		font-size: 1rem;
		font-weight: 700;
	}
	h2 small {
		margin-left: 0.3rem;
		color: rgb(241 235 220 / 50%);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.note {
		color: rgb(241 235 220 / 65%);
		font-size: 0.88rem;
	}
	.zones {
		display: flex;
		gap: 0.35rem;
	}
	.zones button {
		border: 1px solid rgb(240 209 140 / 22%);
		border-radius: 999px;
		padding: 0.35rem 0.85rem;
		color: rgb(241 235 220 / 75%);
		font-size: 0.82rem;
		cursor: pointer;
	}
	.zones button.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.hours {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(7.2rem, 1fr));
		gap: 0.4rem;
	}
	.hour {
		position: relative;
		display: grid;
		gap: 0.1rem;
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.5rem 0.6rem;
		color: #f1ebdc;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			background 120ms ease;
	}
	.hour:hover {
		border-color: rgb(240 209 140 / 45%);
	}
	.hour strong {
		font-size: 0.95rem;
	}
	.hour small {
		color: rgb(241 235 220 / 55%);
		font-size: 0.72rem;
	}
	.hour.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 16%);
	}
	.hour.on small {
		color: #f4d68c;
	}
	.tick {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		display: grid;
		width: 1.1rem;
		height: 1.1rem;
		place-items: center;
		border-radius: 999px;
		background: #f4d68c;
		color: #24180a;
	}
	.summary ul {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	.summary li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.summary em {
		color: #e2b862;
		font-style: normal;
		font-size: 0.75rem;
	}
	.eq {
		color: rgb(241 235 220 / 40%);
	}
	.save {
		border-radius: 999px;
		background: linear-gradient(#f0d18c, #c9963d);
		padding: 0.8rem 1rem;
		color: #1c1406;
		font-weight: 750;
		cursor: pointer;
	}
	.save:disabled {
		background: rgb(255 255 255 / 12%);
		color: rgb(241 235 220 / 55%);
		cursor: default;
	}
	.ok {
		color: #a6e3bd;
		font-size: 0.85rem;
	}
	.error {
		color: #f3b0a5;
		font-size: 0.85rem;
	}
</style>
