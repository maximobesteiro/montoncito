import type { ReactNode } from "react";
import { Header } from "./header/Header";
import { Footer } from "./footer/Footer";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col">{children}</main>
      <Footer />
    </div>
  );
}
