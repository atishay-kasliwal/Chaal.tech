# Admin page: design (2026-10-22)

Brief: the club owner's tools (members, analytics, live tables, lineup, table defaults, look, game
night) inside the existing Chaal app. An owner tool, not a marketing page: the craft goes into type,
layout and one precise interaction; no loader, no WebGL. Stack: the app's own SvelteKit, tokens
(`--night`, `--surface`, `--paper`, `--butter`, `--red`, `--muted`, `--line`) and Bricolage Grotesque.

## Concepts considered

| | Idea | Anchor | Originality | Fit | Feasible | Portable (lower is better) |
|---|---|---|---:|---:|---:|---:|
| A | **The host's ledger**: the owner keeps the club's book; sections are index tabs down its spine, each with what is in it right now | Chaal is a private club with a host who keeps the guest list and runs the nights | 4 | 5 | 5 | 2 |
| B | The back room: a felt desk with sections dealt as cards | the card table | 3 | 3 | 3 | 3 |
| C | A pit board of live numbers | a casino floor | 2 | 3 | 5 | 4 |

Chosen: **A**. It is the owner's real job (who is in the club, who is here tonight, what is on), and it
keeps the page calm enough to work in.

## Concept card

```
Idea:        The club's book: every section on one spine, with its live count beside it.
Metaphor:    a host's ledger with index tabs
Signature:   the butter index marker slides down the spine to the chosen section
Emotion:     in control, at a glance
Motion verb: slide like a chip across felt (short, eased, never bouncy)
Screenshot:  the masthead's live numbers beside the title, the spine with counts, a ruled guest list
```

## System

- **Palette** (site tokens): ground `--night` #211c2e; panel `--surface` #2c263b; ink `--paper` #f8f2e5;
  muted `--muted` #beb5c9; rule `--line` #ffffff24; accent `--butter` #f2dc91 (selection, primary);
  alarm `--red` #ee715b (pause, end a table); live green #8fe0ad (online, playing).
- **Type**: Bricolage Grotesque for the title, numerals and section titles (negative tracking); the UI
  sans for everything else. Numerals tabular.
- **Grid**: masthead 7 + 5 columns (title, live numbers); body: a 232 px spine plus the ledger. Phone: the
  spine becomes a horizontal index under the masthead.
- **Shape**: 14 px panels, pill buttons; rows are ruled lines, not boxes.
- **Motion**: 0.35 s ease for the marker, 0.2 s for hovers (a 2 px lift for primary buttons, a fill for
  index tabs); the "online now" dot breathes slowly only when someone is online. All off under reduced motion.

Genericness check: pill tabs in a bar (the old page) and three stat cards would be the generic result.
Changed to a vertical spine with live counts and the numbers set as a ledger line in the masthead.
