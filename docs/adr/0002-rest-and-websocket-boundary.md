# REST and WebSocket boundary

REST handles resource-oriented flows such as authentication, profiles, Lobby membership, configuration, history, and Game room token renewal. WebSockets handle Game room sessions, gameplay Actions, Authoritative state broadcasts, presence, and chat because these interactions are bidirectional and latency-sensitive.

## Considered options

- Sending in-room gameplay through REST would preserve a single transport but adds request/response overhead and weakens the live push model.

## Consequences

- In-room gameplay mutations use WebSockets.
- Lobby and room metadata can remain cacheable and auditable through REST.
- Client reconnect logic always recovers through a full Authoritative state snapshot before retrying a Pending Action.
