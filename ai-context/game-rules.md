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
- **Discard piles** – up to **4** face-up piles per player, used to temporarily store cards for future turns.

The table has shared:

- **Build piles** – up to **4** central piles where players play cards sequentially from **1 to 12**.
  - When a pile reaches **12**, it is cleared and removed from the table.

The deck consists of:

- **Standard 52 cards** (values 1–12 repeated four times)
- **Wild cards (13)**, usually represented as `Jokers`, which can replace any missing value in sequence.

---

## 🧩 Setup

- Each player receives a **stock pile** of `20` cards (configurable).  
  Only the top card is face-up.
- Each player draws **5 cards** into their hand.
- The remaining deck becomes the **draw pile**.

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
   - A `Joker (13)` acts as any number.
   - After playing a `12`, the pile is **cleared** and becomes available for a new sequence starting at `1`.
   - The player may continue playing as long as they have valid moves.

2. **Draw Phase**  
   When no more plays are possible, the player must **discard** one card from their hand onto **one of their four discard piles** (top visible).

3. **End of Turn**  
   The next player begins their turn by drawing cards from the deck until they have 5 in hand.

---

## 🏆 Winning the Game

The first player to **empty their stock pile** wins immediately.

If multiple players empty their stock in the same round (possible in simultaneous mode), the winner is determined by:

- Fewer cards left in hand, then
- Fewer cards in discard piles, if still tied.

---

## ⚙️ Game Logic Principles

Montoncito is built on **deterministic game-state transitions**:

- The core engine accepts a **current state** and a **player action**, returning a **new state** without side effects.
- All actions are validated and replayable.
- No randomness exists beyond the initial deck shuffle.
- This design supports serialization and synchronization across clients and servers.

---

## 🧠 Actions

Each action is represented by a structured command:

| Action             | Params        | Description                                         |
| ------------------ | ------------- | --------------------------------------------------- |
| `PLAY_CARD`        | `{from, to}`  | Play from hand, discard, or stock to a build pile   |
| `DISCARD`          | `{from, to}`  | Move from hand to one of the player's discard piles |
| `DRAW`             | –             | Draw cards until hand has 5 cards                   |
| `END_TURN`         | –             | End the player's turn explicitly                    |
| `CLEAR_BUILD_PILE` | `{pileIndex}` | Internal action when a pile reaches 12              |

---

## 🧩 Card Value Rules

- Cards are valued 1–12.
- `13` (Joker) is wild.
- No wrap-around (after 12, pile resets).
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

1. Player starts with hand `[3, 5, 1, 12, 9]`, top of stock is `2`.
2. Center build piles: `[1→3→9, 5→7, -, -]`.
3. Player plays:
   - `1` from hand to start a new pile.
   - `2` from stock onto that pile.
   - Draws replacements after turn ends.
4. Discards a `12` into discard pile 1.
5. Turn ends.

---

## 🧩 Optional Variants

- **Custom Stock Size**: e.g., 15–25 cards.
- **Joker Count**: 0–4.
- **Parallel Play Mode** (future): both players can play simultaneously with conflict resolution.

---

## 🔍 Determinism & Sync

- Every move produces a new immutable game state.
- The same sequence of inputs will always yield identical outcomes.
- Perfect for server-authoritative or peer-to-peer synchronization.

---

_© Montoncito Project — Core Game Specification (v1.0)_
