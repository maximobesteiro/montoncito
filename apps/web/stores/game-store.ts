import { create } from "zustand";
import type { PlayerId } from "@mont/core-game";

interface GameStore {
  currentPlayerId: PlayerId | null;
  setCurrentPlayerId: (id: PlayerId) => void;

  roomId: string | null;
  setRoomId: (id: string | null) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  currentPlayerId: null,
  setCurrentPlayerId: (id) => set({ currentPlayerId: id }),

  roomId: null,
  setRoomId: (id) => set({ roomId: id }),
}));
