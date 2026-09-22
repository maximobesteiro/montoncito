# Deterministic core game engine

Game rules live in a pure core engine that maps `state + action` to a new state without I/O or hidden side effects. The same inputs must produce the same result so the server can validate, replay, serialize, and synchronize matches consistently.

## Considered options

- Embedding rules in transport handlers or UI code would couple gameplay to delivery and presentation, making replay, testing, and alternate clients harder.

## Consequences

- Transport and UI layers orchestrate the engine instead of owning game rules.
- Randomness is limited to explicit setup such as the initial shuffle.
- Any new rule must preserve immutable, deterministic state transitions.
