"use client";

import type { GameState, PlayerId } from "@mont/core-game";
import type { ActionSubmission, PlayerAction } from "@mont/game-room";
import { getValidMoves } from "@/lib/game-actions";
import { formatCardName } from "@/lib/format-card-name";

interface ActionPanelProps {
  gameState: GameState;
  currentPlayerId: PlayerId;
  pendingAction?: ActionSubmission | null;
  submitAction?: (action: PlayerAction) => boolean;
}

export function ActionPanel({
  gameState,
  currentPlayerId,
  pendingAction,
  submitAction,
}: ActionPanelProps) {
  const isMyTurn =
    gameState.phase === "turn" &&
    gameState.turn.activePlayer === currentPlayerId;
  const disabled = !isMyTurn || pendingAction != null || !submitAction;

  if (!isMyTurn) {
    return (
      <section className="brutal-border brutal-shadow bg-surface p-4">
        <h2 className="mb-2 text-xl font-bold">Actions</h2>
        <p className="font-semibold text-text-muted">
          {gameState.phase === "gameover"
            ? `Game finished${gameState.winner ? `. Winner: ${gameState.winner}` : "."}`
            : "Wait for your turn"}
        </p>
      </section>
    );
  }

  const validMoves = getValidMoves(gameState, currentPlayerId);
  const handCards = gameState.byId[currentPlayerId]?.hand.cards ?? [];
  const canPlay =
    validMoves.handToBuild.length > 0 ||
    validMoves.stockToBuild.length > 0 ||
    validMoves.discardToBuild.length > 0;
  const canEndTurn =
    gameState.byId[currentPlayerId]?.hand.cards.length === 0 &&
    gameState.deck.drawPile.length === 0 &&
    gameState.deck.recyclePile.length === 0 &&
    !canPlay;

  return (
    <section className="brutal-border brutal-shadow bg-card p-4">
      <h2 className="mb-3 text-xl font-bold">Available moves</h2>
      {pendingAction && (
        <p className="mb-3" role="status">
          Action pending: {pendingAction.action.kind}
        </p>
      )}
      {validMoves.canDiscard.length > 0 && (
        <p className="mb-3 text-text-muted">
          Discard a non-wild Hand card at any time to end your Turn.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {validMoves.handToBuild.map((move) => (
          <button
            key={`hand-${move.cardId}-${move.buildId}`}
            className="brutal-border bg-surface px-3 py-2 font-semibold disabled:opacity-50"
            disabled={disabled}
            onClick={() =>
              submitAction?.({
                kind: "PLAY_HAND_TO_BUILD",
                cardId: move.cardId,
                target: move.buildId,
              })
            }
          >
            Play {describeHandCard(move.cardId, handCards)} from Hand →{" "}
            {move.buildId === "new" ? "new Build pile" : `pile ${move.buildId}`}
          </button>
        ))}
        {validMoves.stockToBuild.map((move) => (
          <button
            key={`stock-${move.buildId}`}
            className="brutal-border bg-surface px-3 py-2 font-semibold disabled:opacity-50"
            disabled={disabled}
            onClick={() =>
              submitAction?.({
                kind: "PLAY_STOCK_TO_BUILD",
                target: move.buildId,
              })
            }
          >
            Play Stock top →{" "}
            {move.buildId === "new" ? "new Build pile" : `pile ${move.buildId}`}
          </button>
        ))}
        {validMoves.discardToBuild.map((move) => (
          <button
            key={`discard-${move.pileIndex}-${move.buildId}`}
            className="brutal-border bg-surface px-3 py-2 font-semibold disabled:opacity-50"
            disabled={disabled}
            onClick={() =>
              submitAction?.({
                kind: "PLAY_DISCARD_TO_BUILD",
                pileIndex: move.pileIndex,
                target: move.buildId,
              })
            }
          >
            Play Discard {move.pileIndex + 1} →{" "}
            {move.buildId === "new" ? "new Build pile" : `pile ${move.buildId}`}
          </button>
        ))}
        {validMoves.canDiscard.map((move) => (
          <button
            key={`end-${move.cardId}-${move.pileIndex}`}
            className="brutal-border bg-accent px-3 py-2 font-semibold disabled:opacity-50"
            disabled={disabled}
            onClick={() =>
              submitAction?.({
                kind: "DISCARD_FROM_HAND",
                cardId: move.cardId,
                pileIndex: move.pileIndex,
              })
            }
          >
            Discard {describeHandCard(move.cardId, handCards)} to pile{" "}
            {move.pileIndex + 1}
          </button>
        ))}
        {canEndTurn && (
          <button
            className="brutal-border bg-accent px-3 py-2 font-semibold disabled:opacity-50"
            disabled={disabled}
            onClick={() => submitAction?.({ kind: "END_TURN" })}
          >
            End Turn
          </button>
        )}
      </div>
    </section>
  );
}

function describeHandCard(
  cardId: string,
  handCards: GameState["byId"][string]["hand"]["cards"],
): string {
  const card = handCards.find((candidate) => candidate.id === cardId);
  return card ? formatCardName(card) : "card";
}
