# AI context map

These documents are the detailed reference material for agents working on Montoncito. Start with the root [AGENTS.md](../AGENTS.md), then load only the references relevant to the task.

- [game-rules.md](./game-rules.md): rules, setup, turn flow, actions, invariants, and variants.
- [system-architecture.md](./system-architecture.md): application boundaries, REST/WebSocket responsibilities, authoritative state, persistence, scaling, and protocol concerns.
- [ui-vision.md](./ui-vision.md): visual direction, screen structure, interaction model, frontend architecture, and delivery phases.

## Reading guide

- Gameplay or reducer changes: read `game-rules.md` and `system-architecture.md`.
- Server, API, WebSocket, persistence, or deployment changes: read `system-architecture.md`; consult `game-rules.md` when state transitions are involved.
- UI, frontend, interaction, or visual changes: read `ui-vision.md` and `game-rules.md`.
- Terminology or naming changes: read the root `CONTEXT.md` first.

Architectural decisions that are hard to reverse are recorded in [docs/adr](../docs/adr/).
