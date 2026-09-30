import { createRoot } from "react-dom/client";
import Home from "@/app/page";
import Lobby from "@/app/room/[slug]/page";
import GameRoom from "@/app/game/[roomId]/page";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";

// The browser uses the real pages and transport. Only Next's router is replaced
// so this test can run without a second application server.
const root = createRoot(document.getElementById("root")!);
const router = {
  push(path: string) {
    history.pushState({}, "", path);
    render();
  },
  replace(path: string) {
    history.replaceState({}, "", path);
    render();
  },
};
export const useRouter = () => router;
export const useParams = () => {
  const [, route, id] = location.pathname.split("/");
  return route === "room" ? { slug: id } : { roomId: id };
};
function render() {
  const route = location.pathname.split("/")[1];
  root.render(
    <ThemeProvider>
      <ToastProvider>
        <AppShell>
          {route === "game" ? (
            <GameRoom />
          ) : route === "room" ? (
            <Lobby />
          ) : (
            <Home />
          )}
        </AppShell>
      </ToastProvider>
    </ThemeProvider>,
  );
}
window.addEventListener("popstate", render);
render();
