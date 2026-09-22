# Server-authoritative gameplay

Montoncito uses the server as the authority for live game state and accepted actions. Clients may preview or render state locally, but the server validates every transition and broadcasts the authoritative result so multiplayer integrity, replay, and reconnection remain reliable.

## Considered options

- Peer-to-peer or client-authoritative turns would reduce server work but make cheating prevention, conflict resolution, and recovery substantially harder.

## Consequences

- The server owns validation and sequencing.
- Client optimism must support rollback or wait for confirmation.
- Offline turns and client-side authority are outside the current scope.
