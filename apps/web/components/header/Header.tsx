import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-background border-b-4 border-brutal-border">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-end">
        <ThemeToggle />
      </div>
    </header>
  );
}
