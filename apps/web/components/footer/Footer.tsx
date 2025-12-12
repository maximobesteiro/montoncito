export function Footer() {
  return (
    <footer className="bg-background border-t-4 border-brutal-border">
      <div className="max-w-7xl mx-auto px-4 py-4 text-center">
        <p className="text-sm text-text-muted">
          © 2026{" "}
          <a
            href="https://maximobesteiro.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground font-medium hover:underline hover:text-brutal-primary transition-colors"
          >
            Maximo Besteiro
          </a>
        </p>
      </div>
    </footer>
  );
}
