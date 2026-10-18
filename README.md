# Montoncito

Montoncito is an online, turn-based multiplayer card game inspired by _Spite & Malice_ (also known as _Cat and Mouse_). Play in your browser as a guest, join friends in a Lobby, and race to be the first to empty your Stock pile.

## How to play

1. Each player starts with a 20-card **Stock pile**, a five-card **Hand**, and their configured **Discard piles**.
2. On your Turn, play cards from your Hand, Stock top, or Discard tops onto shared **Build piles** in ascending order from 1 to 12.
3. Aces start Build piles; Kings and Jokers are wild and can start or extend them. Completing 12 clears that Build pile into the Recycle pile.
4. Emptying your Hand refills it and lets you keep playing. Discard one non-wild Hand card to end your Turn.
5. Empty your Stock pile first to win.

See the [complete rules](ai-context/game-rules.md) for setup, refills, exceptional Turn endings, and the no-moves winner calculation.

## Run locally

### Prerequisites

- **Node.js 22.12 or newer**, using a supported LTS release. The root manifest's older `>=18` minimum is not sufficient for the current frontend toolchain.
- **pnpm 9.0.0**, as pinned in the root `package.json`.

No database or Redis service is required for the current implementation.

### Install and configure

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @mont/game-room... build
```

The second command builds `core-game` and `game-room`, whose compiled exports are consumed by the apps. Run it before the first development session or tests.

Create or update the ignored `apps/server/.env` file with:

```dotenv
PORT=3001
WS_SECRET=replace-with-a-long-random-local-secret
```

Choose your own secret; the server requires at least eight characters. Do not commit secrets. Setting `PORT=3001` is important: the backend otherwise defaults to port 3000, which the frontend already uses.

The frontend defaults to `http://localhost:3001`. To use a different backend address, set `NEXT_PUBLIC_SERVER_URL` in `apps/web/.env.local` and restart the frontend. This is a public browser-facing URL, not a secret.

### Start the game

```sh
pnpm dev
```

This starts the apps and shared-library watchers:

| Service          | Local URL               |
| ---------------- | ----------------------- |
| Player interface | <http://localhost:3000> |
| Backend          | <http://localhost:3001> |
| Starter docs app | <http://localhost:3010> |

To try multiplayer on one machine, open the player interface in **two separate browser profiles**, create a Lobby in one, and open its invitation in the other. Ordinary tabs in the same browser profile share Guest identity and do not represent separate players. Mark players ready, then start as the host.

Use localhost for this setup: browser identity initialization relies on secure-context APIs, including Web Locks and `crypto.randomUUID()`. Accessing the game through a plain HTTP LAN address is not equivalent to localhost and may prevent entry.

## Development commands

Run these from the repository root:

| Command            | Purpose                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| `pnpm dev`         | Start development apps and shared-library watchers.                          |
| `pnpm build`       | Build apps and packages through Turborepo.                                   |
| `pnpm test`        | Run workspace test scripts. Browser-based tests require Playwright Chromium. |
| `pnpm test:core`   | Run the deterministic game engine tests.                                     |
| `pnpm lint`        | Run configured workspace lint scripts; the server script also applies fixes. |
| `pnpm check-types` | Run type checks in workspaces that provide a `check-types` script.           |
| `pnpm format`      | Format TypeScript, TSX, and Markdown files in place.                         |

Install the browser used by the frontend journey and layout tests with:

```sh
pnpm --filter web exec playwright install chromium
```

See [Lobby-to-winner verification](docs/game-journey-verification.md) for focused test commands and coverage details.

## Repository structure

```text
apps/
  web/                Next.js and React player interface
  server/             NestJS REST API and Socket.IO backend
  docs/               Turborepo starter page, not the project documentation
packages/
  core-game/          Pure game rules and deterministic state transitions
  game-room/          Shared protocol schemas and pure session transitions
  ui/                 Shared React components
  eslint-config/      Shared ESLint configuration
  typescript-config/  Shared TypeScript configuration
ai-context/           Detailed rules, architecture, and UI references
docs/adr/             Architectural decision records
```

The monorepo uses TypeScript, pnpm workspaces, and Turborepo. The player interface uses Tailwind CSS and a bold, functional neo-brutalist visual style.

## Architecture at a glance

```text
Browser (apps/web)
  ├─ REST: guest profiles, Lobby entry, settings, readiness, and start
  └─ Socket.IO: live Lobby updates, gameplay, synchronization, and chat
        ↓
Authoritative backend (apps/server)
  ├─ core-game: validates Actions and computes immutable game state
  └─ game-room: shared protocol contracts and session transitions
```

- The **server owns live game state** and accepts or rejects every gameplay Action.
- The core engine is **deterministic, immutable, and free of I/O**; randomness is explicit and retained in game state.
- Clients wait for server confirmation rather than optimistically moving cards. Reconnecting clients synchronize before retrying a Pending Action.
- Current state is in-memory and single-process; durable recovery and multi-process deployment are future work.

See the [system architecture](ai-context/system-architecture.md) and [architectural decisions](docs/adr/) for the detailed contracts and boundaries.

## Documentation and contributing

- [Game rules](ai-context/game-rules.md) — full gameplay reference.
- [Glossary](GLOSSARY.md) — canonical game and technical vocabulary.
- [System architecture](ai-context/system-architecture.md) — application boundaries, transport, and state.
- [UI vision](ai-context/ui-vision.md) — visual direction and interaction intent; includes future ideas, not just shipped features.
- [Context map](ai-context/README.md) — guide to the detailed references.
- [Architectural decisions](docs/adr/) — the reasoning behind major design choices.
- [GitHub Issues](https://github.com/maximobesteiro/montoncito/issues) — bugs, feature requests, and specs.
- [Agent guide](AGENTS.md) — repository instructions for coding agents.

Before contributing, read the relevant rules and architecture references, preserve the glossary's vocabulary, and verify your change with the applicable tests. Keep gameplay authority on the server and side effects out of `core-game`. If a change contradicts an architectural decision, update its ADR and the corresponding context document in the same change.
