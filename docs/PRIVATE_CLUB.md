# Private club: setup and running it

Chaal is members-only. A friend signs in with Google. The game Worker checks their verified email against the `members` collection in MongoDB and only then hands out game credentials. Nobody can sign up on their own; the owner adds people to the database.

```text
Browser ── Google sign-in popup ──▶ ID token
   │
   ├─ POST /auth/google  (ID token)  ─▶ Worker verifies with Google's keys, claims the invite in MongoDB
   │                                    ◀─ club sign-in (30 days, kept on the device)
   ├─ POST /session      (club sign-in) ─▶ fresh MongoDB check: active? same session version?
   │                                    ◀─ game credential (5 minutes, memory only)
   └─ rooms, sockets, lobby, media   (game credential) ─▶ Durable Objects
```

- The game credential is renewed a minute before it expires, over the open socket, without dropping the seat.
- Suspending someone stops their renewals. Within five minutes their socket stops getting table updates, and every members-only API refuses them.
- Each Google account (its stable `sub`) claims one invited email once. The member's `playerId` never changes, so refreshes, reconnects and second devices all land in the same seat with the same chips.
- Table email invites only go to addresses on the guest list. They never add anyone to the club.

## One-time setup

1. **MongoDB.** Any MongoDB 6+ works; MongoDB Atlas's free M0 cluster is plenty for six friends. Create a database user, and under Network Access allow `0.0.0.0/0`: Cloudflare Workers have no fixed IP addresses. Copy the connection string.
2. **Google OAuth client.** In Google Cloud Console → APIs & Services → Credentials, create an *OAuth client ID* of type *Web application*. Under *Authorized JavaScript origins* add `https://chaal.tech`, `https://www.chaal.tech`, `https://chaal-tech.pages.dev` and, for development, `http://localhost:5173` and `http://127.0.0.1:5173`. No redirect URI is needed (the popup flow is used). On the OAuth consent screen, add your friends as test users or publish the app. Basic sign-in only asks for the email and profile scopes.
3. **Worker secrets and vars:**

   ```sh
   npx wrangler secret put MONGODB_URI --config wrangler.game.toml
   npx wrangler secret put GOOGLE_CLIENT_ID --config wrangler.game.toml   # or a [vars] entry; it is not secret
   ```

   `SESSION_SECRET` is already set. Rotating it signs everyone out.
4. **Frontend build variable:** set `VITE_GOOGLE_CLIENT_ID` to the same client ID in the Cloudflare Pages project settings (and in `.env` locally), then rebuild.
5. **Deploy** the backend first (`npm run deploy:backend`, which adds the `ClubDirectory` Durable Object migration), then the frontend.
6. **Retire the Node backend.** `server/index.mjs` has no club sign-in and now refuses to start when `NODE_ENV=production`. If the Render service in `render.yaml` is still running, suspend or delete it so it is not a way around the club.

Old anonymous guest sessions stop working at cutover. Let running games finish first; everyone then signs in fresh. Old guest balances are not carried over.

## Adding and managing friends

Put `MONGODB_URI` in `.env` (never commit it), then:

```sh
npm run club -- add you@gmail.com --owner --nickname Atishay
npm run club -- add raju@gmail.com --nickname Raju --character tiger
npm run club -- list
npm run club -- suspend raju@gmail.com     # signs them out everywhere within 5 minutes
npm run club -- activate raju@gmail.com
npm run club -- unlink raju@gmail.com      # they changed Google accounts; same player and chips
```

Characters: `tiger`, `peacock`, `elephant`, `cobra`, `owl`, `fox`.

Or edit the collection directly (mongosh, Compass or the Atlas UI). A member document needs only an email and status:

```js
db.members.insertOne({ email: 'raju@gmail.com', status: 'invited', role: 'member', nickname: 'Raju' })
db.members.updateOne({ email: 'raju@gmail.com' }, { $set: { status: 'suspended' }, $inc: { sessionVersion: 1 } })
```

Do not edit `googleSub`, `playerId` or `sessionVersion` by hand except as above: they are the identity binding. Changing `playerId` gives that friend a new player with no seat or chips. Run `npm run club -- list` once after hand-editing; it also creates the unique indexes.

| Field | Who sets it | Meaning |
| --- | --- | --- |
| `email` | owner | Invited address (matched case-insensitively) |
| `status` | owner | `invited` → `active` on first sign-in; `suspended` blocks everything |
| `role` | owner | `owner` or `member` (cosmetic for now) |
| `nickname`, `characterId` | owner first, then the member | What the table shows |
| `googleSub`, `playerId`, `claimedAt` | server, on first sign-in | Identity binding: do not edit |
| `sessionVersion` | server / `suspend` | Incrementing it signs that member out everywhere |
| `reducedMotion`, `onboardedAt` | member | Profile settings |

## Beta emails

Three emails. #1 uses the light, personal layout; #2 and #3 still use the dark table-invite look. Day 1's images (`static/email/logo-light.png`, `beta-cards.png`, `icon-*.png`) are served from chaal.tech, so deploy the frontend before sending. Regenerate them with `node scripts/email-assets/render-beta-assets.mjs`.

| # | Subject | When |
| --- | --- | --- |
| 1 | Teen Patti night next weekend? | When you add the friend. A personal note from you (light design) offering Fri or Sat of next weekend, with a “Pick a night” button to the Google Form. Override the nights with `--nights "Fri, 23 Oct or Sat, 24 Oct"` |
| 2 | It’s set: *Sat 24 Oct, 9:00 PM* ♠ | When you run `beta-decide`. Date, time and an "Add to calendar" button |
| 3 | Welcome to the private membership ♠ | A day after #2, scheduled with Resend. Their member card and an "Enter the club" button |

1. **Create the form.** Open [script.google.com](https://script.google.com) and create a new project. Paste [scripts/google-form/beta-availability.gs](../scripts/google-form/beta-availability.gs) into it and run `createBetaForm`. The log prints the share link, the edit link and the responses sheet.
2. **Configure** `.env`:
   - `BETA_FORM_URL` (the share link) and `RESEND_API_KEY`. The sending domain must be verified in Resend.
   - Optionally `BETA_FROM`, and `BETA_HOST`: the name the emails are signed with. It defaults to the owner's nickname.
3. **Add friends.** `npm run club -- add raju@gmail.com --nickname Raju` sends #1. Use `--no-beta` for anyone who should never get these emails (for example yourself).
4. **Pick the time** from the responses sheet, then run `npm run club -- beta-decide --start "2026-10-24 21:00"` (India time). Everyone gets #2 now and #3 a day later. Anyone added after this gets #2 and #3 straight away, with no availability question. To change the time, run it again with `--force`: pending emails are cancelled and #2/#3 are re-sent.
5. **Check:** `npm run club -- list` shows who got which emails. Use `npm run club -- beta-preview --start "…"` to look at all three, and `npm run club -- beta raju@gmail.com` (or `--all`) to send anything someone missed.

Each send has an idempotency key and is recorded on the member (`betaInvite`), so reruns never send duplicates. Suspending or removing a friend cancels their emails that haven't gone out.

## Local development

```sh
# .env
VITE_SERVER_URL=http://127.0.0.1:8787
VITE_GOOGLE_CLIENT_ID=<your client id>.apps.googleusercontent.com
# .dev.vars (Worker)
SESSION_SECRET=<32+ random bytes>
MONGODB_URI=mongodb://127.0.0.1:27017
GOOGLE_CLIENT_ID=<your client id>.apps.googleusercontent.com
```

`npm run test:cloudflare` needs no Google account or database. It starts a throwaway MongoDB and signs its own test ID tokens. The Worker accepts those only when both `ALLOW_TEST_SIGN_IN=true` and `TEST_GOOGLE_JWKS` are set; never set them in production.

## Not done yet

- **Character art.** The six characters are placeholder emoji on coloured rings. Drawing the real family (idle/happy/disappointed expressions) is Phase 6 and needs your friends' nicknames and a chosen art style.
- **Characters at the table.** Seats still show the existing initial or camera fallback. Projecting the character into game snapshots touches every game engine, so it is deferred.
- **Owner panel.** Membership is managed in MongoDB / `npm run club`, as requested. There is no in-app admin screen.
- **Instant kick.** Suspension takes effect within five minutes (the credential lifetime), not instantly. That is because changes made directly in MongoDB do not notify the Worker.

## Profile photos

Members can open their navbar avatar, choose **Upload a photo**, adjust the crop, and save. JPEG, PNG and WebP inputs up to 5 MB / 24 megapixels are decoded locally. Only the cropped 192 × 192 JPEG (24 KB maximum) is sent to `/me`; browser re-encoding removes original EXIF/location metadata. The backend validates the JPEG format, dimensions, size and metadata markers. Photos are stored on the existing MongoDB member record as `photoDataUrl`, returned only through authenticated club/profile APIs, and require no public bucket or additional storage credentials.

Photos appear on profile/navigation avatars, member-based club avatars and camera-off seats. Live camera video still takes priority; a missing or broken photo falls back to the saved character. Remove the photo and press Save to return to a character. Other members' photos refresh with their member roster on a subsequent profile refresh/page visit; no live photo broadcast is added. Old profiles without a photo continue to work.
