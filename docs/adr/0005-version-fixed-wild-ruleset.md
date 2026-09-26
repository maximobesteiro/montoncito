# Version the fixed King and Joker ruleset

The Authoritative state carries `rulesetVersion: 1`, identifying the current gameplay policy independently of the state serialization and Game room transport versions. All Kings and Jokers from every Card pack are wild. Neither card-level flags nor room-level settings can change their wildness. Under this ruleset, neither can be discarded from the Hand; they can be played onto Build piles, including new ones. The Discard pile count remains configurable.

## Considered options

- Encoding the policy only in the state or transport version conflates compatibility of stored data or messages with gameplay semantics.
- Keeping wild-card switches permits different behavior for identical Kings or Jokers, despite the supported game dealing them uniformly.

## Consequences

- Started games and Game room snapshots identify their fixed ruleset explicitly; accepted Actions retain the same identifier.
- Introducing a different wild policy requires a new ruleset version rather than silently changing the meaning of an existing match.
- Historical in-memory games do not require migration; active Game rooms are not persisted across process restarts.
