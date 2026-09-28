"use client";

import { useState } from "react";
import type { BuildPileTarget, GameState, PlayerId } from "@mont/core-game";
import { validateMove } from "@mont/core-game";
import type { ActionSubmission, PlayerAction } from "@mont/game-room";
import { getValidMoves } from "@/lib/game-actions";
import { GameBoard } from "./GameBoard";

interface GameRoomBoardProps {
  gameState: GameState;
  currentPlayerId: PlayerId;
  pendingAction: ActionSubmission | null;
  canSubmit: boolean;
  submitAction: (action: PlayerAction) => boolean;
}

type SelectedSource =
  | { kind: "hand"; cardId: string }
  | { kind: "stock" }
  | { kind: "discard"; pileIndex: number };

export function GameRoomBoard({
  gameState,
  currentPlayerId,
  pendingAction,
  canSubmit,
  submitAction,
}: GameRoomBoardProps) {
  const [selectedSource, setSelectedSource] = useState<SelectedSource | null>(
    null,
  );
  const myTurn =
    gameState.phase === "turn" &&
    gameState.turn.activePlayer === currentPlayerId;
  const canInteract = myTurn && canSubmit && !pendingAction;
  const moves = getValidMoves(gameState, currentPlayerId);
  const selectableCards = new Set([
    ...moves.handToBuild.map((move) => move.cardId),
    ...moves.canDiscard.map((move) => move.cardId),
  ]);
  const selected =
    canInteract &&
    selectedSource &&
    (selectedSource.kind === "hand"
      ? selectableCards.has(selectedSource.cardId)
      : selectedSource.kind === "stock"
        ? moves.stockToBuild.length > 0
        : moves.discardToBuild.some(
            (move) => move.pileIndex === selectedSource.pileIndex,
          ))
      ? selectedSource
      : null;
  const buildTargets = new Set<BuildPileTarget>(
    selected?.kind === "hand"
      ? moves.handToBuild
          .filter((move) => move.cardId === selected.cardId)
          .map((move) => move.buildId)
      : selected?.kind === "stock"
        ? moves.stockToBuild.map((move) => move.buildId)
        : selected?.kind === "discard"
          ? moves.discardToBuild
              .filter((move) => move.pileIndex === selected.pileIndex)
              .map((move) => move.buildId)
          : [],
  );
  const discardTargets = new Set<number>(
    selected?.kind === "hand"
      ? moves.canDiscard
          .filter((move) => move.cardId === selected.cardId)
          .map((move) => move.pileIndex)
      : [],
  );
  const selectableDiscardPiles = new Set(
    moves.discardToBuild.map((move) => move.pileIndex),
  );
  const visibleDiscardPiles = new Set(
    canInteract ? [...selectableDiscardPiles, ...discardTargets] : [],
  );
  const overlappingDiscardTargets = new Set(
    [...discardTargets].filter((pileIndex) =>
      selectableDiscardPiles.has(pileIndex),
    ),
  );
  const canEndTurn =
    canInteract && validateMove(gameState, { kind: "END_TURN" }) === null;

  function submit(action: PlayerAction) {
    if (!canInteract) return;
    if (submitAction(action)) setSelectedSource(null);
  }

  return (
    <section aria-label="Game board">
      {pendingAction && (
        <p role="status" className="font-semibold">
          Action pending: {pendingAction.action.kind}
        </p>
      )}
      <GameBoard
        gameState={gameState}
        currentPlayerId={currentPlayerId}
        onHandCardClick={
          canInteract
            ? (cardId) => {
                if (selectableCards.has(cardId))
                  setSelectedSource(
                    selected?.kind === "hand" && selected.cardId === cardId
                      ? null
                      : { kind: "hand", cardId },
                  );
              }
            : undefined
        }
        onStockClick={
          canInteract && moves.stockToBuild.length > 0
            ? () =>
                setSelectedSource(
                  selected?.kind === "stock" ? null : { kind: "stock" },
                )
            : undefined
        }
        onDiscardClick={
          canInteract
            ? (pileIndex) => {
                if (
                  selected?.kind === "hand" &&
                  discardTargets.has(pileIndex) &&
                  !selectableDiscardPiles.has(pileIndex)
                )
                  submit({
                    kind: "DISCARD_FROM_HAND",
                    cardId: selected.cardId,
                    pileIndex,
                  });
                else if (selectableDiscardPiles.has(pileIndex))
                  setSelectedSource(
                    selected?.kind === "discard" &&
                      selected.pileIndex === pileIndex
                      ? null
                      : { kind: "discard", pileIndex },
                  );
              }
            : undefined
        }
        onBuildPileClick={
          selected
            ? (target) => {
                if (buildTargets.has(target))
                  submit(
                    selected.kind === "hand"
                      ? {
                          kind: "PLAY_HAND_TO_BUILD",
                          cardId: selected.cardId,
                          target,
                        }
                      : selected.kind === "stock"
                        ? { kind: "PLAY_STOCK_TO_BUILD", target }
                        : {
                            kind: "PLAY_DISCARD_TO_BUILD",
                            pileIndex: selected.pileIndex,
                            target,
                          },
                  );
              }
            : undefined
        }
        playableHandCards={canInteract ? selectableCards : new Set()}
        selectedHandCard={selected?.kind === "hand" ? selected.cardId : null}
        isStockPlayable={canInteract && moves.stockToBuild.length > 0}
        isStockSelected={selected?.kind === "stock"}
        selectedDiscardPile={
          selected?.kind === "discard" ? selected.pileIndex : null
        }
        playableBuildPiles={buildTargets}
        playableDiscardPiles={visibleDiscardPiles}
        handDiscardTargets={overlappingDiscardTargets}
        onHandDiscardClick={
          selected?.kind === "hand"
            ? (pileIndex) => {
                if (discardTargets.has(pileIndex))
                  submit({
                    kind: "DISCARD_FROM_HAND",
                    cardId: selected.cardId,
                    pileIndex,
                  });
              }
            : undefined
        }
      />
      {canEndTurn && (
        <button
          type="button"
          className="brutal-button"
          onClick={() => submit({ kind: "END_TURN" })}
        >
          End Turn
        </button>
      )}
    </section>
  );
}
