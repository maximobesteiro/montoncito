# Montoncito – Game Rules

**Montoncito** is a turn-based, multiplayer online card game inspired by _Spite & Malice_ (also known as _Cat and Mouse_).  
It is designed for deterministic game-state evaluation, making it suitable for both human and bot players.

---

## 🎯 Objective

The goal of the game is to be the **first player to empty their stock pile**.

---

## 🃏 Components

Each player has:

- **Stock pile** – a face-down pile with the top card visible. This is the primary pile to empty to win.
- **Hand** – cards currently in hand (usually 5).
- **Discard piles** – **1–4** face-up piles per player, defaulting to **3**, used to temporarily store cards for future turns.

The table has shared:

- **Build piles** – a dynamic collection of shared piles where players play cards sequentially from **1 to 12**.
  - An Ace, King, or Joker may start a new Build pile. There is no fixed pile limit.
  - When a pile reaches **12**, it is cleared into the Recycle pile and removed from the table.

The deck consists of one **Card pack per player**. Each Card pack contains:

- **52 standard suited cards**, ranks 1–13.
- **2 Jokers**.
- Kings (rank 13) and Jokers are wild and may represent any required Build pile rank.

---

## 🧩 Setup

- Each player receives a **stock pile** of `20` cards.
  Only the top card is face-up.
- Each player receives **5 cards** in their Hand.
- The remaining deck becomes the **draw pile**.
- The server selects the first player and shuffles the deck from retained random generator state.

---

## 🔄 Turn Structure

Players take turns in clockwise order.

A turn consists of the following steps:

1. **Play Phase**  
   The player may play cards from:
   - Their **hand**,
   - Their **stock top**, or
   - Their **discard piles (top card of each)**  
     …onto the **build piles** in the center.

   ✅ Rules for playing:
   - Build piles must follow ascending order (1 → 2 → … → 12).
   - Kings (`13`) and Jokers act as any required number.
   - An Ace, King, or Joker may target `new` to start a new Build pile; the core assigns its identifier.
   - After playing a `12`, the pile is **cleared** into the Recycle pile and removed.
   - If the player empties their Hand, the server automatically refills it to 5 and the Play phase continues.
   - The player may continue playing while valid moves remain, or choose to discard instead.

2. **Discard**

   At any point during their Turn, the player may **discard** one card from their Hand onto one of their configured Discard piles (top visible), even if a legal play remains.

3. **End of Turn**  
   The accepted discard ends the Turn. The server advances to the next player and automatically refills that player's Hand to 5 cards.

When the Draw pile cannot supply another card, the server uses retained `mulberry32-v1` generator state to shuffle the Recycle pile into a new Draw pile. If both piles empty during a refill, the player continues with a partial Hand while any legal play remains. A player may explicitly end their Turn without discarding only when their Hand is empty, no card can be drawn, and they have no legal placement.

---

## 🏆 Winning the Game

The first player to **empty their Stock pile** wins immediately.

If the Draw pile and Recycle pile are empty and no player has a legal play, the winner is determined by:

- Fewer cards in the Stock pile, then
- Fewer cards in the Hand, then
- Fewer cards across all Discard piles, then
- Earlier position in the seeded Turn order.

---

## ⚙️ Game Logic Principles

Montoncito is built on **deterministic game-state transitions**:

- The core engine accepts a **current state** and a **player action**, returning a **new state** without side effects.
- All actions are validated and replayable.
- Initial shuffle, first-player selection, and Recycle-pile reshuffles use explicit retained random generator state.
- This design supports serialization and synchronization across clients and servers.

---

## 🧠 Actions

Each action is represented by a structured command:

| Action      | Params                         | Description                                                   |
| ----------- | ------------------------------ | ------------------------------------------------------------- |
| `PLAY_CARD` | `{from, target}`               | Play from Hand, Stock, or Discard to an existing or new pile |
| `DISCARD`   | `{cardId, discardPileIndex}`   | Move from Hand to a Discard pile and end the Turn             |
| `END_TURN`  | –                              | End only with an empty Hand, no refill, and no legal play     |

Setup, Hand refill, Build pile clearing, reshuffling, and winner evaluation are private deterministic transitions rather than player Actions.

---

## 🧩 Card Value Rules

- Standard Cards are ranked 1–13; Build piles require values 1–12.
- Kings (`13`) and Jokers are wild.
- No wrap-around; playing 12 removes the completed Build pile.
- Stock cards can only be played if they match the next required number on a build pile.
- Discards can only be played if their top card matches the next required number.

---

## 🧱 Discard Strategy

Each player’s discard piles work as auxiliary memory:

- The **top card** of each pile is playable.
- You can stack multiple cards of any value.
- Once placed, a card cannot be rearranged between discard piles.

---

## 💡 Example Turn

1. Player starts with Hand `[3, 5, 1, 12, 9]`, top of Stock pile is `2`.
2. Existing Build piles contain `1→2→3` and `1→2→3→4→5→6→7`.
3. Player plays:
   - `1` from Hand to start a new Build pile.
   - `2` from Stock pile onto that Build pile.
4. Discards a `12` into Discard pile 1.
5. Turn ends.

---

## 🧩 Optional Variants

- **Discard Pile Count**: 1–4.
- **Parallel Play Mode** (future): both players can play simultaneously with conflict resolution.

---

## 🔍 Determinism & Sync

- Every move produces a new immutable game state.
- The same sequence of inputs will always yield identical outcomes.
- Perfect for server-authoritative or peer-to-peer synchronization.

---

_© Montoncito Project — Core Game Specification (v1.0)_
