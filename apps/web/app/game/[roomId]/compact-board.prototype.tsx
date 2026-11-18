"use client";

// THROWAWAY: compare chrome integration against smaller functional card sizes.
import { useState, type ReactNode } from "react";
import { peekTopCard, type GameState } from "@mont/core-game";
import { BuildPiles } from "@/components/game/BuildPiles";
import { Card, type CardSize } from "@/components/game/Card";
import { StockPile } from "@/components/game/StockPile";
import { Pile } from "@/components/game/Pile";
import { formatCardName } from "@/lib/format-card-name";

export function CompactBoardPrototype({
  state,
  compact,
  offline,
  chat,
  alignment = "original",
}: {
  state: GameState;
  compact: boolean;
  offline: boolean;
  chat: ReactNode;
  alignment?: "original" | "center" | "right";
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const player = state.byId["player-1"]!;
  const active = state.byId[state.turn.activePlayer]!;
  const myTurn = active.id === player.id;
  const size: CardSize = compact ? "sm" : "md";
  const selectedCard = player.hand.cards.find((card) => card.id === selected);
  const handCount = player.hand.cards.length;
  return (
    <div
      className={`exploration-board ${compact ? "exploration-compact" : "exploration-integrated"} exploration-alignment-${alignment}`}
    >
      <div className="exploration-play">
        <section aria-label="Mesa compartida">
          <div className="exploration-table-heading">
            <h1>Build piles</h1>
            <p
              className={`exploration-turn ${myTurn ? "exploration-my-turn" : ""}`}
              role="status"
            >
              {myTurn ? "Tu turno" : `Turno de ${active.name}`}
            </p>
            <span className="exploration-deck-counts">
              Robo {state.deck.drawPile.length} · Reciclaje{" "}
              {state.deck.recyclePile.length}
            </span>
          </div>
          {offline && (
            <p className="exploration-offline" role="status">
              Reconectando · jugadas pausadas
            </p>
          )}
          <div className="exploration-builds">
            <BuildPiles buildPiles={state.center.buildPiles} size={size} />
          </div>
        </section>
        <section className="exploration-own" aria-label="Tu área de juego">
          <div
            className="exploration-stock-hand"
            style={
              {
                "--prototype-card-width": compact ? "56px" : "72px",
                "--prototype-card-height": compact ? "80px" : "104px",
                "--prototype-hand-natural-width":
                  handCount === 0
                    ? "128px"
                    : `${handCount * (compact ? 56 : 72) + Math.max(0, handCount - 1) * 8}px`,
                "--prototype-hand-columns": `${handCount > 1 ? `repeat(${handCount - 1}, minmax(0, 1fr)) ` : ""}var(--prototype-card-width)`,
              } as React.CSSProperties
            }
          >
            <div role="group" aria-label="Your Stock">
              <StockPile stock={player.stock} size={size} />
            </div>
            <div
              role="group"
              aria-label="Your Hand"
              className="exploration-hand"
            >
              <h2>Hand</h2>
              <div className="exploration-hand-cards">
                {handCount === 0 && (
                  <p className="exploration-empty-hand">Sin cartas</p>
                )}
                {player.hand.cards.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    size={size}
                    ariaLabel={`Hand ${formatCardName(card)}`}
                    isSelected={selected === card.id}
                    className={
                      selected === card.id ? "exploration-selected" : ""
                    }
                    onClick={() =>
                      setSelected(selected === card.id ? null : card.id)
                    }
                  />
                ))}
              </div>
              <p className="sr-only" role="status">
                {selectedCard
                  ? `Seleccionada: ${formatCardName(selectedCard)}. Solo inspección, sin jugadas.`
                  : "Sin carta seleccionada"}
              </p>
            </div>
          </div>
          <div
            role="group"
            aria-label="Your Discard piles"
            className="exploration-discards"
          >
            <h2>Discard piles</h2>
            <div className="exploration-pile-row">
              {player.discards.map((pile, i) => (
                <Pile
                  key={i}
                  cards={pile}
                  size={size}
                  label={`Discard ${i + 1}`}
                  presentation={{
                    kind: "overlapping",
                    collapsedVisibleCount: 3,
                    expandable: true,
                  }}
                  cardAriaLabel={`Discard pile ${i + 1}, ${peekTopCard(pile) ? formatCardName(peekTopCard(pile)!) : "empty"}`}
                  coveredCardAriaLabel={formatCardName}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
      <div className="exploration-right">
        {chat}
        <aside aria-label="Opponents" className="exploration-opponents">
          {state.players
            .filter((id) => id !== player.id)
            .map((id) => {
              const opponent = state.byId[id]!;
              return (
                <section
                  key={id}
                  aria-label={opponent.name}
                  className="exploration-opponent"
                >
                  <div className="exploration-opponent-heading">
                    <h2>{opponent.name}</h2>
                    {id === active.id && (
                      <span className="exploration-turn">Turno</span>
                    )}
                    <span>Hand: {opponent.hand.cards.length}</span>
                  </div>
                  <div className="exploration-pile-row">
                    <StockPile
                      stock={opponent.stock}
                      size={compact ? "xs" : "sm"}
                    />
                    {opponent.discards.map((pile, i) => (
                      <Pile
                        key={i}
                        cards={pile}
                        size={compact ? "xs" : "sm"}
                        label={`D${i + 1}`}
                        presentation={{
                          kind: "overlapping",
                          collapsedVisibleCount: 1,
                          expandable: true,
                        }}
                        cardAriaLabel={`Discard ${i + 1} de ${opponent.name}`}
                        coveredCardAriaLabel={formatCardName}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
        </aside>
      </div>
    </div>
  );
}
