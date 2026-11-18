"use client";

// THROWAWAY: Does removing administrative chrome make the existing board usable?
// Compare current/base on the existing route, without live sessions or mutations.
import { useCallback, useEffect, useMemo, useState } from "react";
import { GameBoard } from "@/components/game/GameBoard";
import {
  HeaderIdentity,
  HeaderNickname,
} from "@/components/header/HeaderIdentity";
import {
  layoutScenarios,
  layoutScenarioState,
  parseLayoutScenario,
  type LayoutScenario,
} from "./scenarios.prototype";
import "./layout.prototype.css";
import { CompactBoardPrototype } from "./compact-board.prototype";

// Current remains accessible by its original URL; keep the live carousel to five.
const variants = [
  "base",
  "integrated",
  "compact",
  "compact-centered",
  "compact-right",
] as const;
type PrototypeVariant = (typeof variants)[number] | "current";
const variantNames: Record<PrototypeVariant, string> = {
  current: "A · Actual",
  base: "B · Base conservadora",
  integrated: "C · Integrada",
  compact: "D · Compacta",
  "compact-centered": "E · Mano centrada",
  "compact-right": "F · Mano a derecha",
};

export function GameLayoutPrototype() {
  const [variant, setVariant] = useState<PrototypeVariant>(() => {
    const value = new URLSearchParams(window.location.search).get("variant");
    return value === "current"
      ? "current"
      : (variants.find((v) => v === value) ?? "compact-centered");
  });
  const base = variant !== "current";
  const exploration = variant !== "current" && variant !== "base";
  const [scenario, setScenario] = useState<LayoutScenario>(() =>
    parseLayoutScenario(
      new URLSearchParams(window.location.search).get("scenario"),
    ),
  );
  const [offline, setOffline] = useState(false);
  const [myTurn, setMyTurn] = useState(true);
  const [rivalTurn, setRivalTurn] = useState("player-2");
  const [chatOpen, setChatOpen] = useState(false);
  const state = useMemo(() => {
    const fixture = layoutScenarioState(scenario, myTurn);
    if (!myTurn && fixture.players.includes(rivalTurn)) {
      fixture.turn.activePlayer = rivalTurn;
    }
    return fixture;
  }, [scenario, myTurn, rivalTurn]);
  const scenarioConfig = layoutScenarios[scenario];
  function changeScenario(value: string) {
    const parsed = parseLayoutScenario(value);
    setScenario(parsed);
    const search = new URLSearchParams(window.location.search);
    search.set("scenario", parsed);
    window.history.replaceState(null, "", `?${search}`);
  }

  const switchVariant = useCallback(
    (direction = 1) => {
      const next = new URLSearchParams(window.location.search);
      const value =
        variants[
          ((variant === "current" ? -1 : variants.indexOf(variant)) +
            direction +
            variants.length) %
            variants.length
        ]!;
      next.set("variant", value);
      window.history.replaceState(null, "", `?${next}`);
      setVariant(value);
    },
    [variant],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          "input, textarea, select, [contenteditable], [role=dialog]",
        )
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        switchVariant(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchVariant]);

  const conversation = (
    <section
      className="layout-prototype-chat brutal-border brutal-shadow bg-card p-4"
      aria-label="Chat simulado"
    >
      <h3 className="text-lg font-bold">Chat</h3>
      <div className="layout-prototype-messages mt-3 flex flex-col gap-3 text-sm">
        <p>
          <strong>Bob</strong>
          <br />
          ¡Buena partida!
        </p>
        <p>
          <strong>Vos</strong>
          <br />A ver si puedo sacar ese stock…
        </p>
      </div>
      <p className="border-t pt-3 text-sm text-text-muted">
        Vista de lectura · sin envío
      </p>
    </section>
  );

  return (
    <div
      className={
        variant === "compact-centered" ? "prototype-centered-trial" : ""
      }
    >
      <HeaderIdentity>
        <HeaderNickname nickname="Vos" />
      </HeaderIdentity>
      <main
        className={`layout-prototype game-room-page min-h-screen space-y-4 bg-muted p-4 sm:p-6 ${base ? "layout-prototype-base" : ""} ${exploration ? "layout-prototype-exploration" : ""}`}
      >
        {!base && (
          <header className="brutal-border brutal-shadow mx-auto flex max-w-6xl items-center justify-between bg-card p-4">
            <div>
              <h1 className="text-2xl font-bold">Game room</h1>
              <p className="font-mono text-sm">partida-de-demostracion</p>
              {offline && (
                <p role="status" className="text-sm font-semibold">
                  Reconnecting to the Game room… Board is stale and read-only.
                </p>
              )}
            </div>
            <p className="font-mono text-sm">Sequence 42</p>
          </header>
        )}
        <div className="mx-auto max-w-6xl">
          {base && !exploration && (
            <header className="layout-prototype-status flex flex-wrap items-center justify-between gap-2 px-2 py-1 sm:px-4">
              <h1 className="text-base font-bold">
                <span className="border-2 border-current bg-active-bg px-2 py-1">
                  {myTurn ? "Tu turno" : "Turno de Bob"}
                </span>
              </h1>
              <span className="text-xs text-text-muted">Turno 17</span>
              {offline && (
                <p
                  role="status"
                  className="w-full border-2 border-current bg-warning-bg px-2 py-1 text-sm font-semibold"
                >
                  Reconectando · jugadas pausadas
                </p>
              )}
            </header>
          )}
          {exploration ? (
            <CompactBoardPrototype
              key={scenario}
              state={state}
              compact={variant !== "integrated"}
              alignment={
                variant === "compact-centered"
                  ? "center"
                  : variant === "compact-right"
                    ? "right"
                    : "original"
              }
              offline={offline}
              chat={conversation}
            />
          ) : (
            <div className="layout-prototype-board">
              <GameBoard
                gameState={state}
                currentPlayerId="player-1"
                chat={conversation}
              />
            </div>
          )}
        </div>
        <button
          className="layout-prototype-mobile-chat brutal-button bg-card"
          onClick={() => setChatOpen(true)}
        >
          Chat
        </button>
      </main>
      {chatOpen && (
        <dialog
          open
          className="layout-prototype-chat-dialog brutal-border bg-card p-4"
          aria-label="Chat simulado"
        >
          <button className="mb-4 underline" onClick={() => setChatOpen(false)}>
            Cerrar chat
          </button>
          {conversation}
        </dialog>
      )}
      <nav
        className="layout-prototype-switcher"
        aria-label="Controles del prototipo"
      >
        <div className="flex items-center justify-center gap-3">
          <button
            aria-label="Variante anterior"
            onClick={() => switchVariant(-1)}
          >
            ←
          </button>
          <strong aria-live="polite">{variantNames[variant]}</strong>
          <button
            aria-label="Variante siguiente"
            onClick={() => switchVariant(1)}
          >
            →
          </button>
        </div>
        <details>
          <summary>PROTOTIPO · solo lectura · escenarios</summary>
          <div className="prototype-scenario-label">
            <label htmlFor="prototype-scenario">Escenario</label>
            <select
              id="prototype-scenario"
              value={scenario}
              onChange={(e) => changeScenario(e.target.value)}
            >
              {Object.entries(layoutScenarios).map(([key, config]) => (
                <option value={key} key={key}>
                  {config.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <label>
              <input
                type="checkbox"
                checked={offline}
                onChange={(e) => setOffline(e.target.checked)}
              />{" "}
              Sin conexión
            </label>
            <label className="prototype-scenario-label">
              Turno de
              <select
                aria-label="Jugador activo"
                value={state.turn.activePlayer}
                onChange={(e) => {
                  setMyTurn(e.target.value === "player-1");
                  if (e.target.value !== "player-1")
                    setRivalTurn(e.target.value);
                }}
              >
                {state.players.map((id) => (
                  <option key={id} value={id}>
                    {state.byId[id]!.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2">
            {scenarioConfig.players} jugadores · {scenarioConfig.builds} builds
            · {scenarioConfig.hand} cartas en mano · {scenarioConfig.discards}{" "}
            descartes · {offline ? "offline" : "conectado"} ·{" "}
            {myTurn ? "turno propio" : "turno rival"}
          </p>
          <p>
            {exploration
              ? `${variant !== "integrated" ? "Cartas propias 56 × 80; rivales 48 × 64" : "Cartas propias 72 × 104; rivales 56 × 80"} · ${variant === "compact-centered" ? "builds centradas; stock a izquierda; mano centrada en el espacio restante" : variant === "compact-right" ? "builds centradas; stock a izquierda; mano a derecha" : "alineación original"} · turno integrado · mano solapada en móvil · tocá una carta para inspeccionarla, sin jugadas.`
              : "Referencia anterior sin cambios."}{" "}
            Menú / info pendiente de comparar.
          </p>
        </details>
      </nav>
    </div>
  );
}
