# 29: Chaal V1 rules (locked 2026-10-22)

Source: [pagat.com: Twenty-Nine](https://www.pagat.com/jass/29.html), the standard rules, with the
owner's four decisions of 2026-10-22: **28 points** (no last-trick point), **minimum bid 15**, a player
who cannot follow suit before trump is known **must ask for it and may then play any card**, and **no
extras** (no double, redouble or single hand). Engine: `server/tricks/twenty-nine.mjs`
(`twenty-nine-1`).

1. **Players.** Four, in two partnerships; partners sit opposite. Deal and play go clockwise.
2. **Cards.** 32: 7 to A in each suit. Rank in every suit: J, 9, A, 10, K, Q, 8, 7. Points: J 3, 9 2,
   A 1, 10 1 (28 in all).
3. **Deal.** The first dealer is drawn from the shuffled deck; the deal passes to the left after every
   scored hand. Four cards each.
4. **Bidding.** The player to the dealer's left starts. Each player in turn bids higher than the
   current bid (15 to 28) or passes; a player who passed may bid again later. Three passes in a row
   end the bidding. If the first three players pass, the dealer bids 15.
5. **Trump.** The bidder chooses a card of the trump suit from their four and sets it face down. Then
   four more cards each: the bidder holds seven plus the face-down card. Only the bidder knows trump.
6. **Play.** The dealer's left leads the first trick; the winner of each trick leads the next. Follow
   suit if you can. Before trump is known, trumps are ordinary cards.
7. **Asking for trump.** The first player who cannot follow suit must ask for trump before playing (if
   that is the bidder, they declare it). The face-down card goes back to the bidder's hand, and the
   asker may then play any card. From that trick on, including it, the highest trump wins. If the bidder
   has only the face-down card left, it is turned up and trump is declared.
8. **The Pair.** A player holding the K and Q of trump may declare them on their turn once trump is
   known and their side has won a trick since. The bidding side's target goes down by 4 (not below 15);
   if the opponents declare it, up by 4 (not above 28). Once per hand.
9. **Scoring.** After eight tricks the bidding side counts its points. Making the target is +1 game
   point for that side, missing it −1; the other side's score does not change. A game ends when a side
   reaches +6 (it wins) or −6 (it loses); game points then start again. If trump was never asked for,
   the hand is annulled.
10. **Leaving and time.** As 3 2 5's locked rules: a person leaving mid-hand ends that hand unscored; a
    timed-out turn of a disconnected person gets a simple automatic move (pass; the longest suit's
    weakest card as trump; ask when required; otherwise the lowest card).

**Implementation choices where pagat is silent** (not owner rule decisions, but listed for review):
the dealer's forced 15 is automatic rather than a separate action; a player who passed may bid again
while the bidding continues (pagat's "three passes in a row" ending implies this); the Pair is declared
on the holder's own turn.
