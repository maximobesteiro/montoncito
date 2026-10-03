---
status: accepted
---

# Uniform card pile ordering

Build, Stock, Discard, and Draw piles will remain array-based and share named pile types with bottom-to-top ordering: the last element is the top card. The core will own shared immutable top-selection, placement, and removal operations so reducers and UI do not independently interpret array order. This addresses the current mismatch between top-first Build state and last-as-top rendering without introducing object wrappers into serialized state.

## Settled decisions

- The Hand remains an unordered collection. The Recycle pile has no directly playable or drawable top card; its cards await a shuffle.
- Preserve the dealt cards, subsequent draws, and random-generator consumption for the same seed and sequence of Actions, including after completed Build piles are recycled and reshuffled. Array representation may differ from the old state.
- Introduce a new state/snapshot version and explicitly reject old version-1 snapshots rather than migrating them.
- Keep Game room protocol version 1 and ruleset version 1. Update the shared embedded-state schema to require the new state version; protocol version alone will not establish client compatibility with the changed state representation.
- Peeking at an empty pile returns no card. Removing from an empty pile returns no card and leaves the pile unchanged. Gameplay rules own Action rejection.
- Build rank progression, wild-card rules, completion, and recycling remain gameplay-specific rather than generic pile operations.
- Regression coverage must exercise actual accepted Hand, Stock, and Discard plays rendered on the board, Ace and wild starters, empty-pile operations, immutability, Build completion and recycling, old-snapshot rejection, and old-versus-new comparisons of dealt cards, subsequent draws, and random-generator state through a reshuffle.

## Considered options

- Object-based piles would make each pile explicit but require structural changes to state and transport schemas. Named array types retain the existing shapes.
- Keeping the Draw pile first-to-draw would preserve another ordering exception. Uniform ordering requires adapting setup and shuffle boundaries to preserve seeded gameplay outcomes.
- Migrating old snapshots could preserve resumability but adds compatibility code. The chosen policy rejects the old representation explicitly.

This records the confirmed design interview. Implementation and its corresponding source-context updates are pending specification.
