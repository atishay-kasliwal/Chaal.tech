# Private friends club: execution plan

Status: proposed plan only. No authentication or profile implementation is included.
Audience: one owner and roughly five or six friends.

## Product outcome

Make opening the app feel like returning to the same game night. A first-time invited friend signs in, sees a prepared character and nickname, and joins. A returning friend opens the app, sees who is at the table, and joins without repeating setup. Authentication is visible only when necessary.

Default decisions for execution:
- Google sign-in, with server-managed membership restricted to the owner's approved email addresses.
- Supabase Auth for authentication and Supabase Postgres for membership and profiles.
- Keep SvelteKit on Cloudflare Pages and the existing Worker / Durable Objects game backend.
- One permanent account per friend; profile changes do not change identity.
- A curated character assigned to each friend; first-time customization is optional.
- Club owner and table host are separate permissions. Existing table hosts keep their game controls; only the club owner manages membership.
- Keep current per-room chip balances. Cross-room wallets are a separate future feature.
- Existing public homepage can remain public; lobby, members, profiles, and rooms require membership.

These are working recommendations, not infrastructure already configured. Confirm Google is suitable for everyone before implementation; otherwise use email login within the same membership model.

## What exists today

- `server/cloudflare/worker.mjs` issues anonymous sessions at POST `/session`; it validates those sessions for room creation and WebSockets.
- `server/cloudflare/security.mjs` issues random player identities with signed tokens lasting 365 days.
- `src/lib/stores/game-socket.ts` obtains a session and reconnects automatically.
- `src/lib/stores/socket-store.svelte.ts` saves the game token in localStorage.
- `src/lib/start/player-name.ts` remembers names on the device rather than in an account.
- `src/routes/[roomName]/+page.server.ts` and `src/lib/utils/room.ts` check room existence before rendering. The backend GET `/room/:name` currently has no member authentication.
- Durable Objects own room state, seats, receipts and the chip ledger. Keep those as the game authority.
- Room invitations and media already exist. Sending an invitation currently does not establish a club membership.
- `server/index.mjs` also exposes a separate Node / Socket.IO backend. It must receive equivalent authentication if retained as a reachable service, or be explicitly disabled for production. Protecting only the Cloudflare path is insufficient if another public backend remains reachable.

## Phase 1 — Design the complete journey

Deliverable: reviewable screen designs and navigation states before wiring auth.

1. Invitation entry: discreet club identity, one Google button, return destination preserved.
2. First welcome: prepared character, editable nickname, primary button “Join the club.” Default character is usable immediately; a secondary customization option can wait.
3. Returning lobby: familiar character, greeting, one featured active table, accurate member presence and a clear join action. If there is no active table, show an honest empty state and the existing create-table flow.
4. Table: same nickname and character as the lobby. Continue existing video behavior; use the character as the camera-off fallback.
5. Small profile panel: nickname, character choice and reduced-motion setting.
6. Owner-only member panel: approve email, assign nickname/character, resend invitation, suspend access.
7. Recovery states: wrong Google account, unapproved account, declined OAuth, expired session, offline, full table and game in progress. A six-seat table must show “Full”; membership does not guarantee an available seat.

Acceptance: first visit requires no compulsory avatar builder; returning users do not see a username form or setup wizard. A valid room link survives login and returns to the intended room. Existing join/resume rules remain authoritative.

## Phase 2 — Establish membership and saved identity

Deliverable: migrations, authorization rules, seed procedure and local configuration.

Data model:

| Record | Fields and rules |
| --- | --- |
| club_members | id, normalized invited email (unique), auth_user_id (unique, initially empty), role (owner/member), status (invited/active/suspended), invitation timestamps |
| player_profiles | member_id (primary key), nickname, character_id, accent_id, reduced_motion, onboarding_completed_at, updated_at |
| character_catalog | stable character ID, display name, asset paths, allowed expressions; a versioned local catalog is sufficient initially |
| member_game_identity | member_id (unique), stable game_player_id (unique); never derive this from nickname or accept it from the browser |
| club_tables | room ID, creator member ID, lifecycle, last activity; supports an authenticated lobby directory |

Use database constraints and a transaction to claim an invited membership once. Match only a verified identity email from the provider. Once claimed, authorize through auth_user_id; email or nickname edits never silently transfer membership. Unapproved Google accounts can authenticate with the provider but receive no club data or game access.

Seed the owner using a deployment/admin procedure; never promote the first visitor. Members can edit only their cosmetic profile fields. Roles, status, identity binding and game IDs require trusted server operations. Use row-level security for all exposed tables; exclude email addresses and provider IDs from lobby/room responses. Backend secrets stay server-side.

Acceptance: a member cannot change their role, approve another account, read invitation emails or edit another friend's profile. Suspending a member preserves their profile and historical game data.

## Phase 3 — Connect login to every protected surface

Deliverable: complete authentication and authorization, including game transport.

Frontend:
- Add SvelteKit authentication helpers, callback route and request hooks using the supported Supabase SSR session pattern.
- Validate identity server-side. Do not treat browser state or an unverified session payload as authorization.
- Guard lobby, profile, owner screens and room loaders before loading private data.
- Preserve only validated local return paths through OAuth; reject external redirect targets.
- Refresh sessions quietly; on failure, show one sign-in action while preserving the intended room.
- Clear member-specific caches and close the game connection on logout or account change.

Game backend:
- Replace anonymous issuance in `/session` with verified provider identity plus an active-member lookup.
- Exchange verified login for a short-lived game credential containing the stable game player ID and member binding. Suggested initial lifetime: five minutes, renewed silently while login remains valid.
- Keep the existing WebSocket subprotocol transport and command IDs. Never put credentials in invitation URLs or query strings; redact token-bearing headers in logs.
- Enforce membership for room creation, room metadata, WebSocket upgrade, media credentials and invitation operations.
- Recheck active membership before protected commands, including chip approvals and media operations; for this small group, prefer an authoritative membership read over a complex cache. A membership-store outage fails closed and presents a retryable service error.
- Tie sockets to credential expiry. On expiry require renewed authentication/reconnect; do not erase a seat or reset a hand. Do not leave an authenticated socket authorized indefinitely.
- Suspension closes known active sockets and removes media access; fresh reads prevent further protected commands. Check membership again before sending any subsequent private snapshot; suspension must stop passive updates too.
- Existing table membership, turn, balance and host checks still apply after club authorization.
- Club membership invitations can be sent only by the owner. Existing table invitations can only target approved members and never create membership implicitly.

Acceptance: copying a room URL or presenting an old anonymous game token cannot enter the club. Valid signatures with expired tokens, wrong issuer/audience, or suspended membership fail. Direct HTTP/WebSocket access cannot bypass the UI. Logout closes local gameplay; removal blocks an already-connected member as well as a new connection.

## Phase 4 — Preserve game continuity

Deliverable: account-based reconnects and safe cutover from anonymous sessions.

- Refresh, reconnect and second-device login resolve to the same game player ID.
- Retain existing single-connection takeover behavior; clearly tell the replaced tab that the player continued elsewhere.
- Load nickname/character from a trusted profile. Ignore client claims about another member's identity, balance, role or character ownership.
- Replace required device-name entry with saved profile identity in StartPanel and room join flows. Keep a cosmetic nickname editor in the profile.
- Authentication renewal must not replay commands, charge twice or create a second seat; preserve existing receipts and revision checks.
- Use a deliberate fresh-session cutover for the first private release: finish active games, deploy, and have friends sign in. Do not automatically attach old anonymous balances to an account based on a supplied player ID.
- If historical anonymous seats/balances must be retained, add a separate owner-reviewed migration with proof of both old session possession and new account ownership. This is outside the default first release.

Acceptance: refresh during a hand restores the same seat/cards/balance; reconnect after login expiry does not reset state. Nickname changes do not create new players. Changing Google accounts cannot inherit the previous account's seat or private cache.

## Phase 5 — Build the familiar lobby

Deliverable: `/club` and persistent return navigation.

- Add a protected directory of active rooms. Update it from authoritative room lifecycle events with retry-safe writes and stale-entry reconciliation.
- Add club presence using authenticated heartbeats, for example every 30 seconds while visible with a 90-second stale timeout. Deduplicate by member across tabs/devices. Display “online” and “at the table” separately; room membership comes from the game backend.
- Join calls the existing room admission flow; a room appearing in the directory is not a seat reservation.
- Start with one featured active room and allow the owner/host to start another using current settings. Do not hardwire all future sessions to one indefinitely retained room.
- Reuse approved chip artwork, felt colors and existing layouts.
- During loading, keep the primary action stable and use a brief loading state; never flash an anonymous name form before the profile resolves.

Acceptance: open a bookmarked app URL and join an available table with one action after the page loads. A disconnected friend disappears after the timeout. Stale room entries resolve gracefully without blocking the lobby.

## Phase 6 — Add personal characters

Deliverable: six curated characters and their application across welcome, lobby and table.

For each friend gather a nickname, character direction, favorite accent and optional inside-joke title. Do not require a real photo. Start with fictional personas if references are unavailable.

- Approve one shared art style before generating the full family.
- Export idle, happy/winning and disappointed/losing expressions with consistent crops, transparent backgrounds and optimized delivery sizes.
- Keep expressions cosmetic and driven by public game results. Never reveal folded cards or private hand strength through a character reaction.
- Add one shared CharacterAvatar component with asset-failure fallback and reduced-motion behavior.
- Keep humans distinct from existing bot avatars. Preserve video, mute indicators, timers, card positioning and name readability.
- Save character settings outside room snapshots; project only permitted public presentation fields into game views. Defer live mid-hand profile synchronization if it complicates state preservation; the next join can apply changes.

Acceptance: characters remain recognizable on phones, never cover action controls, and camera-off seats have a polished fallback. Character updates cannot change gameplay.

## Phase 7 — Owner controls and release

Deliverable: usable member management, tested release and operating notes.

Owner controls: invite an approved email, edit an unclaimed welcome profile, assign a character, suspend/reactivate, and resend an invitation with rate limiting. Prevent accidentally removing the last owner. A suspended member cannot regain access merely by reusing an invitation.

Test before release:
- Membership: invited, unapproved, wrong account, duplicate invite, concurrent invite claim, suspended user, forged owner request.
- Auth: OAuth callback failure, unsafe return URL, expiry, renewal, logout and signing-key rotation.
- Transport: unauthorized HTTP/upgrade, an already-open revoked connection, expiry during a hand and account changes.
- Game continuity: same seat across refresh/device takeover, no repeated chip transfers/approvals, no extra seat, no exposed cards.
- Profiles: edit only permitted fields, length limits, unknown character IDs and broken image fallback.
- UX: first-time invitation, repeat visit, full room, empty lobby, offline and phone layout.
- Existing regression suite, Cloudflare integration checks, typecheck, lint and production build with real deployment configuration.

Roll out on a private staging environment with the owner and one friend first. Test Google consent configuration with invited external accounts and verify sessions after a real return visit. Then invite the rest. Deployment rollback must keep private access enforced; do not restore anonymous access as a recovery path. Keep a known-good protected build and database migrations that can be rolled forward safely.

## Suggested implementation slices

| Order | Reviewable result | Completion gate |
| --- | --- | --- |
| 1 | Screen designs and auth/data contract | First-time and repeat flows understood |
| 2 | Provider setup, migrations, owner seed and access tests | Membership is authoritative |
| 3 | Authenticated pages and protected backend, initially using existing avatars | Anonymous access blocked end to end |
| 4 | Stable game identity and reconnects | No lost/duplicated seat or chip action |
| 5 | Private lobby, invitations and owner controls | Owner plus one friend complete the flow |
| 6 | Character family and personal presentation | Approved style and usable mobile seats |
| 7 | Group rehearsal and production cutover | All invited friends can return seamlessly |

Character design can proceed independently once the screen layouts and catalog contract are stable, but production access must wait for backend enforcement and continuity checks.

## Inputs needed before implementation

- Owner's Google email and the approved friend emails; enter these through private configuration/admin tooling rather than a committed document.
- Confirm that everyone can use Google sign-in.
- Access to configure the Google OAuth app, Supabase project and Cloudflare environment.
- For the art phase: nicknames and fictional-versus-personal likeness direction.
- Confirm whether existing anonymous games/balances can finish before the private cutover. Default is a fresh game session, not a silent migration.

Do not block screen design, local schema work or automated authorization tests on character details. No paid plan, invitations or production deployment is implied by this document.

## Official implementation references

- Google sign-in: https://supabase.com/docs/guides/auth/social-login/auth-google
- SSR session and refresh handling: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- JWT verification: https://supabase.com/docs/guides/auth/jwts
- Signing keys: https://supabase.com/docs/guides/auth/signing-keys

Follow the supported session/verification libraries; do not implement provider JWT cryptography manually. Recheck provider configuration requirements during implementation.
