# Montoncito – System & Transport Architecture

## 1) Scope & Principles

- **Domain:** turn-based multiplayer card game (_Spite & Malice_-like) with deterministic core logic.
- **Authoritative server:** the backend is the single source of truth; clients are thin.
- **Deterministic engine:** `core-game` package is pure/state-transition based (given `state + action -> newState`).
- **Low-latency UX:** live play & spectating use WebSockets; everything else prefers simple, cacheable REST.

## 2) Apps & Packages

- **`packages/core-game` (TS lib)**
  - Pure rules & reducers. No I/O. Used by server for validation/simulation and optionally by clients for local previews.
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
- `GET /rooms/{id}/history?cursor=…` – paginated action log / snapshots.

**Config & Static**

- `GET /rulesets` – server-supported presets (stock size, jokers, pile count).
- `GET /health` / `GET /version` – readiness & deploy info.

> **Guideline:** REST calls must **not** mutate live room state (except lobby→room promotion). All in-room gameplay goes through WS.

## 5) WebSocket Surface (Representative)

**Connection**

- `connect` with JWT (Bearer in query/header).
- Server assigns **room shard** and enforces **sticky session** (LB affinity) if needed.

**Inbound events (client → server)**

- `room.join` `{ roomId }`
- `room.leave` `{ roomId }`
- `action.play` `{ roomId, actionId, actorId, payload }`
  - `actionId` is a **monotonic client nonce**; server maps to a **server sequence**.
- `chat.post` `{ roomId, text }`
- `presence.ping` `{ roomId }` (lightweight keep-alive/AFK signal)

**Outbound events (server → clients in room)**

- `room.state` `{ seq, fullState | patch }` – authoritative snapshot or CRDT-friendly patch
- `room.actions` `{ fromSeq, actions[] }` – ordered, validated action stream
- `presence.update` `{ players[] }`
- `chat.message` `{ message }`
- `room.system` `{ type, message }` – start/clear pile, win, warnings, etc.

> **Ordering & idempotency:** server assigns **`seq`** to each accepted action; replays are safe; duplicates are ignored by `(roomId, actorId, actionId)`.

## 6) Room Lifecycle (Happy Path)

1. Player hits REST `POST /lobbies/{id}/join`.
2. Host triggers `POST /lobbies/{id}/start` → server allocates `roomId`.
3. Client opens WS, sends `room.join { roomId }`.
4. Server broadcasts initial `room.state`.
5. Players send `action.play` events; server:
   - Validates with `core-game` reducer.
   - Mutates authoritative room state.
   - Emits `room.actions` and updated `room.state`.
6. On win condition, server emits `room.system { type: "gameEnded" }`, persists final snapshot.

## 7) State, Persistence & Scaling

- **Ephemeral state (rooms):**
  - Kept in memory of the owning **room worker** (process/pod).
  - Optionally mirrored to **Redis** for cross-pod pub/sub (spectators, admin taps).
- **Persistence:**
  - Postgres (or similar) for accounts, lobby records, final results, action logs/snapshots.
  - **Event-sourced** room log is favored (append-only actions + periodic snapshots).
- **Sharding:**
  - Consistent hashing on `roomId` → worker partition.
  - **Sticky WS** via LB cookie/IP hash to keep flows on the owning worker.
- **Backpressure & fan-out:**
  - Bounded queues per room.
  - Coalesce multiple quick actions into a single `room.state` patch if needed.

## 8) Security & Integrity

- **JWT auth** on both REST and WS handshake; short TTL + refresh.
- **Room ACLs**: only seated players can `action.play`; spectators are read-only.
- **Action guards**:
  - Schema validation (Zod/DTOs).
  - Turn ownership check.
  - Deterministic reducer application; reject on invalid transition.
- **Anti-replay / ordering**:
  - `(roomId, actorId, actionId)` uniqueness; server assigns `seq`.
- **Rate limits**:
  - REST: IP/user burst + sustained.
  - WS: per-room action rate; disconnect on abuse.
- **Audit**: append-only action log with server time and `seq`.

## 9) Failure, Reconnect & Consistency

- **Client reconnects** with last seen `seq` → server resends missing `room.actions` or a fresh `room.state` snapshot.
- **At-least-once** delivery semantics on outgoing; **idempotent** reducer ensures no double-apply.
- **Graceful owner failover**: if a worker dies, reload last snapshot + actions from durable store / Redis stream.

## 10) Versioning & Compatibility

- **Protocol version** carried in WS `room.join` and REST `Accept` header.
- Server advertises supported versions in `GET /version`.
- Breaking changes gated by feature flags and dual codecs during rollout.

## 11) Observability

- **Metrics**: rooms active, messages/sec, action latency P50/P95, drop/reject rates, reconnects, DB/Redis latency.
- **Logs**: structured per action with `seq`, `roomId`, `actorId`, reducer result.
- **Tracing**: REST spans + WS spans (join → action → broadcast).

## 12) Non-Goals (explicitly out for now)

- P2P networking, offline turns, and client-side authority.
- In-room REST mutations (all gameplay is WS).
- Arbitrary card animations/state on server (presentation is client concern).

## 13) Minimal Contracts (for agents)

- **REST:** stable resource paths; JSON; 200/4xx/5xx; ETags on GET where useful.
- **WS:** newline-delimited or JSON frames; every accepted action yields an incremented `seq`; snapshots include `seq`.
- **Core invariants:** single active turn owner; build piles ascend 1→12; completing 12 clears; winner = first empty stock.

---

_© Montoncito Project — System & Transport Architecture (v1.0)_
