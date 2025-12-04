import { create } from "zustand";
import type { GameState, Move, PlayerId } from "@mont/core-game";

interface GameStore {
  // Game state
  gameState: GameState | null;
  setGameState: (state: GameState) => void;

  // Connection status
  isConnected: boolean;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  setConnectionStatus: (
    status: "disconnected" | "connecting" | "connected" | "error"
  ) => void;

  // Current player
  currentPlayerId: PlayerId | null;
  setCurrentPlayerId: (id: PlayerId) => void;

  // Room info
  roomId: string | null;
  setRoomId: (id: string | null) => void;

  // Pending actions (optimistic updates)
  pendingActions: Array<{ move: Move; timestamp: number }>;
  addPendingAction: (move: Move) => void;
  removePendingAction: (move: Move) => void;
  clearPendingActions: () => void;

  // Last seen sequence number (for reconnection)
  lastSeq: number;
  setLastSeq: (seq: number) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  // Game state
  gameState: null,
  setGameState: (state) => set({ gameState: state }),

  // Connection status
  isConnected: false,
  connectionStatus: "disconnected",
  setConnectionStatus: (status) =>
    set({
      connectionStatus: status,
      isConnected: status === "connected",
    }),

  // Current player
  currentPlayerId: null,
  setCurrentPlayerId: (id) => set({ currentPlayerId: id }),

  // Room info
  roomId: null,
  setRoomId: (id) => set({ roomId: id }),

  // Pending actions
  pendingActions: [],
  addPendingAction: (move) =>
    set((state) => ({
      pendingActions: [
        ...state.pendingActions,
        { move, timestamp: Date.now() },
      ],
    })),
  removePendingAction: (move) =>
    set((state) => ({
      pendingActions: state.pendingActions.filter(
        (pa) => pa.move !== move
      ),
    })),
  clearPendingActions: () => set({ pendingActions: [] }),

  // Last seen sequence
  lastSeq: 0,
  setLastSeq: (seq) => set({ lastSeq: seq }),
}));


