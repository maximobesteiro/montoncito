---
status: accepted
---

# Uniform card pile ordering

Build, Stock, Discard, and Draw piles remain array-based and share named pile types with bottom-to-top ordering: the last element is the top card. The core owns shared immutable top-selection, placement, and removal operations so reducers and UI do not independently interpret array order. This resolves the mismatch between the previous top-first Build state and last-as-top rendering without introducing object wrappers into serialized state.

## Settled decisions

- The Hand remains an unordered collection. The Recycle pile has no directly playable or drawable top card; its cards await a shuffle.
- Preserve the dealt cards, subsequent draws, and random-generator consumption for the same seed and sequence of Actions, including after completed Build piles are recycled and reshuffled. Array representation may differ from the old state.
- Game-state version 2 and serialized snapshot envelope version 2 identify this representation. Serialization rejects unsupported embedded versions, and deserialization explicitly rejects version-1 snapshots and mismatched envelope/state versions rather than migrating them or guessing orientation.
- Keep Game room protocol version 1 and ruleset version 1. The shared embedded-state schema requires state version 2. Protocol 1 alone cannot identify old clients, and mixed old/new deployments are not guaranteed compatible.
- Peeking at an empty pile returns no card. Removing from an empty pile returns no card and leaves the pile unchanged. Gameplay rules own Action rejection.
- Build rank progression, wild-card rules, completion, and recycling remain gameplay-specific rather than generic pile operations.
- Regression coverage must exercise actual accepted Hand, Stock, and Discard plays rendered on the board, Ace and wild starters, empty-pile operations, immutability, Build completion and recycling, old-snapshot rejection, and old-versus-new comparisons of dealt cards, subsequent draws, and random-generator state through a reshuffle.

## Considered options

- Object-based piles would make each pile explicit but require structural changes to state and transport schemas. Named array types retain the existing shapes.
- Keeping the Draw pile first-to-draw would preserve another ordering exception. Uniform ordering requires adapting setup and shuffle boundaries to preserve seeded gameplay outcomes.
- Migrating old snapshots could preserve resumability but adds compatibility code. The chosen policy rejects the old representation explicitly.

## Deterministic storage boundaries

`createInitialState` accepts cards in deal order and reverses a copy for Draw storage. Setup and Recycle reshuffles likewise convert shuffle output from deal order to bottom-to-top storage without extra random choices. Completed Build piles enter Recycle in reverse placement order, preserving the version-1 shuffle-input sequence. Recycle itself has no top-card contract.

The frozen gameplay vectors captured for #76 verify the same dealt cards, accepted Actions, available tops, future draws, and RNG state through completion and a subsequent reshuffle. State version and array orientation are excluded from those behavioral comparisons. See [the baseline capture notes](../../packages/core-game/test/pile-baselines.md) and [system architecture](../../ai-context/system-architecture.md).
