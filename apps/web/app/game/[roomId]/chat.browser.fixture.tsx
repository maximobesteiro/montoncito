import { createRoot } from "react-dom/client";
import type { PlayerAction } from "@mont/game-room";
import GameRoomPage from "./page";
import { denseBoardState } from "./dense-board.fixture";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";

// This browser entry uses the same controlled page seam as page.test.tsx.
// The layout test's Vite build substitutes only navigation and the room hook.
declare global {
  interface Window {
    __roomView: Record<string, unknown>;
    chatTest: {
      actions: PlayerAction[];
      update: (view: Record<string, unknown>) => void;
    };
  }
}

const root = createRoot(document.getElementById("root")!);
const actions: PlayerAction[] = [];
window.__roomView = {
  state: denseBoardState(4),
  seq: 0,
  currentPlayerId: "player-1",
  connectionStatus: "connected",
  pendingAction: null,
  chatMessages: Array.from({ length: 100 }, (_, index) => ({
    id: `message-${index}`,
    playerId: "player-2",
    playerName: "Bob",
    text: `Message ${index} ${"a long conversation ".repeat(5)}`,
    timestamp: index,
  })),
  liveChatCount: 0,
  submitAction: (action: PlayerAction) => {
    actions.push(action);
    return true;
  },
  sendChat: () => true,
};
window.chatTest = {
  actions,
  update(view) {
    window.__roomView = { ...window.__roomView, ...view };
    root.render(
      <ThemeProvider>
        <AppShell>
          <GameRoomPage />
        </AppShell>
      </ThemeProvider>,
    );
  },
};
window.chatTest.update({});
