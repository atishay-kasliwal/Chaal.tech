<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, X } from '@lucide/svelte';
	import { serverURL } from '#lib/config.js';

	/**
	 * Game-night availability, opened from a personal link in the email. No sign-in: the link says
	 * who you are. People add the stretches they are free (day, from, to); each shows in India time
	 * and US Eastern time.
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

	const HOUR = 60 * 60 * 1000;
	const plusHour = (iso: string) => new Date(new Date(iso).getTime() + HOUR).toISOString();

	// The add form: a day, then a start hour and an end hour on it, in the chosen zone.
	let dayIndex = $state(0);
	let fromIndex = $state(0);
	let toIndex = $state(1);
	const dayHours = $derived(groups[dayIndex]?.[1] ?? []);
	// Ends are the hour after each start: "until 10:30 PM".
	const ends = $derived(dayHours.map(plusHour));
	$effect(() => {
		// Keep the form valid when the day or zone changes.
		if (dayIndex >= groups.length) dayIndex = 0;
		if (fromIndex >= dayHours.length) fromIndex = 0;
		if (toIndex <= fromIndex || toIndex > dayHours.length)
			toIndex = Math.min(fromIndex + 1, dayHours.length);
	});
	const adding = $derived(dayHours.slice(fromIndex, toIndex));

	function addRange() {
		if (!adding.length) return;
		picked = [...new Set([...picked, ...adding])].sort();
		justSaved = false;
	}

	/** Picked hours merged into unbroken stretches, for the list. */
	const ranges = $derived.by(() => {
		const runs: string[][] = [];
		for (const slot of picked) {
			const run = runs.at(-1);
			if (run && plusHour(run[run.length - 1]) === slot) run.push(slot);
			else runs.push([slot]);
		}
		return runs;
	});
	const span = (run: string[], z: Zone) => {
		const end = plusHour(run[run.length - 1]);
		const endDay = day(end, z) !== day(run[0], z) ? ` (${day(end, z)})` : '';
		return `${day(run[0], z)}, ${time(run[0], z)} – ${time(end, z)}${endDay}`;
	};
	function removeRange(run: string[]) {
		picked = picked.filter((slot) => !run.includes(slot));
		justSaved = false;
	}

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
			<p class="note">Teen Patti night. Add the times you’re free; add as many as you like.</p>
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

		<section class="card">
			<h2>Add a time you’re free <small>{ZONES[zone].label} time</small></h2>
			<div class="form">
				<label
					><span>Day</span>
					<select bind:value={dayIndex}>
						{#each groups as [label], index (label)}
							<option value={index}>{label}</option>
						{/each}
					</select></label
				>
				<label
					><span>From</span>
					<select bind:value={fromIndex}>
						{#each dayHours as slot, index (slot)}
							<option value={index}>{time(slot, zone)}</option>
						{/each}
					</select></label
				>
				<label
					><span>To</span>
					<select bind:value={toIndex}>
						{#each ends as end, index (end)}
							{#if index >= fromIndex}<option value={index + 1}>{time(end, zone)}</option>{/if}
						{/each}
					</select></label
				>
			</div>
			{#if adding.length}
				<p class="convert">
					<span>{span(adding, zone)} <em>{ZONES[zone].short}</em></span>
					<span class="eq">=</span>
					<span>{span(adding, other)} <em>{ZONES[other].short}</em></span>
				</p>
			{/if}
			<button type="button" class="add" onclick={addRange} disabled={!adding.length}
				><Plus size={16} /> Add this time</button
			>
		</section>

		<section class="card summary">
			<h2>Your times <small>{ranges.length}</small></h2>
			{#if ranges.length}
				<ul>
					{#each ranges as run (run[0])}
						<li>
							<div class="both">
								<span>{span(run, zone)} <em>{ZONES[zone].short}</em></span>
								<span class="other">{span(run, other)} <em>{ZONES[other].short}</em></span>
							</div>
							<button
								type="button"
								class="remove"
								aria-label="Remove {span(run, zone)}"
								onclick={() => removeRange(run)}><X size={14} /></button
							>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="note">Nothing added yet.</p>
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
	.form {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1fr;
		gap: 0.5rem;
	}
	.form label {
		display: grid;
		gap: 0.25rem;
	}
	.form span {
		color: rgb(241 235 220 / 60%);
		font-size: 0.75rem;
	}
	.form select {
		border: 1px solid rgb(240 209 140 / 25%);
		border-radius: 0.7rem;
		background: rgb(0 0 0 / 30%);
		padding: 0.6rem 0.6rem;
		color: #f1ebdc;
		font-size: 0.95rem;
	}
	.convert {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		border-radius: 0.7rem;
		background: rgb(244 214 140 / 8%);
		padding: 0.55rem 0.7rem;
		font-size: 0.85rem;
	}
	.add {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		border: 1px solid #f4d68c;
		border-radius: 999px;
		padding: 0.6rem 1rem;
		color: #f4d68c;
		font-weight: 700;
		cursor: pointer;
	}
	.add:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.both {
		display: grid;
		gap: 0.1rem;
	}
	.both .other {
		color: rgb(241 235 220 / 60%);
		font-size: 0.8rem;
	}
	.remove {
		display: grid;
		width: 1.8rem;
		height: 1.8rem;
		flex-shrink: 0;
		place-items: center;
		border-radius: 999px;
		color: rgb(241 235 220 / 70%);
		cursor: pointer;
	}
	.remove:hover {
		background: rgb(255 255 255 / 8%);
	}
	.summary ul {
		display: grid;
		gap: 0.3rem;
		font-size: 0.85rem;
	}
	.summary li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.5rem 0.4rem 0.5rem 0.75rem;
	}
	@media (max-width: 480px) {
		.form {
			grid-template-columns: 1fr 1fr;
		}
		.form label:first-child {
			grid-column: 1 / -1;
		}
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
