"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { BuildPileTarget, GameState, PlayerId } from "@mont/core-game";
import { validateMove } from "@mont/core-game";
import type { ActionSubmission, PlayerAction } from "@mont/game-room";
import { getValidMoves } from "@/lib/game-actions";
import { GameBoard } from "./GameBoard";
import { formatCardName } from "@/lib/format-card-name";
import { peekTopCard } from "@mont/core-game";

interface GameRoomBoardProps {
  chat?: ReactNode;
  chatOpen?: boolean;
  seq: number | null;
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

type Drag = {
  pointerId: number;
  source: SelectedSource;
  wasSelected: boolean;
  startX: number;
  startY: number;
  moved: boolean;
};

function playToBuild(
  source: SelectedSource,
  target: BuildPileTarget,
): PlayerAction {
  switch (source.kind) {
    case "hand":
      return { kind: "PLAY_HAND_TO_BUILD", cardId: source.cardId, target };
    case "stock":
      return { kind: "PLAY_STOCK_TO_BUILD", target };
    case "discard":
      return {
        kind: "PLAY_DISCARD_TO_BUILD",
        pileIndex: source.pileIndex,
        target,
      };
  }
}

function discardFromHand(cardId: string, pileIndex: number): PlayerAction {
  return { kind: "DISCARD_FROM_HAND", cardId, pileIndex };
}

export function GameRoomBoard({
  chat,
  chatOpen = false,
  seq,
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
  const [targetingComplete, setTargetingComplete] = useState(true);
  const [cancelled, setCancelled] = useState(false);
  const board = useRef<HTMLElement>(null);
  const suppressPointerClick = useRef(false);
  const scrollFrame = useRef<number | null>(null);
  const scrollDirection = useRef(0);
  const myTurn =
    gameState.phase === "turn" &&
    gameState.turn.activePlayer === currentPlayerId;
  const canInteract = myTurn && canSubmit && !pendingAction && !chatOpen;
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

  function stopScrolling() {
    scrollDirection.current = 0;
    if (scrollFrame.current !== null) {
      window.cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = null;
    }
  }

  function cancelDrag() {
    drag.current = null;
    stopScrolling();
  }

  function cancelSelection() {
    setSelectedSource(null);
    setCancelled(true);
    setTargetingComplete(true);
    cancelDrag();
  }

  function selectSource(source: SelectedSource) {
    const same =
      selected?.kind === source.kind &&
      (source.kind === "hand"
        ? selected.kind === "hand" && selected.cardId === source.cardId
        : source.kind === "discard"
          ? selected.kind === "discard" &&
            selected.pileIndex === source.pileIndex
          : true);
    if (same) cancelSelection();
    else {
      setCancelled(false);
      setTargetingComplete(true);
      setSelectedSource(source);
    }
  }

  useEffect(() => {
    if (chatOpen) {
      setSelectedSource(null);
      cancelDrag();
      suppressPointerClick.current = true;
    }
  }, [chatOpen]);

  // New Authoritative state cancels gameplay gestures, but keeps inspection open.
  useEffect(() => {
    setSelectedSource(null);
    cancelDrag();
    suppressPointerClick.current = false;
  }, [seq, gameState]);

  useEffect(() => {
    if (!canInteract) {
      setSelectedSource(null);
      cancelDrag();
    }
  }, [canInteract]);

  useEffect(() => {
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("blur", cancelDrag);
      cancelDrag();
    };
  }, []);

  function scrollTowardTargets() {
    if (!drag.current || !scrollDirection.current) {
      scrollFrame.current = null;
      return;
    }
    const page = scrollablePage();
    (page ?? window).scrollBy(0, scrollDirection.current * 12);
    scrollFrame.current = window.requestAnimationFrame(scrollTowardTargets);
  }

  function scrollablePage() {
    const page =
      board.current?.closest<HTMLElement>(".app-shell") ??
      board.current?.closest<HTMLElement>(".game-room-page");
    return page &&
      page.clientHeight > 0 &&
      page.scrollHeight > page.clientHeight
      ? page
      : null;
  }

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
    stopScrolling();
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
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    setTargetingComplete(false);
    setCancelled(false);
    setSelectedSource(source);
    element.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !canInteract)
      return;
    if (
      Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      ) > 5
    ) {
      gesture.moved = true;
    }
    if (!gesture.moved) return;
    const bottom =
      scrollablePage()?.getBoundingClientRect().bottom ?? window.innerHeight;
    scrollDirection.current =
      event.clientY < 48 ? -1 : event.clientY > bottom - 48 ? 1 : 0;
    if (!scrollDirection.current) stopScrolling();
    else if (scrollFrame.current === null) {
      scrollFrame.current = window.requestAnimationFrame(scrollTowardTargets);
    }
  }

  function finishDrag(event: PointerEvent<HTMLElement>) {
    const gesture = drag.current;
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    drag.current = null;
    setTargetingComplete(true);
    stopScrolling();
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
      submit(playToBuild(source, build));
    } else if (
      source.kind === "hand" &&
      discard !== undefined &&
      moves.canDiscard.some(
        (move) =>
          move.cardId === source.cardId && move.pileIndex === Number(discard),
      )
    ) {
      submit(discardFromHand(source.cardId, Number(discard)));
    } else if (
      gesture.wasSelected &&
      !gesture.moved &&
      Math.hypot(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      ) <= 5 &&
      hit.closest("[data-drag-source]") ===
        (event.target as Element).closest("[data-drag-source]")
    ) {
      cancelSelection();
    }
  }

  return (
    <section
      ref={board}
      aria-label="Game board"
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={(event) => {
        if (drag.current?.pointerId === event.pointerId) {
          cancelDrag();
        }
      }}
      onClickCapture={(event) => {
        if ((event.target as Element).closest(".game-room-chat")) return;
        if (suppressPointerClick.current && event.detail > 0) {
          event.stopPropagation();
          event.preventDefault();
          suppressPointerClick.current = false;
        }
      }}
      onClick={(event) => {
        if (
          !(event.target as Element).closest(
            "button, a, input, textarea, [data-pile-inspection], .game-room-chat",
          )
        )
          cancelSelection();
        else if (event.target === event.currentTarget) cancelSelection();
      }}
      onKeyDown={(event) => {
        if (
          event.key === "Escape" &&
          !(event.target as Element).closest(".game-room-chat")
        ) {
          event.preventDefault();
          cancelSelection();
        }
      }}
    >
      {pendingAction && (
        <p role="status" className="font-semibold">
          Action pending. Waiting for the server before you can play again.
        </p>
      )}
      <GameBoard
        collapsedDiscardDestinations={
          targetingComplete ? discardTargets : new Set()
        }
        pendingAction={pendingAction?.action}
        chat={chat}
        gameState={gameState}
        currentPlayerId={currentPlayerId}
        onHandCardClick={
          canInteract
            ? (cardId) => {
                if (selectableCards.has(cardId))
                  selectSource({ kind: "hand", cardId });
              }
            : undefined
        }
        onStockClick={
          canInteract && moves.stockToBuild.length > 0
            ? () => selectSource({ kind: "stock" })
            : undefined
        }
        onDiscardClick={
          canInteract
            ? (pileIndex) => {
                if (selected?.kind === "hand" && discardTargets.has(pileIndex))
                  submit(discardFromHand(selected.cardId, pileIndex));
                else if (selectableDiscardPiles.has(pileIndex))
                  selectSource({ kind: "discard", pileIndex });
              }
            : undefined
        }
        onBuildPileClick={
          selected
            ? (target) => {
                if (buildTargets.has(target))
                  submit(playToBuild(selected, target));
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
                  submit(discardFromHand(selected.cardId, pileIndex));
              }
            : undefined
        }
      />
      {!pendingAction && gameState.phase === "turn" && (
        <p role="status" className="sr-only">
          {selected
            ? `${selected.kind === "hand" ? `Hand ${formatCardName(gameState.byId[currentPlayerId]!.hand.cards.find((card) => card.id === selected.cardId)!)}` : selected.kind === "stock" ? `Stock top ${formatCardName(peekTopCard(gameState.byId[currentPlayerId]!.stock.faceDown)!)}` : `Discard pile ${selected.pileIndex + 1}`} selected. ${buildTargets.size} legal Build destinations and ${discardTargets.size} legal Discard destinations. Activate a destination to play. Press Escape to cancel.`
            : cancelled
              ? "Selection cancelled. Inspection restored."
              : "Select an available card to see legal destinations."}
        </p>
      )}
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
