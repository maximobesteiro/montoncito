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
- The homepage shows `Playing as <nickname>` above the game menu with an inline Edit button. New guests receive a short invented nickname and can enter without completing a naming form.
- The reusable nickname editor prefills the confirmed name and offers Shuffle, Save, and Cancel. Shuffle changes only the draft. Enter saves and Escape cancels. A failed save keeps the draft and confirmed name, with an adjacent error; controls show Saving and prevent duplicate submissions. The labeled input explains the 32-character limit and supports desktop, touch, and keyboard use.
- Generated and custom confirmed nicknames persist in this browser for the same Guest identity. Entry through an invite initializes the same profile before joining. Successful saves display the server's trimmed canonical nickname.
- Tabs sharing Guest identity update confirmed-name displays when another tab saves. An open editor keeps its unsaved draft. Saving a draft based on an older profile shows the latest confirmed name and asks for an explicit retry. Retained browser data restores the latest confirmed nickname after tab closure or server restart before entering a new Lobby. Clearing browser data resets the identity and nickname on next entry; rooms and games do not survive server restart.
- In the pre-game Lobby, only the current guest's player row has the same inline Edit control, including the host and already-ready guests. Rows show nicknames without raw guest IDs. Saving updates every joined Lobby live without changing readiness. Nicknames must be distinct ignoring capitalization in each Lobby. A nearby conflict message retains the draft and previous confirmed name and explains that another joined Lobby may be the source of the conflict.
- Lobby Shuffle fetches suggestions available across all current Lobby memberships. If none remain, the editor invites the guest to enter a custom name. Save checks availability again on the server. Departure, kick and match-start navigation close the editor and discard late responses; a late save cannot replace newer client state or change names in an existing match.
- Direct invites and Join a Game enter immediately with an available confirmed nickname. A conflicting name opens the same editor before admission and explains that the guest has not joined. The initial suggestion and Shuffle change only the draft. Save confirms the shared name and admission together; Cancel returns home without either. A rejected replacement keeps the useful draft and previous confirmed name. Full or started Lobbies retain their admission errors. If an admission response is lost, the page checks the confirmed profile and membership before reporting the result; an unavailable check explains the uncertain outcome and offers retry.

#### Casual Game

The entry path, pending/error feedback, and existing Lobby controls are implemented in [#99](https://github.com/maximobesteiro/montoncito/issues/99). Automatic nickname replacements and canonical cross-tab persistence are implemented in [#100](https://github.com/maximobesteiro/montoncito/issues/100). Lost-response recovery is implemented in [#101](https://github.com/maximobesteiro/montoncito/issues/101), completing [spec #98](https://github.com/maximobesteiro/montoncito/issues/98).

- Casual Game returns the guest to their oldest open public Lobby membership. Otherwise it joins the oldest public, open Lobby with space, or creates a public Lobby with default settings if none exists. Custom settings are eligible, and disconnected Lobbies remain eligible during their deletion grace period.
- Entry shows a pending state such as `Finding a game...` and prevents duplicate submissions. Success opens the existing Lobby screen, where players review settings, edit their nickname, mark ready, and wait for the host to start. Casual Game does not start the match automatically.
- Nickname conflicts do not open a pre-admission editor. The server appends the first available `_2`, `_3`, and so on to the current confirmed name, trimming the base when needed to fit 32 characters. This becomes the shared confirmed nickname shown on the homepage and in joined open Lobbies. Players can edit it after entry. Invitations and Join a Game keep their existing confirmation flow.
- A failed entry shows a recoverable error. Retrying Casual Game checks the same uncertain attempt, including after reload. A lost response recovers the original selection even if it is now private, full or started. Confirmed members of started matches open the Game room directly.
- If the original destination or membership disappears, the page explains that it is unavailable and offers `Find another game` as an explicit fresh attempt. Restart recovery restores the remembered nickname but cannot restore a lost room or uncertain operation. Successful entry completes the attempt; later Casual Game clicks perform normal selection.

### 2. **Game Room / Board**
- The heart of the UI — renders the current match state via **WebSocket** events.
- Key zones:
  - **Central Build Piles** – a dynamic collection of shared 1→12 sequences.
  - **Player Area** – own stock, Hand (5 cards), and 1–4 Discard piles.
  - **Opponent Area(s)** – compact visual of other players’ stock/discards.
- Layout adapts fluidly between desktop and mobile; orientation awareness is required (e.g. vertical stack on mobile).
- Core design goal: clarity of *whose turn it is* and *what moves are available*.
- Board labels and new Game room chat messages keep each player's confirmed nickname captured at match start, including after game over. The board offers no nickname editor. Editing on the homepage or in another Lobby updates the shared preference for future matches. Chat history retains the sender name stored at send time.

### 3. **Action Panel / Interaction Layer**
- Displays available moves (playable cards, discard options) based on current reducer state.
- Click-to-play (desktop) or drag-and-drop (mobile/desktop hybrid).
- Keeps the current Authoritative state while one Action is pending and waits for server confirmation.
- Includes minimal **feedback cues** (pulse, color flash, outline) to show accepted/rejected moves.

#### Compact destinations and selection

Implemented in [#104](https://github.com/maximobesteiro/montoncito/issues/104), part of [spec #103](https://github.com/maximobesteiro/montoncito/issues/103).

- The New Build pile slot and empty Discard slots use the board's card dimensions. The initial Build row reserves card height. Labels sit outside slot footprints.
- A selected card outlines each legal destination's whole collapsed stack, including exposed covered-card portions. Labels, counts, and inspection controls remain outside the destination boundary. Covered cards and opponent cards remain unavailable as sources.
- Completing a tap or activating a source with Enter or Space temporarily collapses its legal Discard destinations. The board remembers each pile's expansion preference separately from its rendered collapse. Unrelated histories stay open, and temporarily collapsed destinations cannot expand while targeting.
- Selecting another available source recalculates destinations and restores histories that cease to be destinations. Tapping the selected source or unused board space, or pressing Escape, clears selection and restores remembered expansion. Inspection controls and chat keep their own behavior.
- While a non-wild Hand card is selected, activating a legal Discard stack, including its playable top, submits that Hand discard and ends the Turn on server acceptance. Deselect the Hand card before selecting the Discard top as a source.
- Enter and Space activate destination buttons. Screen-reader status reports the selected source, legal destination counts, and cancellation. Keyboard play uses selection and destination activation.
- A pile reduced to zero or one card forgets its expansion preference, including during temporary collapse. Later growth stays collapsed. Entering a different Game room resets inspection.
- Existing pointer drag submission remains available during this slice. Cards stay in their Authoritative locations until the server accepts an Action.

### 4. **Chat & Presence**
- On wide screens, a collapsible chat panel sits above opponents with bounded message scrolling. Its collapse preference lasts for the browser session.
- Below 1024px, chat starts closed. A safe-area-aware bottom entry has reserved space outside the scrollable board. It opens a bounded modal sheet with Close and backdrop dismissal. Opening the sheet clears selection and cancels drag without submitting a gameplay Action.
- Recovered history does not raise unread; only live arrivals while closed do. Chat retains messages and drafts offline, disables Send until connected, and stays available during a Pending Action and after game over.
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
- The `useGameRoom(roomId)` interface hides connection, synchronization, retry, and Pending Action rules.
- Shared **game-room** schemas and pure session transitions come from the local package; game rules remain in **core-game**.

---

## ⚙️ Data & Communication Model

| Layer | Transport | Description |
|-------|------------|--------------|
| Lobby / Account | REST | Fetch lobbies, profiles, rulesets |
| Game Room | WebSocket | Sync a full Authoritative state snapshot through protocol v1 |
| UI Actions | WebSocket | Submit one Action with `actionId` and `baseSeq` |
| Rehydration | WebSocket | Receive a full snapshot, then retry the persisted Pending Action |

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
