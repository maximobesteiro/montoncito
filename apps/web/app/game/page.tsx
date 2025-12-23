"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { GameBoard } from "@/components/game/GameBoard";
import { ActionPanel } from "@/components/game/ActionPanel";
import { ChatPanel } from "@/components/game/ChatPanel";
import { PresenceIndicator } from "@/components/game/PresenceIndicator";
import { EndGameScreen } from "@/components/game/EndGameScreen";
import { HowToPlayModal } from "@/components/HowToPlayModal";
import { createMockGameState } from "@/lib/mock-game-state";
import type { GameState } from "@mont/core-game";
import {
  getPlayableHandCards,
  getPlayableDiscardPiles,
  isStockPlayable,
  getPlayableBuildPiles,
  createMove,
  isValidMove,
} from "@/lib/game-actions";
import { applyMove } from "@mont/core-game";
import { useGameStore } from "@/stores/game-store";
import { useWebSocket } from "@/lib/use-websocket";
import { apiFetch, getOrCreateClientId } from "@/lib/api";

type SelectedSource =
  | { type: "hand"; cardId: string }
  | { type: "stock" }
  | { type: "discard"; pileIndex: number }
  | null;

export default function GamePage() {
  const searchParams = useSearchParams();
  const roomFromUrl = searchParams.get("room");

  // Get state from store with selectors to prevent unnecessary re-renders
  const storeGameState = useGameStore((state) => state.gameState);
  const storePlayerId = useGameStore((state) => state.currentPlayerId);
  const roomId = useGameStore((state) => state.roomId);

  // Get actions (these don't need selectors as they're stable references)
  const {
    setGameState,
    setCurrentPlayerId,
    setRoomId,
    addPendingAction,
    removePendingAction,
  } = useGameStore();

  // Use mock data if no store state (for development)
  const [mockState] = useState<GameState>(createMockGameState());
  const gameState = storeGameState || mockState;
  const currentPlayerId = storePlayerId || "P1";

  // Initialize store with mock data if needed
  useEffect(() => {
    // Seed roomId from URL if present
    if (roomFromUrl && roomFromUrl !== roomId) {
      setRoomId(roomFromUrl);
    }

    // Seed player id from persisted client id
    if (!storePlayerId) {
      try {
        setCurrentPlayerId(getOrCreateClientId() as any);
      } catch {
        setCurrentPlayerId("P1");
      }
    }

    // If a real room is provided, prefer REST seed over mock
    if (roomFromUrl) {
      const clientId = (() => {
        try {
          return getOrCreateClientId();
        } catch {
          return null;
        }
      })();

      if (clientId) {
        void apiFetch<{ state: GameState }>(`/rooms/${roomFromUrl}/game`, {
          method: "GET",
          clientId,
        })
          .then((data) => setGameState(data.state))
          .catch(() => {
            // Fallback to mock if game not started or fetch fails
            if (!storeGameState) setGameState(mockState);
          });
        return;
      }
    }

    // Otherwise use mock data
    if (!storeGameState) setGameState(mockState);
  }, [
    storeGameState,
    storePlayerId,
    mockState,
    setGameState,
    setCurrentPlayerId,
    setRoomId,
    roomFromUrl,
    roomId,
  ]);

  // WebSocket connection (will be used when backend is ready)
  // For now, we'll use local state updates
  const token = null; // In real app, get from auth
  const { sendAction } = useWebSocket({
    roomId,
    token,
    currentPlayerId: storePlayerId,
  });

  const [selectedSource, setSelectedSource] = useState<SelectedSource>(null);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);

  const playableHandCards = getPlayableHandCards(gameState, currentPlayerId);
  const playableDiscardPiles = getPlayableDiscardPiles(
    gameState,
    currentPlayerId
  );
  const stockPlayable = isStockPlayable(gameState, currentPlayerId);
  const playableBuildPiles = getPlayableBuildPiles(gameState, currentPlayerId);

  const isMyTurn =
    gameState.phase === "turn" &&
    gameState.turn.activePlayer === currentPlayerId;

  const handleHandCardClick = (cardId: string) => {
    if (!isMyTurn) return;
    const isPlayable = playableHandCards.has(cardId);
    if (isPlayable) {
      setSelectedSource({ type: "hand", cardId });
    }
  };

  const handleStockClick = () => {
    if (!isMyTurn || !stockPlayable) return;
    setSelectedSource({ type: "stock" });
  };

  const handleDiscardClick = (pileIndex: number) => {
    if (!isMyTurn) return;
    const isPlayable = playableDiscardPiles.has(pileIndex);
    if (isPlayable) {
      setSelectedSource({ type: "discard", pileIndex });
    }
  };

  const handleBuildPileClick = (buildId: string) => {
    if (!isMyTurn || !selectedSource) return;

    let move: ReturnType<typeof createMove> = null;
    if (selectedSource.type === "hand") {
      move = createMove(gameState, currentPlayerId, {
        type: "play-hand",
        cardId: selectedSource.cardId,
        buildId,
      });
    } else if (selectedSource.type === "stock") {
      move = createMove(gameState, currentPlayerId, {
        type: "play-stock",
        buildId,
      });
    } else if (selectedSource.type === "discard") {
      move = createMove(gameState, currentPlayerId, {
        type: "play-discard",
        pileIndex: selectedSource.pileIndex,
        buildId,
      });
    }

    if (move && isValidMove(gameState, move)) {
      // Optimistic update
      const result = applyMove(gameState, move);
      setGameState(result.state);
      setSelectedSource(null);

      // Send to server via WebSocket (if connected)
      if (roomId && sendAction) {
        const actionId = `action-${Date.now()}-${Math.random()}`;
        addPendingAction(move);
        sendAction(move, actionId);
        // In real implementation, remove from pending when server confirms
        setTimeout(() => removePendingAction(move), 1000);
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-2 sm:p-4 min-h-screen bg-muted">
      <div className="flex-1">
        <GameBoard
          gameState={gameState}
          currentPlayerId={currentPlayerId}
          onHandCardClick={handleHandCardClick}
          onStockClick={handleStockClick}
          onDiscardClick={handleDiscardClick}
          onBuildPileClick={handleBuildPileClick}
          playableHandCards={playableHandCards}
          isStockPlayable={stockPlayable}
          playableDiscardPiles={playableDiscardPiles}
          playableBuildPiles={playableBuildPiles}
        />
        {selectedSource && (
          <div className="mt-4 p-4 brutal-border bg-warning-bg brutal-shadow">
            <p className="font-bold">
              Selected:{" "}
              {selectedSource.type === "hand"
                ? `Hand card ${selectedSource.cardId}`
                : selectedSource.type === "stock"
                  ? "Stock top"
                  : `Discard pile ${selectedSource.pileIndex + 1}`}
            </p>
            <p className="text-sm mt-2">
              Click on a build pile to play, or click here to cancel
            </p>
            <button
              onClick={() => setSelectedSource(null)}
              className="mt-2 brutal-button bg-btn-neutral text-text-on-dark hover:bg-btn-neutral-hover"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="lg:w-80 space-y-4">
        <button
          onClick={() => setIsHowToPlayOpen(true)}
          className="brutal-button bg-btn-neutral text-text-on-dark hover:bg-btn-neutral-hover w-full"
        >
          How to play
        </button>
        <ActionPanel gameState={gameState} currentPlayerId={currentPlayerId} />
        <PresenceIndicator
          gameState={gameState}
          currentPlayerId={currentPlayerId}
        />
      </div>

      <ChatPanel />
      <EndGameScreen gameState={gameState} currentPlayerId={currentPlayerId} />

      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />
    </div>
  );
}
