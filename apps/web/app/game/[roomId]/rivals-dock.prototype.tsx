"use client";

// THROWAWAY: can a stable bottom dock keep rivals readable without hiding play?
import { peekTopCard, type GameState } from "@mont/core-game";
import { Card } from "@/components/game/Card";
import { formatCardName } from "@/lib/format-card-name";

export function RivalsDockPrototype({
  state,
  onOpenChat,
}: {
  state: GameState;
  onOpenChat: () => void;
}) {
  const active =
    state.turn.activePlayer === "player-1"
      ? null
      : state.byId[state.turn.activePlayer]!;
  return (
    <aside className="prototype-rivals-dock" aria-label="Rivales y chat">
      <div className="prototype-rival-summaries">
        {state.players
          .filter((id) => id !== "player-1")
          .map((id) => {
            const rival = state.byId[id]!;
            return (
              <div
                key={id}
                className={id === active?.id ? "prototype-rival-active" : ""}
              >
                <strong title={rival.name}>
                  {rival.name}
                  {id === active?.id ? " · Turno" : ""}
                </strong>
                <span>
                  Stock {rival.stock.faceDown.length} · Hand{" "}
                  {rival.hand.cards.length}
                </span>
              </div>
            );
          })}
      </div>
      <div
        className="prototype-rival-detail"
        role="group"
        aria-label={active ? `Cimas de ${active.name}` : "Rivales resumidos"}
      >
        {active ? (
          [active.stock.faceDown, ...active.discards].map((pile, index) => {
            const top = peekTopCard(pile);
            const label = index === 0 ? "Stock" : `D${index}`;
            return (
              <div
                key={`${active.id}-${index}`}
                className="prototype-rival-top"
              >
                <span>{label}</span>
                {top ? (
                  <Card
                    card={top}
                    size="xs"
                    ariaLabel={`${label} de ${active.name}: ${formatCardName(top)}`}
                  />
                ) : (
                  <div
                    className="prototype-rival-empty"
                    aria-label={`${label} vacío`}
                  >
                    —
                  </div>
                )}
                <span>{pile.length}</span>
              </div>
            );
          })
        ) : (
          <p>Tu turno · rivales resumidos</p>
        )}
      </div>
      <button className="brutal-button bg-card" onClick={onOpenChat}>
        Chat · abrir conversación
      </button>
    </aside>
  );
}
