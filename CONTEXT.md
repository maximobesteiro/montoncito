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
One of a player's face-up auxiliary piles whose top card may be played on a later turn.
_Avoid_: waste pile, graveyard

**Build pile**:
A shared table pile built in ascending order from 1 through 12 and cleared after 12.
_Avoid_: central pile, sequence pile

**Draw pile**:
The shared source from which players refill their hands.
_Avoid_: deck, reserve

## Match flow

**Lobby**:
A pre-game space where players discover, create, or join a match before the game room begins.
_Avoid_: room, waiting room

**Game room**:
The live match context where seated players receive authoritative state and submit actions.
_Avoid_: lobby, session

**Turn**:
The active player's opportunity to make valid plays and finish by discarding.
_Avoid_: round (a round may contain multiple turns)

**Play phase**:
The part of a turn in which the active player plays available cards onto build piles.
_Avoid_: action phase

**Win condition**:
A player's stock pile is empty; that player wins immediately.
_Avoid_: victory state, end condition

## Technical domain terms

**Action**:
A validated player command that requests one state transition, such as playing a card or discarding.
_Avoid_: event (use event for an accepted or broadcast fact)

**Authoritative state**:
The server-owned game state that determines which actions are valid and what every client sees.
_Avoid_: client state, local truth

**Sequence number (`seq`)**:
The server-assigned ordering number for an accepted room action or snapshot.
_Avoid_: client nonce (an `actionId` is a client nonce)
