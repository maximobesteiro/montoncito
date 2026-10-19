import { createRoot } from "react-dom/client";
import WaitingRoomPage from "./page";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/ToastProvider";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ToastProvider>
      <AppShell>
        <WaitingRoomPage />
      </AppShell>
    </ToastProvider>
  </ThemeProvider>,
);
