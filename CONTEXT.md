# Montoncito domain context

Canonical vocabulary for the card game and its player-facing concepts. Use these terms in code, APIs, UI copy, and documentation.

## Game areas

**Stock pile**:
The face-down pile a player must empty to win; only its top card is available to play.
_Avoid_: personal deck, reserve deck

**Hand**:
The cards currently held by a player and available during their play phase.
_Avoid_: cards in hand as a subsystem name

**Discard pile**:
One of a player's face-up auxiliary piles whose top card may be played on a later turn. A ruleset permits one to four Discard piles and defaults to three.
_Avoid_: waste pile, graveyard

**Build pile**:
A shared table pile built in ascending order from 1 through 12. An Ace, King, or Joker may start a new Build pile, with no fixed limit on simultaneous piles. After 12, its cards move to the Recycle pile and the Build pile is removed.
_Avoid_: central pile, sequence pile

**Draw pile**:
The shared face-down source from which players refill their Hands. When it empties, the server deterministically shuffles the Recycle pile to form a new Draw pile.
_Avoid_: deck, reserve

**Recycle pile**:
The shared holding area for cards cleared from completed Build piles. Its cards form a new Draw pile when the current Draw pile empties.
_Avoid_: Discard pile, waste pile

## Cards

**King**:
A standard rank-13 Card that acts as a wild card and may represent the next required rank on a Build pile.
_Avoid_: Joker

**Joker**:
A separate wild Card included at two per Card pack. A Joker may represent the next required rank on a Build pile.
_Avoid_: King, rank 13

**Card pack**:
The 52 standard suited Cards, ranks 1 through 13, plus two Jokers. Game setup uses one Card pack per player.
_Avoid_: Draw pile, Stock pile

## Match flow

**Lobby**:
A pre-game space where players discover, create, or join a match before the game room begins.
_Avoid_: room, waiting room

**Game room**:
The live match context where seated players receive authoritative state and submit actions.
_Avoid_: lobby, session

**Game room session**:
A player's active connection to a Game room, through which they receive Authoritative state and submit Actions. A Game room session may reconnect without changing the player's Game room membership.
_Avoid_: Game room, Lobby

**Turn**:
The active player's opportunity to make valid plays and finish by discarding. A player with an empty Hand may finish without discarding only when no card can be drawn and they have no legal placement.
_Avoid_: round (a round may contain multiple turns)

**Play phase**:
The part of a turn in which the active player plays available cards onto build piles.
_Avoid_: action phase

**Win condition**:
A player wins immediately when their Stock pile is empty. If the Draw pile and Recycle pile are empty and no player has a legal play, the player with the fewest Stock pile cards wins; ties compare Hand cards, then Discard pile cards, then seeded Turn order.
_Avoid_: victory state, end condition

## Technical domain terms

**Action**:
A player command that requests one state transition, such as playing a card or discarding. An Action remains pending until the server accepts or rejects it.
_Avoid_: event (use event for an accepted or broadcast fact)

**Pending Action**:
An Action submitted by a player that the server has not yet accepted or rejected. A Pending Action does not change Authoritative state. A player may have at most one Pending Action and resubmits it with the same Action ID after reconnecting.
_Avoid_: optimistic action, local action

**Accepted Action**:
An Action the server has validated and applied to Authoritative state. Each Accepted Action advances the Game room's Sequence number.
_Avoid_: pending action, client action

**Rejected Action**:
An Action the server does not apply to Authoritative state. A Rejected Action does not advance the Sequence number; its result identifies the reason and carries the latest Authoritative state.
_Avoid_: invalid event, failed state

**Action ID (`actionId`)**:
A player-assigned identifier for one Action, unique for that player within a Game room. Retries reuse the same Action ID so the server can return the prior result without applying the Action twice.
_Avoid_: Sequence number, Base sequence number

**Authoritative state**:
The server-owned game state that determines which actions are valid and what every client sees.
_Avoid_: client state, local truth

**Sequence number (`seq`)**:
The server-assigned ordering number for Accepted Actions in a Game room. It starts at zero and advances once for each Accepted Action; snapshots carry the current value without advancing it.
_Avoid_: client nonce (an `actionId` is a client nonce)

**Base sequence number (`baseSeq`)**:
The Sequence number of the Authoritative state from which a player created an Action. The server rejects an Action when its Base sequence number is stale.
_Avoid_: sequence number, action ID

**Stale Action**:
An Action whose Base sequence number does not match the current Authoritative state. The server rejects it and returns the latest Authoritative state.
_Avoid_: invalid action, duplicate action

**Random generator state**:
The `mulberry32-v1` algorithm version, unsigned 32-bit seed, and cursor retained in Authoritative state. Every random choice consumes this state so setup and Recycle-pile reshuffles remain deterministic and replayable.
_Avoid_: current time, implicit randomness
