<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Plus, X, Check, Clock } from '@lucide/svelte';
	import { serverURL } from '#lib/config.js';

	/**
	 * Game-night availability, opened from a personal link in the email. No sign-in: the link says
	 * who you are. People add the stretches they are free (a quick pick or day / from / to); each
	 * shows in India time and US Eastern time.
	 */
	const ZONES = {
		india: { tz: 'Asia/Kolkata', short: 'IST', label: 'India', flag: '🇮🇳' },
		us: { tz: 'America/New_York', short: 'ET', label: 'US Eastern', flag: '🇺🇸' }
	} as const;
	type Zone = keyof typeof ZONES;

	/** One-tap stretches in each zone's own day: [label, start hour (local, 24h), hours]. */
	const QUICK: Record<Zone, [string, number, number][]> = {
		india: [
			['Morning', 9, 3],
			['Afternoon', 14, 4],
			['Evening', 19, 3],
			['Late night', 21, 3]
		],
		us: [
			['Morning', 8.5, 3],
			['Afternoon', 12.5, 4],
			['Evening', 18.5, 3],
			['Late night', 20.5, 3]
		]
	};
	/** Where the from/to pickers start: early evening in your zone. */
	const DEFAULT_START: Record<Zone, number> = { india: 19, us: 18.5 };

	let name = $state('');
	let slots = $state<string[]>([]);
	let picked = $state<string[]>([]);
	let savedAt = $state<string | null>(null);
	let error = $state('');
	let loading = $state(true);
	let saving = $state(false);
	let justSaved = $state(false);
	// Show days and the big time in your own zone; the other zone sits beside it.
	let zone = $state<Zone>('india');

	const key = $derived(page.params.key);
	const token = $derived(page.url.searchParams.get('for') ?? '');
	const other = $derived<Zone>(zone === 'india' ? 'us' : 'india');
	const firstName = $derived(name.split(' ')[0]);

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
	/** Local clock as a number: 18.5 is 6:30 PM. */
	const clock = (iso: string, z: Zone) => {
		const [h, m] = new Intl.DateTimeFormat('en-GB', {
			timeZone: ZONES[z].tz,
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		})
			.format(new Date(iso))
			.split(':')
			.map(Number);
		return h + m / 60;
	};

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
	/** The nights being asked about, in India dates (as the email says). */
	const nights = $derived([...new Set(slots.map((slot) => day(slot, 'india')))].join(' or '));

	const HOUR = 60 * 60 * 1000;
	const plusHour = (iso: string) => new Date(new Date(iso).getTime() + HOUR).toISOString();

	// The custom picker: a day, then a start and an end hour on it, in the chosen zone.
	let dayIndex = $state(0);
	let fromIndex = $state(0);
	let toIndex = $state(1);
	const dayHours = $derived(groups[dayIndex]?.[1] ?? []);
	// Ends are the hour after each start: "until 10:30 PM".
	const ends = $derived(dayHours.map(plusHour));
	const adding = $derived(dayHours.slice(fromIndex, toIndex));

	/** Start the pickers in the early evening of the chosen day. */
	function resetPicker() {
		const start = dayHours.findIndex((slot) => clock(slot, zone) === DEFAULT_START[zone]);
		fromIndex = start >= 0 ? start : 0;
		toIndex = Math.min(fromIndex + 3, dayHours.length);
	}
	$effect(() => {
		// Keep the pickers valid when the day or zone changes.
		if (dayIndex >= groups.length) dayIndex = 0;
		if (fromIndex >= dayHours.length) fromIndex = 0;
		if (toIndex <= fromIndex || toIndex > dayHours.length)
			toIndex = Math.min(fromIndex + 1, dayHours.length);
	});

	/** Quick picks that exist on the chosen day, with their hours. */
	const quick = $derived(
		QUICK[zone]
			.map(([label, start, hours]) => {
				const first = dayHours.findIndex((slot) => clock(slot, zone) === start);
				return { label, hours: first >= 0 ? dayHours.slice(first, first + hours) : [] };
			})
			.filter((option) => option.hours.length)
	);
	const isPicked = (hours: string[]) => hours.every((slot) => picked.includes(slot));

	function add(hours: string[]) {
		if (!hours.length) return;
		picked = [...new Set([...picked, ...hours])].sort();
		justSaved = false;
	}
	function toggleQuick(hours: string[]) {
		if (isPicked(hours)) picked = picked.filter((slot) => !hours.includes(slot));
		else add(hours);
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
	const hoursOf = (run: string[], z: Zone) => {
		const end = plusHour(run[run.length - 1]);
		return `${time(run[0], z)} – ${time(end, z)}`;
	};
	const dayOf = (run: string[], z: Zone) => day(run[0], z);
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
			resetPicker();
		} catch (failure) {
			error =
				failure instanceof Error && failure.message
					? failure.message
					: 'Can’t open this right now. Try again in a moment.';
		} finally {
			loading = false;
		}
	});

	function chooseZone(next: Zone) {
		zone = next;
		dayIndex = 0;
		resetPicker();
	}
	function chooseDay(index: number) {
		dayIndex = index;
		resetPicker();
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
		<p class="note center-text">Loading…</p>
	{:else if !name}
		<div class="welcome">
			<p class="suits" aria-hidden="true">♠ ♥ ♦ ♣</p>
			<h1>This link isn’t working</h1>
			<p class="lead">{error}</p>
		</div>
	{:else}
		<header class="welcome">
			<div class="cards" aria-hidden="true">
				<span class="card-art c1">A<small>♠</small></span>
				<span class="card-art c2">K<small>♥</small></span>
				<span class="card-art c3">Q<small>♦</small></span>
			</div>
			<p class="eyebrow">Teen Patti night</p>
			<h1>Hey {firstName}, when are you free?</h1>
			<p class="lead">
				We’re picking between <strong>{nights}</strong>. Add every time that works.
			</p>
			<div class="zones" role="radiogroup" aria-label="Show times in">
				{#each Object.entries(ZONES) as [id, z] (id)}
					<button
						type="button"
						role="radio"
						aria-checked={zone === id}
						class:on={zone === id}
						onclick={() => chooseZone(id as Zone)}>{z.flag} {z.label} time</button
					>
				{/each}
			</div>
		</header>

		<section class="panel">
			<div class="days" role="tablist" aria-label="Day">
				{#each groups as [label], index (label)}
					<button
						type="button"
						role="tab"
						aria-selected={dayIndex === index}
						class:on={dayIndex === index}
						onclick={() => chooseDay(index)}
						>{label.split(' ')[0]}<small>{label.split(' ').slice(1).join(' ')}</small></button
					>
				{/each}
			</div>

			{#if quick.length}
				<p class="label">Quick picks</p>
				<div class="quick">
					{#each quick as option (option.label)}
						{@const on = isPicked(option.hours)}
						<button type="button" class="chip" class:on onclick={() => toggleQuick(option.hours)}>
							{#if on}<span class="tick"><Check size={12} strokeWidth={3} /></span>{/if}
							<strong>{option.label}</strong>
							<span>{hoursOf(option.hours, zone)}</span>
							<small>{ZONES[other].flag} {hoursOf(option.hours, other)}</small>
						</button>
					{/each}
				</div>
			{/if}

			<p class="label">Or choose your own</p>
			<div class="custom">
				<label
					><span>From</span>
					<select bind:value={fromIndex}>
						{#each dayHours as slot, index (slot)}
							<option value={index}>{time(slot, zone)}</option>
						{/each}
					</select></label
				>
				<span class="dash" aria-hidden="true">–</span>
				<label
					><span>To</span>
					<select bind:value={toIndex}>
						{#each ends as end, index (end)}
							{#if index >= fromIndex}<option value={index + 1}>{time(end, zone)}</option>{/if}
						{/each}
					</select></label
				>
				<button type="button" class="add" onclick={() => add(adding)} disabled={!adding.length}
					><Plus size={16} /> Add</button
				>
			</div>
			{#if adding.length}
				<div class="convert">
					<div>
						<span class="zone-tag">{ZONES[zone].flag} {ZONES[zone].label}</span>
						<strong>{hoursOf(adding, zone)}</strong>
						<small>{dayOf(adding, zone)}</small>
					</div>
					<Clock size={16} class="convert-icon" />
					<div>
						<span class="zone-tag">{ZONES[other].flag} {ZONES[other].label}</span>
						<strong>{hoursOf(adding, other)}</strong>
						<small>{dayOf(adding, other)}</small>
					</div>
				</div>
			{/if}
		</section>

		<section class="panel">
			<h2>
				Your times {#if ranges.length}<span class="count">{ranges.length}</span>{/if}
			</h2>
			{#if ranges.length}
				<ul class="times">
					{#each ranges as run (run[0])}
						<li>
							<div class="when">
								<strong>{dayOf(run, zone)} · {hoursOf(run, zone)}</strong>
								<small
									>{ZONES[other].flag}
									{dayOf(run, other)} · {hoursOf(run, other)}
									{ZONES[other].short}</small
								>
							</div>
							<button
								type="button"
								class="remove"
								aria-label="Remove {dayOf(run, zone)} {hoursOf(run, zone)}"
								onclick={() => removeRange(run)}><X size={15} /></button
							>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">Nothing added yet. Tap a quick pick above to start.</p>
			{/if}
			{#if error}<p class="error" role="alert">{error}</p>{/if}
			<button class="save" disabled={saving || !picked.length || justSaved} onclick={save}>
				{#if justSaved}<Check size={18} strokeWidth={3} /> Saved{:else}{saving
						? 'Saving…'
						: savedAt
							? 'Update my times'
							: 'Save my times'}{/if}
			</button>
			{#if justSaved}
				<p class="ok" role="status">
					Thanks {firstName}! We’ll email you the time once everyone has answered. You can change
					your times from this same link.
				</p>
			{/if}
		</section>
	{/if}
</div>

<style>
	.poll {
		display: grid;
		gap: 1rem;
		margin: 0 auto;
		max-width: 38rem;
		padding: 1.5rem 1rem 4rem;
		color: #f8f2e5;
	}
	.center-text {
		text-align: center;
	}
	/* Felt-green welcome, lit like the table. (Not ".hero": the UI library styles that class.) */
	.welcome {
		position: relative;
		display: grid;
		justify-items: center;
		gap: 0.55rem;
		overflow: hidden;
		border: 1px solid rgb(242 220 145 / 22%);
		border-radius: 1.5rem;
		background:
			radial-gradient(ellipse 70% 60% at 50% 0%, rgb(255 230 170 / 16%), transparent 70%),
			radial-gradient(ellipse at 50% 40%, #1f7a4c, #145034 55%, #0b3622);
		padding: 2rem 1.25rem 1.5rem;
		text-align: center;
		box-shadow: 0 1.2rem 2.5rem rgb(0 0 0 / 45%);
	}
	.cards {
		position: relative;
		height: 4.4rem;
		width: 7rem;
		margin-bottom: 0.3rem;
	}
	.card-art {
		position: absolute;
		top: 0;
		left: 50%;
		display: grid;
		width: 2.9rem;
		height: 4.1rem;
		place-items: center;
		align-content: center;
		border-radius: 0.4rem;
		background: #fffdf7;
		box-shadow: 0 0.4rem 0.9rem rgb(0 0 0 / 40%);
		color: #111;
		font:
			800 1.15rem/1 Georgia,
			serif;
		transform-origin: 50% 120%;
	}
	.card-art small {
		font-size: 0.95rem;
	}
	.c1 {
		rotate: -14deg;
		translate: -95% 0.2rem;
	}
	.c2 {
		translate: -50% 0;
		color: #c8102e;
	}
	.c3 {
		rotate: 14deg;
		translate: -5% 0.2rem;
		color: #c8102e;
	}
	.eyebrow {
		color: #f2dc91;
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
	}
	h1 {
		color: #fff7e2;
		font-size: clamp(1.5rem, 5vw, 1.9rem);
		font-weight: 800;
		line-height: 1.15;
		text-shadow: 0 2px 10px rgb(0 0 0 / 35%);
	}
	.lead {
		max-width: 26rem;
		color: rgb(255 247 226 / 80%);
		font-size: 0.95rem;
	}
	.lead strong {
		color: #f2dc91;
	}
	.suits {
		color: #f2dc91;
		letter-spacing: 0.4em;
	}
	.zones {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem;
		margin-top: 0.4rem;
		border-radius: 999px;
		background: rgb(0 0 0 / 25%);
		padding: 0.25rem;
	}
	.zones button {
		border-radius: 999px;
		padding: 0.4rem 0.9rem;
		color: rgb(255 247 226 / 75%);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.zones button.on {
		background: #f2dc91;
		color: #211c2e;
		font-weight: 700;
	}
	.panel {
		display: grid;
		gap: 0.75rem;
		border: 1px solid rgb(242 220 145 / 14%);
		border-radius: 1.3rem;
		background: #2c263b;
		padding: 1.1rem;
	}
	.label {
		color: var(--muted);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}
	.days {
		display: grid;
		grid-auto-columns: 1fr;
		grid-auto-flow: column;
		gap: 0.4rem;
	}
	.days button {
		display: grid;
		gap: 0.05rem;
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 0.9rem;
		padding: 0.55rem;
		color: rgb(248 242 229 / 75%);
		font-size: 1rem;
		font-weight: 750;
		cursor: pointer;
	}
	.days button small {
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.days button.on {
		border-color: #f2dc91;
		background: rgb(242 220 145 / 14%);
		color: #f2dc91;
	}
	.days button.on small {
		color: rgb(242 220 145 / 75%);
	}
	.quick {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}
	.chip {
		position: relative;
		display: grid;
		gap: 0.1rem;
		border: 1px solid rgb(255 255 255 / 10%);
		border-radius: 1rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.65rem 0.8rem;
		color: #f8f2e5;
		text-align: left;
		cursor: pointer;
		transition:
			border-color 120ms ease,
			background 120ms ease,
			transform 120ms ease;
	}
	.chip:hover {
		border-color: rgb(242 220 145 / 45%);
		transform: translateY(-1px);
	}
	.chip strong {
		font-size: 0.95rem;
	}
	.chip span {
		font-size: 0.85rem;
	}
	.chip small {
		color: var(--muted);
		font-size: 0.72rem;
	}
	.chip.on {
		border-color: #f2dc91;
		background: linear-gradient(140deg, rgb(242 220 145 / 22%), rgb(242 220 145 / 8%));
	}
	.chip.on strong,
	.chip.on span {
		color: #f2dc91;
	}
	.chip.on .tick {
		color: #211c2e;
	}
	.tick {
		position: absolute;
		top: 0.55rem;
		right: 0.55rem;
		display: grid;
		width: 1.2rem;
		height: 1.2rem;
		place-items: center;
		border-radius: 999px;
		background: #f2dc91;
		color: #211c2e;
	}
	.custom {
		display: grid;
		grid-template-columns: 1fr auto 1fr auto;
		align-items: end;
		gap: 0.5rem;
	}
	.custom label {
		display: grid;
		gap: 0.25rem;
	}
	.custom label span {
		color: var(--muted);
		font-size: 0.72rem;
	}
	.custom select {
		border: 1px solid rgb(242 220 145 / 25%);
		border-radius: 0.75rem;
		background: rgb(0 0 0 / 30%);
		padding: 0.6rem;
		color: #f8f2e5;
		font-size: 0.95rem;
	}
	.dash {
		padding-bottom: 0.6rem;
		color: var(--muted);
	}
	.add {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		border-radius: 0.75rem;
		background: #f2dc91;
		padding: 0.62rem 0.9rem;
		color: #211c2e;
		font-weight: 750;
		cursor: pointer;
	}
	.add:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.convert {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 0.6rem;
		border-radius: 1rem;
		background: rgb(242 220 145 / 7%);
		padding: 0.7rem 0.85rem;
	}
	.convert div {
		display: grid;
		gap: 0.1rem;
	}
	.convert div:last-child {
		text-align: right;
	}
	.convert :global(.convert-icon) {
		color: rgb(242 220 145 / 60%);
	}
	.zone-tag {
		color: var(--muted);
		font-size: 0.7rem;
	}
	.convert strong {
		font-size: 0.95rem;
	}
	.convert small {
		color: var(--muted);
		font-size: 0.75rem;
	}
	h2 {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 1.05rem;
		font-weight: 750;
	}
	.count {
		display: grid;
		min-width: 1.4rem;
		height: 1.4rem;
		place-items: center;
		border-radius: 999px;
		background: rgb(242 220 145 / 16%);
		padding: 0 0.35rem;
		color: #f2dc91;
		font-size: 0.75rem;
	}
	.times {
		display: grid;
		gap: 0.4rem;
	}
	.times li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-left: 3px solid #f2dc91;
		border-radius: 0.8rem;
		background: rgb(255 255 255 / 4%);
		padding: 0.6rem 0.5rem 0.6rem 0.85rem;
	}
	.when {
		display: grid;
		gap: 0.1rem;
	}
	.when strong {
		font-size: 0.92rem;
	}
	.when small {
		color: var(--muted);
		font-size: 0.78rem;
	}
	.remove {
		display: grid;
		width: 1.9rem;
		height: 1.9rem;
		flex-shrink: 0;
		place-items: center;
		border-radius: 999px;
		color: rgb(248 242 229 / 65%);
		cursor: pointer;
	}
	.remove:hover {
		background: rgb(255 255 255 / 8%);
		color: #f3b0a5;
	}
	.empty,
	.note {
		color: var(--muted);
		font-size: 0.88rem;
	}
	.save {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		border-radius: 999px;
		background: linear-gradient(#f2dc91, #f2dc91);
		padding: 0.85rem 1rem;
		color: #211c2e;
		font-size: 1rem;
		font-weight: 800;
		box-shadow: 0 0.5rem 1.2rem rgb(201 150 61 / 30%);
		cursor: pointer;
	}
	.save:disabled {
		background: rgb(255 255 255 / 10%);
		box-shadow: none;
		color: var(--muted);
		cursor: default;
	}
	.ok {
		color: #a6e3bd;
		font-size: 0.88rem;
		text-align: center;
	}
	.error {
		color: #f3b0a5;
		font-size: 0.85rem;
	}
	@media (max-width: 480px) {
		.quick {
			gap: 0.4rem;
		}
		.chip {
			padding: 0.6rem 0.65rem;
		}
		.chip span {
			font-size: 0.78rem;
			white-space: nowrap;
		}
		.chip small {
			font-size: 0.68rem;
			white-space: nowrap;
		}
		.convert strong {
			font-size: 0.85rem;
		}
		.custom {
			grid-template-columns: 1fr auto 1fr;
		}
		.add {
			grid-column: 1 / -1;
			justify-content: center;
		}
	}

	.poll {
		max-width: 760px;
		padding: 44px 0 64px;
		gap: 24px;
	}
	.welcome {
		background: var(--butter);
		color: var(--night);
		border: 0;
		border-radius: 18px;
		box-shadow: none;
		padding: 36px 28px;
		gap: 16px;
	}
	.welcome h1 {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: clamp(36px, 5vw, 55px);
		line-height: 1.02;
		letter-spacing: -0.055em;
		color: var(--night);
	}
	.welcome .eyebrow,
	.welcome .lead,
	.welcome .suits {
		color: var(--night);
	}
	.welcome .lead {
		font-size: 15px;
		line-height: 1.6;
		opacity: 0.8;
	}
	.welcome .zones button {
		border-color: #211c2e40;
		color: var(--night);
		background: transparent;
	}
	.welcome .zones button.on {
		background: var(--night);
		color: var(--butter);
	}
	.panel {
		border-color: var(--line);
		background: var(--surface);
		border-radius: 16px;
	}
	.save {
		background: var(--butter);
		box-shadow: none;
	}
	@media (max-width: 600px) {
		.poll {
			padding-top: 28px;
		}
		.welcome {
			padding: 28px 20px;
		}
		.welcome h1 {
			font-size: 36px;
		}
	}

	.welcome h1 {
		text-shadow: none;
	}
	.welcome .lead strong {
		color: inherit;
	}
	.welcome :focus-visible {
		outline-color: var(--night);
	}
</style>
