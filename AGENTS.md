# Montoncito: agent guide

Before changing gameplay, architecture, transport, or UI, read the relevant project context:

- [CONTEXT.md](./CONTEXT.md) for the canonical domain vocabulary.
- [ai-context/game-rules.md](./ai-context/game-rules.md) for rules, actions, and win conditions.
- [ai-context/system-architecture.md](./ai-context/system-architecture.md) for boundaries, transport, state, and operational constraints.
- [ai-context/ui-vision.md](./ai-context/ui-vision.md) for visual language and interaction intent.
- [ai-context/README.md](./ai-context/README.md) for the map of these references.

## Working constraints

- Treat the server as the authority for live game state and accepted actions.
- Keep the core game engine deterministic, immutable, and free of I/O.
- Use WebSockets for in-room gameplay and live room updates; use REST for resources, lobby flows, and read-oriented APIs.
- Make the UI communicate game state and available actions clearly before adding ornament.
- Preserve the canonical vocabulary in `CONTEXT.md` when naming code, APIs, and documentation.

When a change contradicts an existing architectural decision, update the relevant ADR and the source context document in the same change.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Triage uses the default five-label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a single-context domain layout: root `CONTEXT.md` and root `docs/adr/`. See `docs/agents/domain.md`.
