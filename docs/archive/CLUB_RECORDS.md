# Club room and records

The club has four views: Tonight, Leaderboard, History, and Friends. Tables, standings, history, and members use paging rather than an expanding page. Standard desktop and phone screens fit the viewport; short screens and enlarged text may scroll so controls remain accessible.

The room uses the existing invite-table artwork as a full-screen background. Start-table controls live inside the room rather than in the club navbar.

## Record rules

- Rankings use net chips won, then hands won. Current balances and chip gifts are not winnings.
- Each participating human gets one hand played. Split-pot winners each get a win; a Blackjack push is not a win.
- Hands involving bots are archived as practice and excluded from the friends leaderboard and history.
- All time, This month, and Today apply to both personal totals and the record book. Calendar boundaries and displayed dates use Asia/Kolkata (IST).
- Records start with hands dealt after this feature is installed. In-progress hands from before installation are skipped because their complete chip movements were not tracked. No historical totals are invented.

## Persistence

Every authoritative room commit updates its current-hand totals in `room_meta` within the same SQLite transaction as the snapshot and command receipt. A completed hand adds a public result to `history_outbox` in that transaction. Human actions, bots, timeouts, and leave settlements share this path.

The outbox writes to MongoDB collection `club_hands`, using `room:handId` as its unique `_id`. Retrying an archive uses `$setOnInsert`, so a hand cannot count twice. Pending results retry on room activity or an alarm, and block room deletion until archived. MongoDB errors do not block gameplay.

Archived records contain the room, game type and variant, timestamps, participating player identities and names, net chip changes, winners, and result reason. They do not contain private cards, emails, tokens, or current balances. The authenticated `/club/history` API returns a public leaderboard, the caller's totals, and three history entries per page. No TTL is applied to the MongoDB records.

Deploy the Worker and frontend together. Existing MongoDB credentials and database configuration are reused; no new external service or secret is required.
