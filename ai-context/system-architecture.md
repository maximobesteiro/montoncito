# Montoncito – System & Transport Architecture

## 1) Scope & Principles

- **Domain:** turn-based multiplayer card game (_Spite & Malice_-like) with deterministic core logic.
- **Authoritative server:** the backend is the single source of truth; clients are thin.
- **Deterministic engine:** `core-game` package is pure/state-transition based (given `state + action -> newState`). Random operations consume versioned generator state retained in authoritative game state.
- **Low-latency UX:** live play & spectating use WebSockets; everything else prefers simple, cacheable REST.

## 2) Apps & Packages

- **`packages/core-game` (TS lib)**
  - Pure rules & reducers. No I/O. Used by server for validation/simulation and optionally by clients for local previews.
- **`packages/game-room` (TS lib)**
  - Protocol-v1 runtime schemas and pure Game room session transitions. Depends on `core-game` and contains no React, Socket.IO, NestJS, or storage code.
- **`apps/server` (Node/NestJS)**
  - Exposes **REST** for auth, profiles, lobby/matchmaking, persistence, config.
  - Hosts **WebSocket gateway** for rooms, real-time actions, presence, and state fan-out.
  - Orchestrates persistence (e.g., Postgres) and ephemeral state (e.g., in-memory/Redis).
- **`apps/web` (Next.js)**
  - Player UI. Fetches data via REST, subscribes to a room via WS, dispatches actions via WS.
- **`apps/admin` (optional)**
  - Ops/observability tools (inspect rooms, force end, migrations, feature flags).

## 3) Why REST vs WebSockets

- **REST (idempotent-ish, cacheable, auditable):**
  - Ideal for resources with clear CRUD or fetch semantics and low update frequency.
  - Easier auth, retries, logs, and API docs.
- **WebSockets (low-latency, bidirectional stream):**
  - Ideal for **room lifecycle**, **player actions**, **state broadcasts**, **presence**, and **chat**.
  - Avoids request/response overhead per move and enables push updates.

## 4) REST Surface (Representative)

**Auth & Accounts**

- `POST /auth/login` – exchange credentials/OAuth for JWT (short-lived) + refresh.
- `POST /auth/refresh`
- `GET /me` – profile, preferences.

**Lobby & Matchmaking**

- `GET /lobbies` – list public lobbies.
- `POST /lobbies` – create lobby (ruleset, visibility, max players).
- `POST /lobbies/{id}/join` – reserve a seat (pre-room).
- `POST /lobbies/{id}/start` – promotes to a **game room** (creates WS room id).

**Rooms (metadata)**

- `GET /rooms/{id}` – summary (players, ruleset, createdAt, status).
- `POST /rooms/{id}/socket-token` – renew a token for an existing member without changing membership.
- `GET /rooms/{id}/history?cursor=…` – paginated action log / snapshots.

**Config & Static**

- `GET /rulesets` – server-supported rules, including the configurable Discard pile count.
- `GET /health` / `GET /version` – readiness & deploy info.

> **Guideline:** REST calls must **not** mutate live room state (except lobby→room promotion). All in-room gameplay goes through WS.

## 5) WebSocket Surface (Representative)

**Connection**

- `connect` with a protocol-v1 JWT that identifies the Game room and player.
- Server assigns **room shard** and enforces **sticky session** (LB affinity) if needed.

**Inbound events (client → server)**

- Game room sync request with protocol version only; room and player come from the authenticated socket.
- Game Action `{ version: 1, actionId, baseSeq, action }`.
  - `actionId` is a random UUID scoped to the authenticated player in that Game room.
- `chat.post` `{ text }`; the Game room comes from the authenticated socket.
- `presence.ping`; the Game room comes from the authenticated socket.

**Outbound events (server → clients in room)**

- Full synchronization snapshot `{ version: 1, seq, state }`, targeted to the joining player.
- Accepted Action result `{ version: 1, actionId, seq, state }`, broadcast once to the Game room.
- Rejected Action result `{ version: 1, actionId, code, seq, state }`, targeted to the submitting player.
- Protocol error for malformed or unsupported frames; this is not a Rejected Action and does not advance `seq`.
- `presence.update` `{ players[] }`
- `chat.message` `{ message }`

> **Ordering & idempotency:** the server serializes Actions per Game room. It assigns `seq` only to Accepted Actions and retains every outcome by `(roomId, playerId, actionId)` for the in-memory Game room lifetime. Duplicate lookup occurs before stale-sequence validation.

## 6) Room Lifecycle (Happy Path)

1. A player joins a Lobby through REST.
2. The owner starts it through an idempotent REST operation. Deterministic setup commits before the Lobby becomes a Game room with Sequence number zero.
3. The Lobby broadcasts the Game room ID. Clients navigate to `/game/[roomId]`.
4. Each client obtains a Game room token, opens Socket.IO, and requests synchronization.
5. The server verifies current membership and returns a full Authoritative state snapshot.
6. A player submits an Action with a random Action ID and Base sequence number.
7. The server checks membership, deduplication, staleness, and `core-game` validation, then atomically commits state, Sequence number, and outcome before delivery.
8. A finished Game room remains connected and read-only for gameplay Actions; seated players can continue chatting.

## 7) State, Persistence & Scaling

- **Ephemeral state (rooms):**
  - Authoritative state, Sequence number, and Action outcomes remain in one server process for the current implementation.
  - A process restart loses active Game rooms. Durable recovery is future work.
- **Sharding:**
  - Consistent hashing on `roomId` → worker partition.
  - **Sticky WS** via LB cookie/IP hash to keep flows on the owning worker.
- **Backpressure & fan-out:**
  - One serialized Action queue per Game room.
  - Every Accepted Action sends one full-state broadcast.

## 8) Security & Integrity

- **Signed guest identity** on REST and the WS handshake; short-lived Game room tokens support renewal.
- **Room ACLs**: the server verifies current membership on every sync and Action.
- **Action guards**:
  - Schema validation (Zod/DTOs).
  - Turn ownership check.
  - Deterministic reducer application; reject on invalid transition.
- **Anti-replay / ordering**:
  - `(roomId, playerId, actionId)` uniqueness; server assigns `seq`.
- **Rate limits**:
  - REST: IP/user burst + sustained.
  - WS: per-room action rate; disconnect on abuse.
- **Audit**: structured logs include `seq`, room ID, player ID, Action ID, and outcome. Durable Action logs are future work.

## 9) Failure, Reconnect & Consistency

- A reconnect always receives a full snapshot before resubmitting one Pending Action from same-tab session storage.
- A matching duplicate returns its retained outcome with current Authoritative state and never applies twice.
- Equal Sequence numbers with different Authoritative state are a protocol failure.
- Temporary token-renewal failure retains the Pending Action and retries without changing Authoritative state.

## 10) Versioning & Compatibility

- **Protocol version 1** is required by the shared Game room schemas.
- **Ruleset version 1** identifies the fixed King-and-Joker wild policy in Authoritative state and Game room snapshots. It remains fixed for a match, independently of the game-state version and protocol version. Discard pile count remains configurable.
- Server advertises supported versions in `GET /version`.
- Unsupported protocol versions fail before Action processing.

## 11) Observability

- **Metrics**: rooms active, messages/sec, action latency P50/P95, drop/reject rates, reconnects, DB/Redis latency.
- **Logs**: structured per Action with `seq`, room ID, player ID, Action ID, and reducer result.
- **Tracing**: REST spans + WS spans (join → action → broadcast).

## 12) Non-Goals (explicitly out for now)

- P2P networking, offline turns, and client-side authority.
- In-room REST mutations (all gameplay is WS).
- Optimistic gameplay state and rollback.
- Durable recovery after a server process restart.
- Arbitrary card animations/state on server (presentation is client concern).

## 13) Minimal Contracts (for agents)

- **REST:** stable resource paths; JSON; 200/4xx/5xx; ETags on GET where useful.
- **WS:** Socket.IO frames validated by protocol-v1 runtime schemas; every Accepted Action yields one incremented `seq` and full-state broadcast.
- **Core invariants:** one active Turn owner; dynamic Build piles ascend 1→12; completing 12 recycles and removes the pile; Win condition follows the canonical domain context.

---

_© Montoncito Project — System & Transport Architecture (v1.0)_
