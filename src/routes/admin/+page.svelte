<script lang="ts">
	import { asset } from '$app/paths';
	import ClubGate from '#lib/club/ClubGate.svelte';
	import CharacterAvatar from '#lib/club/CharacterAvatar.svelte';
	import { club, DEFAULT_CLUB_SETTINGS, type ClubSettings } from '#lib/club/club.svelte.js';

	/** Owner tools: the guest list, live tables, table defaults, the table look and beta emails. */
	interface AdminMember {
		memberId: string;
		email: string;
		nickname: string;
		role: 'owner' | 'member';
		status: 'invited' | 'active' | 'suspended';
		characterId: string | null;
		signedIn: boolean;
		betaOptOut: boolean;
		betaSteps: number[];
	}
	interface LobbyTable {
		name: string;
		gameType: string;
		playerCount: number;
		botCount: number;
		maxPlayers: number;
		isStarted: boolean;
		hostName: string | null;
		boot: number | null;
		table: number;
		connectedMembers: string[];
	}

	const TABS = [
		['members', 'Members'],
		['tables', 'Live tables'],
		['defaults', 'Table defaults'],
		['look', 'Look'],
		['beta', 'Beta emails']
	] as const;
	const BOOTS = [5, 10, 20, 50, 100];
	const LIMITS = [0, 64, 128, 256, 512];
	const FELTS = [
		['emerald', 'Emerald', '#1f7a4c'],
		['sapphire', 'Sapphire', '#22568f'],
		['crimson', 'Crimson', '#8c2633'],
		['onyx', 'Onyx', '#33403b']
	] as const;
	const BACKS = [
		['navy', 'Navy'],
		['crimson', 'Crimson'],
		['forest', 'Forest']
	] as const;
	const gameName: Record<string, string> = {
		'teen-patti': 'Teen Patti',
		'texas-holdem': 'Texas Hold’em',
		blackjack: 'Blackjack',
		rummy: 'Indian Rummy'
	};

	let tab = $state<(typeof TABS)[number][0]>('members');
	let members = $state<AdminMember[]>([]);
	let tables = $state<LobbyTable[]>([]);
	let online = $state<string[]>([]);
	let beta = $state<{ label: string } | null>(null);
	let draft = $state<ClubSettings>(structuredClone(DEFAULT_CLUB_SETTINGS));
	let loaded = $state(false);
	let busy = $state(false);
	let error = $state('');
	let notice = $state('');

	// Add-member form.
	let newEmail = $state('');
	let newNickname = $state('');
	let newOwner = $state(false);
	// Beta night (India time, as the emails use).
	let night = $state('');

	const isOwner = $derived(club.member?.role === 'owner');
	const ready = $derived(club.status === 'signedIn' && !!club.member?.onboarded && isOwner);
	const nameOf = (id: string) =>
		members.find((member) => member.memberId === id)?.nickname || 'A friend';
	const settingsChanged = $derived(JSON.stringify(draft) !== JSON.stringify(club.settings));

	function apply(body: {
		members: AdminMember[];
		tables: LobbyTable[];
		online: string[];
		settings: ClubSettings;
		beta: { label: string } | null;
		notice?: string;
	}) {
		members = body.members;
		tables = body.tables;
		online = body.online;
		beta = body.beta;
		club.applySettings(body.settings);
		draft = structuredClone(body.settings);
		notice = body.notice ?? '';
	}

	async function send(payload?: Record<string, unknown>) {
		busy = true;
		error = '';
		try {
			const { response, body } = await club.request(
				'/admin',
				payload ? { method: 'POST', body: JSON.stringify(payload) } : {}
			);
			if (!response.ok) throw new Error(body.error);
			apply(body);
			return true;
		} catch (failure) {
			error =
				failure instanceof Error && failure.message
					? failure.message
					: 'Can’t reach the club right now.';
			return false;
		} finally {
			busy = false;
			loaded = true;
		}
	}

	$effect(() => {
		if (ready) void send();
	});

	async function addFriend(event: Event) {
		event.preventDefault();
		const ok = await send({
			action: 'add',
			email: newEmail,
			nickname: newNickname,
			role: newOwner ? 'owner' : 'member'
		});
		if (ok) {
			notice = `${newNickname || newEmail} is on the guest list. They can sign in with Google now.`;
			newEmail = newNickname = '';
			newOwner = false;
		}
	}

	function saveSettings() {
		void send({ action: 'settings', settings: draft }).then((ok) => {
			if (ok) notice = 'Saved. New tables and every card back use this now.';
		});
	}

	function setNight() {
		// datetime-local gives "YYYY-MM-DDTHH:MM"; the beta emails read it as India time.
		void send({ action: 'beta-night', start: night.replace('T', ' ') });
	}

	const statusLabel = (member: AdminMember) =>
		member.status === 'suspended' ? 'Paused' : member.signedIn ? 'Signed in' : 'Invited';
</script>

<svelte:head><title>Admin · Chaal</title></svelte:head>

<ClubGate>
	<div class="admin">
		<header>
			<p class="eyebrow">Club owner</p>
			<h1>Admin</h1>
		</header>

		{#if !isOwner}
			<p class="note">Only club owners can open this page.</p>
		{:else}
			<nav class="tabs" aria-label="Admin sections">
				{#each TABS as [id, label] (id)}
					<button
						type="button"
						class:on={tab === id}
						aria-current={tab === id ? 'page' : undefined}
						onclick={() => (tab = id)}>{label}</button
					>
				{/each}
			</nav>

			{#if error}<p class="alert error" role="alert">{error}</p>{/if}
			{#if notice}<p class="alert" role="status">{notice}</p>{/if}

			{#if !loaded}
				<p class="note">Loading…</p>
			{:else if tab === 'members'}
				<section class="card">
					<h2>Add a friend</h2>
					<form class="add" onsubmit={addFriend}>
						<input
							bind:value={newEmail}
							type="email"
							required
							placeholder="friend@gmail.com"
							aria-label="Their Google email"
							autocomplete="off"
						/>
						<input
							bind:value={newNickname}
							maxlength="24"
							placeholder="Nickname"
							aria-label="Nickname"
						/>
						<label class="check"><input type="checkbox" bind:checked={newOwner} /> Owner</label>
						<button class="primary" disabled={busy || !newEmail}>Add</button>
					</form>
					<p class="note">They sign in with that Google account. No email is sent.</p>
				</section>

				<section class="card">
					<h2>Guest list <small>{members.length}</small></h2>
					<ul class="rows">
						{#each members as member (member.memberId)}
							{@const self = member.memberId === club.member?.memberId}
							<li class:paused={member.status === 'suspended'}>
								<CharacterAvatar characterId={member.characterId ?? undefined} size={36} />
								<div class="who">
									<strong
										>{member.nickname || member.email}{#if self}
											<span class="you">you</span>{/if}</strong
									>
									<small>{member.email}</small>
								</div>
								<span class="tag" class:owner={member.role === 'owner'}>{member.role}</span>
								<span
									class="tag"
									class:live={online.includes(member.memberId)}
									class:warn={member.status === 'suspended'}
									>{online.includes(member.memberId) ? 'Online' : statusLabel(member)}</span
								>
								<div class="actions">
									{#if member.role === 'member'}
										<button
											disabled={busy}
											onclick={() =>
												send({ action: 'role', memberId: member.memberId, role: 'owner' })}
											>Make owner</button
										>
									{:else if !self}
										<button
											disabled={busy}
											onclick={() =>
												send({ action: 'role', memberId: member.memberId, role: 'member' })}
											>Make member</button
										>
									{/if}
									{#if !self}
										{#if member.status === 'suspended'}
											<button
												disabled={busy}
												onclick={() => send({ action: 'restore', memberId: member.memberId })}
												>Restore</button
											>
										{:else}
											<button
												class="danger"
												disabled={busy}
												onclick={() =>
													confirm(
														`Pause ${member.nickname || member.email}? They are signed out now.`
													) && send({ action: 'pause', memberId: member.memberId })}>Pause</button
											>
										{/if}
									{/if}
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{:else if tab === 'tables'}
				<section class="card">
					<h2>Live tables <small>{tables.length}</small></h2>
					{#if !tables.length}
						<p class="note">No tables open right now.</p>
					{:else}
						<ul class="rows">
							{#each tables as table (table.name)}
								<li>
									<div class="who">
										<strong>{gameName[table.gameType] ?? table.gameType}</strong>
										<small>
											{table.hostName
												? `Host ${table.hostName} · `
												: ''}{table.playerCount}/{table.maxPlayers}
											seated{table.botCount ? ` · ${table.botCount} bots` : ''}{table.boot
												? ` · boot ₹${table.boot}`
												: ''}
										</small>
										{#if table.connectedMembers.length}
											<small class="names">{table.connectedMembers.map(nameOf).join(', ')}</small>
										{/if}
									</div>
									<span class="tag" class:live={table.isStarted}
										>{table.isStarted ? 'Playing' : 'Waiting'}</span
									>
									<a class="open" href="/{table.name}">Open</a>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			{:else if tab === 'defaults'}
				<section class="card">
					<h2>Table defaults</h2>
					<p class="note">What a new table starts with. Hosts can still change it per game.</p>
					<label class="field"
						><span>Starting chips per player</span>
						<input
							type="number"
							min="1000"
							max="1000000"
							step="100"
							bind:value={draft.table.chips}
						/></label
					>
					<div class="field">
						<span>Boot</span>
						<div class="pills">
							{#each BOOTS as value (value)}
								<button
									type="button"
									class:on={draft.table.boot === value}
									disabled={value * 20 > draft.table.chips}
									onclick={() => (draft.table.boot = value)}>₹{value}</button
								>
							{/each}
						</div>
					</div>
					<div class="field">
						<span>Pot limit</span>
						<div class="pills">
							{#each LIMITS as value (value)}
								<button
									type="button"
									class:on={draft.table.potLimit === value}
									onclick={() => (draft.table.potLimit = value)}
									>{value
										? `₹${(value * draft.table.boot).toLocaleString('en-IN')}`
										: 'Off'}</button
								>
							{/each}
						</div>
					</div>
					<button class="primary" disabled={busy || !settingsChanged} onclick={saveSettings}
						>Save defaults</button
					>
				</section>
			{:else if tab === 'look'}
				<section class="card">
					<h2>Table look</h2>
					<p class="note">Everyone at every table sees this.</p>
					<div class="field">
						<span>Felt</span>
						<div class="swatches">
							{#each FELTS as [id, label, color] (id)}
								<button
									type="button"
									class="swatch"
									class:on={draft.look.felt === id}
									style:--swatch={color}
									onclick={() => (draft.look.felt = id)}
									><span class="felt-dot"></span>{label}</button
								>
							{/each}
						</div>
					</div>
					<div class="field">
						<span>Card back</span>
						<div class="backs">
							{#each BACKS as [id, label] (id)}
								<button
									type="button"
									class="back"
									class:on={draft.look.cardBack === id}
									onclick={() => (draft.look.cardBack = id)}
								>
									<img src={asset(`cards/back-${id}.svg`)} alt="" />
									{label}
								</button>
							{/each}
						</div>
					</div>
					<button class="primary" disabled={busy || !settingsChanged} onclick={saveSettings}
						>Save look</button
					>
				</section>
			{:else if tab === 'beta'}
				<section class="card">
					<h2>Beta game night</h2>
					{#if beta}
						<p>Set for <strong>{beta.label}</strong>.</p>
					{:else}
						<p class="note">Not picked yet. Day 1 asks everyone which night suits them.</p>
						<div class="add">
							<input
								type="datetime-local"
								bind:value={night}
								aria-label="Game night (India time)"
							/>
							<button class="primary" disabled={busy || !night} onclick={setNight}>Set night</button
							>
						</div>
						<p class="note">India time. Picking it lets you send day 2 and day 3.</p>
					{/if}
				</section>
				<section class="card">
					<h2>Who got what</h2>
					<ul class="rows">
						{#each members.filter((m) => m.status !== 'suspended') as member (member.memberId)}
							<li>
								<div class="who">
									<strong>{member.nickname || member.email}</strong>
									<small
										>{member.betaOptOut
											? 'No beta emails'
											: member.betaSteps.length
												? `Sent day ${member.betaSteps.join(', ')}`
												: 'Nothing sent yet'}</small
									>
								</div>
								{#if !member.betaOptOut}
									<button
										disabled={busy}
										onclick={() => send({ action: 'beta-send', memberId: member.memberId })}
										>Send what's due</button
									>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/if}
	</div>
</ClubGate>

<style>
	.admin {
		display: grid;
		gap: 1.1rem;
		margin: 0 auto;
		max-width: 46rem;
		padding: 1.5rem 0.5rem 3rem;
		color: #f1ebdc;
	}
	.eyebrow {
		color: #e2b862;
		font-size: 0.8rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	h1 {
		font-size: 1.7rem;
		font-weight: 700;
	}
	h2 {
		margin-bottom: 0.7rem;
		font-size: 1.1rem;
		font-weight: 700;
	}
	h2 small {
		color: rgb(241 235 220 / 50%);
		font-size: 0.85rem;
	}
	.tabs {
		display: flex;
		gap: 0.35rem;
		overflow-x: auto;
	}
	.tabs button {
		flex-shrink: 0;
		border: 1px solid rgb(240 209 140 / 18%);
		border-radius: 999px;
		padding: 0.45rem 0.95rem;
		color: rgb(241 235 220 / 75%);
		font-size: 0.85rem;
		cursor: pointer;
	}
	.tabs button.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.card {
		display: grid;
		gap: 0.6rem;
		border: 1px solid rgb(240 209 140 / 16%);
		border-radius: 1.2rem;
		background: #0f1a16;
		padding: 1.1rem;
	}
	.note {
		color: rgb(241 235 220 / 60%);
		font-size: 0.82rem;
	}
	.alert {
		border-radius: 0.8rem;
		background: rgb(95 211 138 / 12%);
		padding: 0.6rem 0.9rem;
		color: #a6e3bd;
		font-size: 0.85rem;
	}
	.alert.error {
		background: rgb(240 113 95 / 14%);
		color: #f3b0a5;
	}
	.add {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.add input:not([type='checkbox']),
	.field input {
		min-width: 0;
		flex: 1 1 10rem;
		border: 1px solid rgb(240 209 140 / 20%);
		border-radius: 0.7rem;
		background: rgb(0 0 0 / 25%);
		padding: 0.6rem 0.75rem;
		color: #f1ebdc;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.85rem;
	}
	.primary {
		border-radius: 999px;
		background: linear-gradient(#f0d18c, #c9963d);
		padding: 0.6rem 1.2rem;
		color: #1c1406;
		font-weight: 700;
		cursor: pointer;
	}
	.primary:disabled {
		background: rgb(255 255 255 / 12%);
		color: rgb(241 235 220 / 50%);
		cursor: default;
	}
	.rows {
		display: grid;
		gap: 0.4rem;
	}
	.rows li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
		border-radius: 0.9rem;
		background: rgb(255 255 255 / 3%);
		padding: 0.55rem 0.7rem;
	}
	.rows li.paused {
		opacity: 0.6;
	}
	.who {
		display: flex;
		min-width: 9rem;
		flex: 1;
		flex-direction: column;
		line-height: 1.25;
	}
	.who small {
		color: rgb(241 235 220 / 55%);
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}
	.who .names {
		color: #a6e3bd;
	}
	.you {
		margin-left: 0.3rem;
		color: rgb(241 235 220 / 50%);
		font-size: 0.75rem;
		font-weight: 500;
	}
	.tag {
		border-radius: 999px;
		background: rgb(255 255 255 / 6%);
		padding: 0.15rem 0.55rem;
		color: rgb(241 235 220 / 70%);
		font-size: 0.7rem;
		text-transform: capitalize;
	}
	.tag.owner {
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.tag.live {
		background: rgb(95 211 138 / 14%);
		color: #8fe0ad;
	}
	.tag.warn {
		background: rgb(240 113 95 / 14%);
		color: #f3b0a5;
	}
	.actions {
		display: flex;
		gap: 0.35rem;
	}
	.actions button,
	.rows li > button,
	.open {
		border: 1px solid rgb(240 209 140 / 22%);
		border-radius: 999px;
		padding: 0.3rem 0.7rem;
		color: #f4d68c;
		font-size: 0.75rem;
		cursor: pointer;
	}
	.actions button.danger {
		border-color: rgb(240 113 95 / 35%);
		color: #f3b0a5;
	}
	.field {
		display: grid;
		gap: 0.4rem;
	}
	.field > span {
		color: rgb(241 235 220 / 70%);
		font-size: 0.8rem;
	}
	.pills,
	.swatches,
	.backs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.pills button,
	.swatch,
	.back {
		border: 1px solid rgb(240 209 140 / 20%);
		border-radius: 999px;
		padding: 0.35rem 0.8rem;
		color: #f1ebdc;
		font-size: 0.8rem;
		cursor: pointer;
	}
	.pills button.on,
	.swatch.on,
	.back.on {
		border-color: #f4d68c;
		background: rgb(244 214 140 / 14%);
		color: #f4d68c;
	}
	.pills button:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.swatch {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}
	.felt-dot {
		width: 1.1rem;
		height: 1.1rem;
		border-radius: 999px;
		background: radial-gradient(
			circle at 40% 35%,
			color-mix(in srgb, var(--swatch), white 18%),
			var(--swatch)
		);
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 30%);
	}
	.back {
		display: grid;
		justify-items: center;
		gap: 0.3rem;
		border-radius: 0.9rem;
		padding: 0.5rem;
	}
	.back img {
		width: 3.6rem;
		border-radius: 0.3rem;
		box-shadow: 0 3px 8px rgb(0 0 0 / 45%);
	}
</style>
