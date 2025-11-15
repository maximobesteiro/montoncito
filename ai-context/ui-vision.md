# Montoncito – UI Vision

**Purpose:** Provide a foundational description of the **UI/UX vision** for Montoncito so an AI agent can build on top of it coherently — evolving the experience, structure, and code progressively while respecting the core direction.

---

## 🎨 Design Philosophy

- The visual style follows **Neo-Brutalism** — bold, geometric, functional, and expressive.  
  - Embrace solid color blocks, thick outlines, minimal gradients.  
  - Avoid photorealism or excessive skeuomorphism.  
  - Use deliberate spacing, flat shadows, strong hierarchy, and subtle motion.
- The tone is **playful yet minimal**, balancing a sense of handcrafted imperfection with crisp readability.
- The focus is on **clarity**, **speed**, and **player presence** rather than heavy animation.

---

## 🧩 High-Level UI Structure

### 1. **Landing / Lobby**
- Entry point to the platform.
- Shows list of **public lobbies**, current games, and “create new game” action.
- Minimal authentication barrier: players can start as guest or named account.
- REST-driven data (no live updates required beyond refresh interval).

### 2. **Game Room / Board**
- The heart of the UI — renders the current match state via **WebSocket** events.
- Key zones:
  - **Central Build Piles** – shared between players (1→12 sequences).
  - **Player Area** – own stock, hand (5 cards), and 4 discard piles.
  - **Opponent Area(s)** – compact visual of other players’ stock/discards.
- Layout adapts fluidly between desktop and mobile; orientation awareness is required (e.g. vertical stack on mobile).
- Core design goal: clarity of *whose turn it is* and *what moves are available*.

### 3. **Action Panel / Interaction Layer**
- Displays available moves (playable cards, discard options) based on current reducer state.
- Click-to-play (desktop) or drag-and-drop (mobile/desktop hybrid).
- Uses optimistic UI only if latency allows safe rollback; otherwise waits for server confirmation.
- Includes minimal **feedback cues** (pulse, color flash, outline) to show accepted/rejected moves.

### 4. **Chat & Presence**
- Collapsible side panel for lightweight chat.
- Shows connected players and presence indicators.
- WebSocket-driven updates.

### 5. **End-of-Game Screen**
- Displays final state, winner, and stats (cards left, turns, duration).
- “Play Again” or “Return to Lobby” actions.

---

## 🔌 Technical Architecture (Frontend)

- Built with **Next.js (React)**, TypeScript, and TailwindCSS.
- **Server Components** for static/lobby pages; **Client Components** for live game view.
- **Zustand** (or similar lightweight store) to manage transient UI state.
- WebSocket client encapsulated as a singleton service (hook-based API).
- Shared **core-game** logic imported from local package for deterministic replay and validation.

---

## ⚙️ Data & Communication Model

| Layer | Transport | Description |
|-------|------------|--------------|
| Lobby / Account | REST | Fetch lobbies, profiles, rulesets |
| Game Room | WebSocket | Join room, receive `room.state` / `room.actions` events |
| UI Actions | WebSocket | Send `action.play`, `discard`, `chat.post` |
| Rehydration | WS reconnect or REST fallback | On refresh, load last known `room.state` |

---

## 🪄 Aesthetic & Interaction Guidelines

- Use **flat geometry** and **consistent visual rhythm** — elements should look intentional and slightly oversized.
- Typography: large sans-serif headers, monospaced or rounded body text.
- Colors: limited, expressive palette (2–3 strong hues + neutral background).
- Motion: subtle, no physics-based animations; fast spring transitions or step animations only.
- Avoid depth illusions except flat drop shadows or outlines.
- Maintain accessibility contrast (WCAG AA+).

---

## 🧭 Phase-Out Vision

| Phase | Focus | Deliverable |
|-------|--------|--------------|
| **Phase 1** | Static board mock-up | Hand + discard + build pile layout; hardcoded data |
| **Phase 2** | Connect to mock WS | Simulate state changes and basic action feedback |
| **Phase 3** | Real WS integration | Real-time sync with backend and valid action flow |
| **Phase 4** | UI polish | Add Neo-Brutalist styling, typography, and transitions |
| **Phase 5** | Extended UX | Spectator view, chat overlay, post-game stats |

---

## 🧠 Design Intent Summary

- Every visible element corresponds directly to **a piece of game state**.
- The board should read like a live diagram, not a decorative table.
- Visual hierarchy > realism.
- Interaction must stay **predictable and snappy**.
- Favor *functional clarity* over ornamental detail.

---

*© Montoncito Project — UI Vision (v1.0)*
