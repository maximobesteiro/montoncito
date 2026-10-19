import { useState } from "react";
import { createRoot } from "react-dom/client";
import Home from "./page";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/ThemeProvider";

declare global {
  interface Window {
    homeNavigate: (path: string) => void;
  }
}

function Fixture() {
  const [path, setPath] = useState("/");
  window.homeNavigate = setPath;
  return (
    <ThemeProvider>
      <AppShell>{path === "/" ? <Home /> : <p>Another page</p>}</AppShell>
    </ThemeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
