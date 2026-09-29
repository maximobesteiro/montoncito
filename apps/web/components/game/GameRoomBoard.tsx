"use client";

import { useRef, useState, type PointerEvent } from "react";
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

type Drag = { pointerId: number; source: SelectedSource; wasSelected: boolean };

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
  const drag = useRef<Drag | null>(null);
  const suppressPointerClick = useRef(false);
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
  const handDiscardOnlyTargets = new Set(
    [...discardTargets].filter(
      (pileIndex) => !selectableDiscardPiles.has(pileIndex),
    ),
  );
  const canEndTurn =
    canInteract && validateMove(gameState, { kind: "END_TURN" }) === null;

  function submit(action: PlayerAction) {
    if (!canInteract) return;
    if (submitAction(action)) setSelectedSource(null);
  }

  function startDrag(event: PointerEvent<HTMLElement>) {
    suppressPointerClick.current = false;
    if (
      !canInteract ||
      event.isPrimary === false ||
      (event.pointerType === "mouse" && event.button !== 0)
    )
      return;
    const element = (event.target as Element).closest<HTMLElement>(
      "[data-drag-source]",
    );
    if (!element || !event.currentTarget.contains(element)) return;
    const sourceName = element.dataset.dragSource;
    const source: SelectedSource | null =
      sourceName === "stock"
        ? moves.stockToBuild.length
          ? { kind: "stock" }
          : null
        : sourceName?.startsWith("hand:")
          ? selectableCards.has(sourceName.slice(5))
            ? { kind: "hand", cardId: sourceName.slice(5) }
            : null
          : sourceName?.startsWith("discard:")
            ? selectableDiscardPiles.has(Number(sourceName.slice(8)))
              ? { kind: "discard", pileIndex: Number(sourceName.slice(8)) }
              : null
            : null;
    if (!source) return;
    drag.current = {
      pointerId: event.pointerId,
      source,
      wasSelected:
        source.kind === "hand"
          ? selected?.kind === "hand" && selected.cardId === source.cardId
          : source.kind === "discard"
            ? selected?.kind === "discard" &&
              selected.pileIndex === source.pileIndex
            : selected?.kind === "stock",
    };
    setSelectedSource(source);
    element.setPointerCapture?.(event.pointerId);
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    drag.current = null;
    suppressPointerClick.current = true;
    if (!canInteract || event.type === "pointercancel") return;

    // Pointer capture keeps the gesture on its source. Hit-test at release to find the destination.
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    if (!hit || !event.currentTarget.contains(hit)) return;
    const build =
      hit.closest<HTMLElement>("[data-drop-build]")?.dataset.dropBuild;
    const discard = hit.closest<HTMLElement>("[data-drop-discard]")?.dataset
      .dropDiscard;
    const { source } = gesture;
    if (
      build &&
      (source.kind === "hand"
        ? moves.handToBuild.some(
            (move) => move.cardId === source.cardId && move.buildId === build,
          )
        : source.kind === "stock"
          ? moves.stockToBuild.some((move) => move.buildId === build)
          : moves.discardToBuild.some(
              (move) =>
                move.pileIndex === source.pileIndex && move.buildId === build,
            ))
    ) {
      submit(
        source.kind === "hand"
          ? { kind: "PLAY_HAND_TO_BUILD", cardId: source.cardId, target: build }
          : source.kind === "stock"
            ? { kind: "PLAY_STOCK_TO_BUILD", target: build }
            : {
                kind: "PLAY_DISCARD_TO_BUILD",
                pileIndex: source.pileIndex,
                target: build,
              },
      );
    } else if (
      source.kind === "hand" &&
      discard !== undefined &&
      moves.canDiscard.some(
        (move) =>
          move.cardId === source.cardId && move.pileIndex === Number(discard),
      )
    ) {
      submit({
        kind: "DISCARD_FROM_HAND",
        cardId: source.cardId,
        pileIndex: Number(discard),
      });
    } else if (
      gesture.wasSelected &&
      hit.closest("[data-drag-source]") ===
        (event.target as Element).closest("[data-drag-source]")
    ) {
      setSelectedSource(null);
    }
  }

  return (
    <section
      aria-label="Game board"
      onPointerDown={startDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClickCapture={(event) => {
        if (suppressPointerClick.current && event.detail > 0) {
          event.stopPropagation();
          event.preventDefault();
          suppressPointerClick.current = false;
        }
      }}
    >
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
        handDiscardOnlyTargets={handDiscardOnlyTargets}
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
