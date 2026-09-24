# Server-authoritative gameplay

Montoncito uses the server as the authority for live game state and accepted actions. Clients render Authoritative state and may show one Pending Action, but they do not apply gameplay transitions before server acceptance. The server validates every transition and broadcasts the authoritative result so multiplayer integrity and reconnection remain reliable.

## Considered options

- Peer-to-peer or client-authoritative turns would reduce server work but make cheating prevention, conflict resolution, and recovery substantially harder.

## Consequences

- The server owns validation and sequencing.
- Clients wait for confirmation instead of applying optimistic gameplay state.
- Offline turns and client-side authority are outside the current scope.
