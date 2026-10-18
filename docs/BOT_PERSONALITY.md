# Bot personality: memory, voice and feel (no AI)

Everything here is deterministic. No language model, no embeddings, no generated text.

## What changed

| Piece | Where | Affects moves? |
|---|---|---|
| Moment memory (vector recall) | `server/bots/memory/moments.mjs` | No |
| Character voices | `shared/bot-voice.mjs`, `src/lib/mascots/table-talk.ts` | No |
| Thinking time by character and situation | `server/bots/runner.mjs` | No (timing only) |
| Blind match trait (closes the raise exploit) | `server/bots/strategy.mjs` | Yes, new styles only |
| Hand-by-hand line reading + character focus | `server/bots/memory/adaptive.mjs` | Yes, new styles only |

Old styles are untouched: both new behaviours are optional settings, absent means off, so every earlier hand replays exactly.

## Moment memory (the vector store)

Each hand a bot plays leaves one **moment** per person it played: a 16-number fingerprint of a public situation (pot size, raise size, who was blind, what the person did, how it ended) plus a kind such as "they pushed and won". Recall is cosine similarity between fingerprints, filtered to one bot and one person. It feeds table talk ("you got me last time"), never a move, so hands stay replayable. Nothing private goes in; fingerprints hold no cards.

Backends behind one interface (`MemoryMomentIndex`, `MongoMomentIndex`, `PineconeMomentIndex`):

- **MongoDB Atlas Vector Search (default).** The existing cluster, one collection `bot_moments`, partitioned by `botId` and `playerId` filters. Create the index once: `npm run bots:moments:index`. Until it exists, an exact search over the last 400 moments is used, so nothing breaks.
- **Pinecone.** Set the Worker secrets `PINECONE_API_KEY` and `PINECONE_HOST` (the index host from the Pinecone console, dimension 16, cosine). One namespace per bot. No code change. The REST adapter is tested against a mock only.

Why Atlas by default: no new vendor or latency, free tier covers the scale (5 bots, thousands of 16-number vectors), and each bot already has its own filtered partition. Move to Pinecone if recall ever needs more than the cluster gives.

## Character voice

`shared/bot-voice.mjs`: 11 situations per character (raise, see, pack, win, lose, show, sit, back, rematch, revenge, pressure). A line is picked from the moment and a seed, so the same moment always says the same thing. What a bot remembers of you (from moment memory) selects "rematch", "revenge" or "pressure" greetings. Bots speak at most every 7 seconds and only sometimes mid-hand. Lines are playful banter, not claims about what a real person said.

## Feel

Thinking time scales by character (Virat quick, Dhoni patient) and by the decision (facing a raise, big pot), with an occasional long stall, never past 7 seconds.

## The exploit and its fix

A player who stays blind and raises the maximum every turn prices a seen bot out (a seen player pays double against a blind one and cannot Show). Simulated at the club's default pot limit, that strategy won 5 to 16 boots a hand from four of five styles. The `blindMatch` trait makes a bot stay blind while a live opponent is blind; the same exploiter then wins about 1 boot a hand from every style. Smaller raises and a "pot committed" trait were tried and did not help; they were removed.

## Line reading and character focus

Adaptive styles may set `memory.lineWeight` (0 to 0.15) and `memory.focus`. The bot reads the opponent's public line (what they have put in beyond it, blind or seen) and its memory of that person's habits, and lowers its own strength estimate by at most `lineWeight`. Each character weighs a different habit: Virat bluffs, Dhoni overbets, Samay tilt, GG takes every raise seriously, Rohit balanced. Habit counts only after the usual gates (30 decisions, 20 hands, 3 nights, confidence). Without a valid memory snapshot the base style plays. Opponent cards are never read (tested by changing them).
