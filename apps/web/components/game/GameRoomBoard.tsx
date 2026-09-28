"use client";

import { useState } from "react";
import type { BuildPileTarget, GameState, PlayerId } from "@mont/core-game";
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

export function GameRoomBoard({
  gameState,
  currentPlayerId,
  pendingAction,
  canSubmit,
  submitAction,
}: GameRoomBoardProps) {
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
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
    canInteract && selectedCardId && selectableCards.has(selectedCardId)
      ? selectedCardId
      : null;
  const buildTargets = new Set<BuildPileTarget>(
    selected
      ? moves.handToBuild
          .filter((move) => move.cardId === selected)
          .map((move) => move.buildId)
      : [],
  );
  const discardTargets = new Set<number>(
    selected
      ? moves.canDiscard
          .filter((move) => move.cardId === selected)
          .map((move) => move.pileIndex)
      : [],
  );

  function submit(action: PlayerAction) {
    if (!canInteract) return;
    if (submitAction(action)) setSelectedCardId(null);
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
                  setSelectedCardId(selected === cardId ? null : cardId);
              }
            : undefined
        }
        onDiscardClick={
          selected
            ? (pileIndex) => {
                if (discardTargets.has(pileIndex))
                  submit({
                    kind: "DISCARD_FROM_HAND",
                    cardId: selected,
                    pileIndex,
                  });
              }
            : undefined
        }
        onBuildPileClick={
          selected
            ? (target) => {
                if (buildTargets.has(target))
                  submit({
                    kind: "PLAY_HAND_TO_BUILD",
                    cardId: selected,
                    target,
                  });
              }
            : undefined
        }
        playableHandCards={canInteract ? selectableCards : new Set()}
        selectedHandCard={selected}
        playableBuildPiles={buildTargets}
        playableDiscardPiles={discardTargets}
      />
    </section>
  );
}
