import { createRoot } from "react-dom/client";
import { useSyncExternalStore } from "react";
import WaitingRoomPage from "./page";
import Home from "../../page";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";

function Pages() {
  const path = useSyncExternalStore(
    (notify) => {
      window.addEventListener("popstate", notify);
      return () => window.removeEventListener("popstate", notify);
    },
    () => window.location.pathname,
  );
  return path === "/" ? <Home /> : <WaitingRoomPage />;
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ToastProvider>
      <AppShell>
        <Pages />
      </AppShell>
    </ToastProvider>
  </ThemeProvider>,
);
