import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";
import type { Ref } from "react";

export function Header({ identityRef }: { identityRef?: Ref<HTMLDivElement> }) {
  return (
    <header className="sticky top-0 z-40 bg-background border-b-4 border-brutal-border">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
        <Link
          href="/"
          className="shrink-0 text-xl sm:text-2xl font-black uppercase tracking-tighter decoration-4 underline-offset-4 decoration-brutal-primary"
        >
          Montoncito
        </Link>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <div ref={identityRef} className="flex min-w-0 items-center" />
          <div className="shrink-0">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
