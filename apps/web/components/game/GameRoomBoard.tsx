"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  useDndContext,
  type DragStartEvent,
} from "@dnd-kit/core";
import { createPortal } from "react-dom";
import type {
  BuildPileTarget,
  Card as GameCard,
  GameState,
  PlayerId,
} from "@mont/core-game";
import { peekTopCard, validateMove } from "@mont/core-game";
import type { ActionSubmission, PlayerAction } from "@mont/game-room";
import { getValidMoves } from "@/lib/game-actions";
import { formatCardName } from "@/lib/format-card-name";
import { GameBoard } from "./GameBoard";
import { Card, type CardSize } from "./Card";

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

// Touch needs touchmove prevention only after the hold. Pointer events cannot
// prevent native panning once it starts, so reserve that sensor for mouse/pen.
class BoardPointerSensor extends PointerSensor {
  static activators: typeof PointerSensor.activators =
    PointerSensor.activators.map(
      (activator): (typeof PointerSensor.activators)[number] => ({
        ...activator,
        handler: (event, options) =>
          event.nativeEvent.pointerType !== "touch" &&
          activator.handler(event, options),
      }),
    );
}

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

function cancelSensor() {
  // The classic dnd-kit sensor exposes cancellation through keyboard input.
  // Escape detaches its listeners and stops auto-scroll, even before activation.
  document.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
    }),
  );
}

function DestinationMeasurements() {
  const { active, measureDroppableContainers } = useDndContext();
  useEffect(() => {
    if (!active) return;
    // Capture includes nested board scrolling and document scrolling. The latter
    // can change viewport bounds without resizing a pile or its scroll ancestors.
    const refresh = () => measureDroppableContainers([]);
    document.addEventListener("scroll", refresh, true);
    return () => document.removeEventListener("scroll", refresh, true);
  }, [active, measureDroppableContainers]);
  return null;
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
  const [moving, setMoving] = useState<{
    card: GameCard;
    size: CardSize;
  } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const pickup = useRef<DOMRect | null>(null);
  const targetingActive = useRef(false);
  const submitted = useRef(false);
  const myTurn =
    gameState.phase === "turn" &&
    gameState.turn.activePlayer === currentPlayerId;
  const canInteract = myTurn && canSubmit && !pendingAction && !chatOpen;
  const moves = getValidMoves(gameState, currentPlayerId);
  const selectableCards = new Set([
    ...moves.handToBuild.map((move) => move.cardId),
    ...moves.canDiscard.map((move) => move.cardId),
  ]);
  const selectableDiscardPiles = new Set(
    moves.discardToBuild.map((move) => move.pileIndex),
  );
  const selected =
    canInteract &&
    selectedSource &&
    (selectedSource.kind === "hand"
      ? selectableCards.has(selectedSource.cardId)
      : selectedSource.kind === "stock"
        ? moves.stockToBuild.length > 0
        : selectableDiscardPiles.has(selectedSource.pileIndex))
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
  const visibleDiscardPiles = new Set(
    canInteract ? [...selectableDiscardPiles, ...discardTargets] : [],
  );
  const overlappingDiscardTargets = new Set(
    [...discardTargets].filter((index) => selectableDiscardPiles.has(index)),
  );
  const handDiscardOnlyTargets = new Set(
    [...discardTargets].filter((index) => !selectableDiscardPiles.has(index)),
  );
  const canEndTurn =
    canInteract && validateMove(gameState, { kind: "END_TURN" }) === null;

  const sensors = useSensors(
    useSensor(BoardPointerSensor, {
      activationConstraint: { distance: 5 },
      onActivation({ event }) {
        // Capture before selection collapses legal histories and reflows the board.
        pickup.current =
          (event.target as Element)
            .closest<HTMLElement>("[data-drag-source]")
            ?.getBoundingClientRect() ?? null;
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
      onActivation({ event }) {
        pickup.current =
          (event.target as Element)
            .closest<HTMLElement>("[data-drag-source]")
            ?.getBoundingClientRect() ?? null;
      },
    }),
  );

  const clearSelection = useCallback(() => {
    if (targetingActive.current) setCancelled(true);
    targetingActive.current = false;
    setMoving(null);
    setSelectedSource(null);
  }, []);

  const cancelSelection = useCallback(() => {
    cancelSensor();
    clearSelection();
  }, [clearSelection]);

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
      submitted.current = false;
      targetingActive.current = true;
      setCancelled(false);
      setSelectedSource(source);
    }
  }

  useEffect(() => {
    cancelSelection();
    submitted.current = false;
  }, [seq, gameState, cancelSelection]);
  useEffect(() => {
    if (!canInteract) cancelSelection();
  }, [canInteract, cancelSelection]);
  useEffect(() => {
    window.addEventListener("blur", cancelSelection);
    return () => {
      window.removeEventListener("blur", cancelSelection);
      cancelSensor();
    };
  }, [cancelSelection]);

  function submit(action: PlayerAction) {
    if (!canInteract || submitted.current) return;
    if (submitAction(action)) {
      submitted.current = true;
      targetingActive.current = false;
      setSelectedSource(null);
    }
  }

  function startDrag({ active }: DragStartEvent) {
    if (!canInteract) return;
    const id = String(active.id);
    const source: SelectedSource | null =
      id === "stock" && moves.stockToBuild.length
        ? { kind: "stock" }
        : id.startsWith("hand:") && selectableCards.has(id.slice(5))
          ? { kind: "hand", cardId: id.slice(5) }
          : id.startsWith("discard:") &&
              selectableDiscardPiles.has(Number(id.slice(8)))
            ? { kind: "discard", pileIndex: Number(id.slice(8)) }
            : null;
    if (!source) return;
    targetingActive.current = true;
    submitted.current = false;
    setCancelled(false);
    setSelectedSource(source);
    setMoving(active.data.current as { card: GameCard; size: CardSize });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Select a card with Enter or Space, then activate a legal destination. Escape cancels selection.",
        },
        announcements: {
          onDragStart: () => undefined,
          onDragOver: ({ over }) =>
            over
              ? `Over ${over.data.current?.label}. Release to play.`
              : "Outside legal destinations. Release to cancel.",
          onDragEnd: () => undefined,
          onDragCancel: () => undefined,
        },
      }}
      onDragStart={startDrag}
      onDragCancel={() => {
        clearSelection();
      }}
      onDragEnd={({ over }) => {
        const source = selected;
        const target = over?.data.current;
        setMoving(null);
        if (
          source &&
          target?.buildId !== undefined &&
          buildTargets.has(target.buildId)
        ) {
          submit(playToBuild(source, target.buildId));
          setSelectedSource(null);
        } else if (
          source?.kind === "hand" &&
          target?.discardIndex !== undefined &&
          discardTargets.has(target.discardIndex)
        ) {
          submit(discardFromHand(source.cardId, target.discardIndex));
          setSelectedSource(null);
        } else cancelSelection();
      }}
    >
      <DestinationMeasurements />
      <section
        aria-label="Game board"
        onLostPointerCapture={
          moving
            ? (event) => {
                // Touch implicitly releases pointer capture before touchend. The touch
                // sensor owns touchcancel; this is only an interruption for pointers.
                if (event.pointerType !== "touch") cancelSelection();
              }
            : undefined
        }
        onClick={(event) => {
          if (
            !(event.target as Element).closest(
              "button, a, input, textarea, [data-pile-inspection], .game-room-chat",
            )
          )
            cancelSelection();
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
          collapsedDiscardDestinations={discardTargets}
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
                  if (
                    selected?.kind === "hand" &&
                    discardTargets.has(pileIndex)
                  )
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
      {typeof document !== "undefined" &&
        createPortal(
          <DragOverlay
            dropAnimation={null}
            modifiers={[
              ({ transform, activeNodeRect }) => ({
                ...transform,
                x:
                  transform.x +
                  (pickup.current && activeNodeRect
                    ? pickup.current.left - activeNodeRect.left
                    : 0),
                y:
                  transform.y +
                  (pickup.current && activeNodeRect
                    ? pickup.current.top - activeNodeRect.top
                    : 0),
              }),
            ]}
          >
            {moving && (
              <Card
                card={moving.card}
                size={moving.size}
                ariaLabel={`Moving ${formatCardName(moving.card)}`}
              />
            )}
          </DragOverlay>,
          document.body,
        )}
    </DndContext>
  );
}
