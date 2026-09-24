# Shared Game room module

Montoncito uses a pure `@mont/game-room` package for protocol-v1 runtime schemas and Game room session transitions. The web and server applications provide React, Socket.IO, NestJS, authentication, and storage adapters around its interface. The package depends on `@mont/core-game`; the core engine does not depend on Game room delivery or session behavior.

## Considered options

- Putting session schemas in `@mont/core-game` would mix Action delivery, Sequence numbers, and reconnect behavior with card-game rules.
- Keeping separate contracts in the web and server applications would preserve the protocol drift already present in the codebase.

## Consequences

- The web and server share one versioned runtime contract for Action submission, synchronization, acceptance, rejection, and protocol errors.
- Pure session transitions can be tested without React, Socket.IO, or NestJS.
- App-specific adapters remain outside the package.
- `@mont/core-game` remains the deterministic card-rule module.
