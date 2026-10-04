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
- `GET /profile` reads or generates the caller's guest profile using the existing `X-Client-Id` convention. `POST /profile` initializes a missing profile from an optional browser nickname preference, returning an existing profile unchanged. Both return the canonical `clientId`, `displayName`, timestamps, and curated nickname suggestions.
- `PATCH /profile` trims and saves a nickname, returning the canonical `clientId`, `displayName`, `updatedAt`, and current available suggestions. Editors save directly after initialization; saving does not issue another initialization request. Blank or over-32-character values return HTTP 400 without changing the profile. Internal spaces, punctuation, and international characters are allowed. Nicknames never authenticate a guest or change their identity.

Nicknames are a shared guest preference across all joined Lobbies. Each open Lobby requires distinct names under `name.trim().toLowerCase()`, using locale-independent JavaScript lowercase conversion with no punctuation stripping or other character normalization. Profile renames validate every joined open Lobby before committing. A conflict returns HTTP 409 without changing the profile or broadcasting any roster. Admission checks the same comparison before adding a member; repeated joins by existing members preserve membership and readiness. Names may repeat in unrelated Lobbies. Validation and commit are synchronous in the authoritative server process, so concurrent renames and admissions cannot interleave their checks and writes. A future asynchronous or multi-process store must preserve this transaction boundary.

After a successful rename, each affected Lobby receives the existing `ROOM_UPDATED` WebSocket event. Readiness, host status, membership and guest identity do not change. `GET /profile` and initialization return generated suggestions filtered across current Lobby memberships; an empty list is valid, and saving always revalidates availability. Active matches neither lock the shared preference nor receive nickname roster broadcasts; their start-time names, Authoritative state and Sequence numbers remain unchanged. Lobby chat copies the confirmed profile nickname when a message is sent, and history keeps that name.

The homepage initializes the profile before showing its optional nickname editor. Create/join and direct-invite entry await the same initialization flow before admitting a guest. Concurrent initialization in one tab shares an in-flight request. Initialization supplies the cached nickname only for a missing profile, so mounting a page cannot overwrite an existing server-confirmed name. The browser stores only confirmed generated/custom names in local storage under `montoncito:nickname:<clientId>`; drafts are local to the editor. Clearing browser storage resets the browser's guest identity and preference. Profile storage remains in-memory on the server, outside `core-game`.

Invite admission and the homepage Join a Game flow use the same destination. A nickname rejection has code `NICKNAME_CONFLICT`; other admission failures, including full or started rooms, do not open naming setup. Before admission, `GET /rooms/{id}/nickname-suggestions` filters the finite generated list against both the target Lobby and every current Lobby membership, without changing the profile or reserving a name. A conflict opens the reusable editor with an available suggestion as a draft; exhaustion leaves custom editing available. Opening, Shuffle and Cancel never confirm a replacement or admit the guest.

Explicit Save submits optional `{ displayName }` to `POST /rooms/{id}/join`. The server trims and validates the draft, room status, capacity, target name availability and all joined Lobby names before synchronously committing the shared profile and membership. A rejected request changes neither. Success returns the canonical `profile` alongside the roster and WebSocket token; the browser persists that confirmed name, and every affected Lobby receives `ROOM_UPDATED`. Retrying as an existing member preserves the current profile and readiness. Normal joins omit the replacement and remain immediate. If either admission response is lost, the destination reads the confirmed profile and the original room through non-creating `GET /rooms/{id}`, then obtains a member socket token. Confirmed members of started matches navigate to play. A deleted room reports its absence; removed membership reports the confirmed nickname separately and requires an explicit admission retry. If reconciliation also fails, it explains the uncertain outcome and retains the draft for retry.

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

The current Socket.IO room chat uses the existing `chat` / `CHAT_MESSAGE` live contract. Members request the latest room conversation with `chat.history.request` `{ version: 1 }` and receive a targeted `chat.history` `{ version: 1, messages }` response. The server keeps the last 100 messages in delivery order on the in-memory room, including across the Lobby-to-Game room transition. The history vanishes when the room is removed or the process restarts; it never advances the gameplay Sequence number.

Match start copies each seated player's server-confirmed profile nickname into `state.byId[playerId].name`. An accepted profile save before start contributes that name; a save accepted after start affects open Lobbies and future matches only. Unsaved editor drafts never contribute a match name. The board reads the captured name, and the chat gateway resolves new messages from the same game state whenever the room has a `gameId`, including after game over. It does not consult the latest profile for Game room chat. Lobby chat resolves the confirmed profile at send time. Stored sender names are never rewritten, including Lobby history carried into a match. Profile editing remains available on the homepage and in other open Lobbies; the board has no nickname editor. Match-start navigation removes the Lobby editor and ignores its late response, while a later profile initialization recovers any accepted save for future use.

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

A Lobby retains disconnected members while another member remains online. When no one is connected, it removes the Lobby after a five-second grace period so a page refresh can recover room chat. A reconnect cancels the pending departure. The Lobby page renews a member's WebSocket token through the room token flow; removed players cannot renew membership automatically.

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

- **Game-state version 2** stores Build, Stock, Discard, and Draw piles as bottom-to-top arrays with the last element as top. Named array types retain the existing JSON shapes; a Discard area remains index-addressed piles. The Hand is unordered and Recycle has no directly available top. Reducers, selectors, validation, and board consumers use the core's immutable pile operations. See [ADR-0006](../docs/adr/0006-uniform-card-pile-ordering.md).
- **Serialized snapshot envelope version 2** requires embedded game-state version 2 and ruleset version 1. Version-1 snapshots and unsupported or mismatched version combinations are explicitly rejected. There is no migration or orientation guessing.
- **Deterministic compatibility:** the same seed, rules, players, and accepted Actions preserve dealt cards, available source tops, Turn order, future draws, and `mulberry32-v1` state. Setup accepts cards in deal order, converting a copy to Draw storage. Shuffle output is reversed at the Draw storage boundary; completed Builds enter Recycle in reverse placement order to retain the legacy shuffle-input sequence. These conversions consume no randomness.
- **Protocol version 1** is required by the shared Game room schemas.
- Protocol-1 synchronization, Accepted/Rejected Action, and room-update frames require embedded state version 2. Protocol 1 alone cannot identify old clients, and mixed old/new deployments are not guaranteed compatible. Deploy the coordinated core, server, shared Game room, and web changes together.
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
