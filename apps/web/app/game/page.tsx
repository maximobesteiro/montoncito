"use client";

import { useState, useEffect } from "react";
import { GameBoard } from "@/components/game/GameBoard";
import { ActionPanel } from "@/components/game/ActionPanel";
import { ChatPanel } from "@/components/game/ChatPanel";
import { PresenceIndicator } from "@/components/game/PresenceIndicator";
import { EndGameScreen } from "@/components/game/EndGameScreen";
import { createMockGameState } from "@/lib/mock-game-state";
import type { GameState, Move } from "@mont/core-game";
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

type SelectedSource =
  | { type: "hand"; cardId: string }
  | { type: "stock" }
  | { type: "discard"; pileIndex: number }
  | null;

export default function GamePage() {
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
    if (!storeGameState) {
      setGameState(mockState);
    }
    if (!storePlayerId) {
      setCurrentPlayerId("P1");
    }
  }, [
    storeGameState,
    storePlayerId,
    mockState,
    setGameState,
    setCurrentPlayerId,
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

  const handleDiscardCard = (cardId: string, pileIndex: number) => {
    if (!isMyTurn) return;
    const move = createMove(gameState, currentPlayerId, {
      type: "discard",
      cardId,
      pileIndex,
    });
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
        setTimeout(() => removePendingAction(move), 1000);
      }
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4 p-2 sm:p-4 min-h-screen bg-gray-50">
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
          <div className="mt-4 p-4 brutal-border bg-yellow-100 brutal-shadow">
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
              className="mt-2 brutal-button bg-gray-500 text-white hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="lg:w-80 space-y-4">
        <ActionPanel gameState={gameState} currentPlayerId={currentPlayerId} />
        <PresenceIndicator
          gameState={gameState}
          currentPlayerId={currentPlayerId}
        />
      </div>

      <ChatPanel />
      <EndGameScreen gameState={gameState} currentPlayerId={currentPlayerId} />
    </div>
  );
}
