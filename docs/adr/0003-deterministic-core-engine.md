# Deterministic core game engine

Game rules live in a pure core engine that maps `state + action` to a new state without I/O or hidden side effects. The same inputs must produce the same result so the server can validate, replay, serialize, and synchronize matches consistently. Random operations use `mulberry32-v1` and consume the unsigned 32-bit seed and cursor retained in authoritative game state.

## Considered options

- Embedding rules in transport handlers or UI code would couple gameplay to delivery and presentation, making replay, testing, and alternate clients harder.

## Consequences

- Transport and UI layers orchestrate the engine instead of owning game rules.
- Randomness is explicit and reproducible. Initial shuffle, seeded first-player selection, and Recycle-pile reshuffles consume retained generator state.
- Fixed test vectors lock random-consumption order and shuffle results for each algorithm version.
- Any new rule must preserve immutable, deterministic state transitions.
