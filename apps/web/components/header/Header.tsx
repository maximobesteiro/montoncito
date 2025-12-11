import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-background border-b-4 border-brutal-border">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link
          href="/"
          className="text-2xl font-black uppercase tracking-tighter decoration-4 underline-offset-4 decoration-brutal-primary"
        >
          Montoncito
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
