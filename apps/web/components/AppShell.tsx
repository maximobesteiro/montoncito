"use client";

import { useState, type ReactNode } from "react";
import { HeaderIdentityTarget } from "./header/HeaderIdentity";
import { Header } from "./header/Header";
import { Footer } from "./footer/Footer";

export function AppShell({ children }: { children: ReactNode }) {
  const [identityTarget, setIdentityTarget] = useState<HTMLDivElement | null>(
    null,
  );
  return (
    <HeaderIdentityTarget.Provider value={identityTarget}>
      <div className="app-shell min-h-screen flex flex-col">
        <Header identityRef={setIdentityTarget} />
        <main className="flex-1 flex flex-col">{children}</main>
        <Footer />
      </div>
    </HeaderIdentityTarget.Provider>
  );
}
