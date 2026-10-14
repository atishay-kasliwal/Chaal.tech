# Classic: observed behavior and unresolved rules

This records the successful isolated six-player path on the original hosted backend. It is not a complete Classic rule specification. Evidence: [capture report](../../visual-baselines/original/capture-report.json) and [screenshots](../../visual-baselines/original/README.md).

| Trigger | Observed original behavior | Preservation / follow-up |
|---|---|---|
| Create a room with default table value 50 | Room created; creator still enters a player name | Keep form and flow; distinguish room creation from membership |
| Submit player name | Waiting list contains lowercased name and balance 50 | Preserve until an intentional name-policy change |
| Six players join | All appear in the existing waiting table | Stable seats must later survive reconnect, rather than rely on array position |
| Start with default 3 cards, cut 0 | Six players receive three cards; balances become 49 and pot 6 | Characterized initial contribution is 1 per player; do not assume all table values behave the same |
| Remain blind | UI renders original custom backs, but packets contain card identities | Preserve backs; fix disclosure before release |
| Click See | Own cards become visible; Seen is disabled; status changes | Preserve interaction and appearance; release cards only after accepted See |
| Active blind player bets default 1 | Pot changes 6 → 7 and turn advances | Preserve valid action; independently validate bounds and balance server-side |
| Four active-turn Pack actions | Confirmation accepted; players receive Packed overlays; two remain active | Preserve interaction; test timeouts/departures separately |
| Both remaining players see cards, then Show | Showdown reveals active hands and opens Declare Winner for initiator | Preserve visual outcome; remove manual authority |
| Show in captured path | Screenshot pot is 9, max stake 2; requester balance is 47 | Consistent with a 2-chip show charge in this configuration; full fee rules remain unspecified |
| Initiator selects first eligible player and confirms | Selected player receives pot; hand resets; balances are 56, 48, 49, 49, 49, 49 | Total is conserved at 300 in this one path; this does not verify all accounting |
| Captured first player has 4–5–6, other has 6–7–8 | First player still wins when manually selected | Incorrect under the displayed Classic ranking; authoritative evaluator required |
| Start another hand | Original table returns with blind state and fresh contribution | Previous balance carries forward in this path |
| Refresh during that hand | Loader shows “Room already has a game in process” | Rejoin failure; add stable authenticated player/session resume |

## Rules not established by this smoke path

- Shuffle randomness, deck integrity and distribution fairness.
- Automatic evaluator implementation, category ordering, ace/sequence edge cases and ties.
- Whether any independent validation of manual results exists outside the observed path.
- Minimum/maximum raises, insufficient balance, all-in policy and pot caps.
- Blind/seen stake formulas across all action sequences.
- Show requester eligibility, blind-versus-seen restrictions and fee rules in other states.
- Sideshow behavior, dealer rotation, host departure and player removal.
- Duplicate commands, stale actions, concurrent actions and settlement races.
- Transport recovery without reload, server restart and persistence durability.
- Different card-count/cut settings and separate 2–5-player deals.

Do not infer those rules from frontend hints alone. Recover the server source or agree an explicit rules specification before implementing the missing authoritative behavior. Classic remains the reference implementation for legitimate characterized interactions, with documented exceptions for privacy and incorrect adjudication.
