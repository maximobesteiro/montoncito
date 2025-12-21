"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, getOrCreateClientId } from "@/lib/api";
import { getSocketClient } from "@/lib/socket-client";
import { useGameStore } from "@/stores/game-store";
import type { GameState } from "@mont/core-game";

type RoomView = {
  id: string;
  slug: string;
  visibility: "public" | "private";
  status: "open" | "in_progress" | "finished";
  maxPlayers: number;
  ownerId: string;
  players: Array<{ id: string; displayName: string; isOwner: boolean }>;
  createdAt: string;
  gameId?: string;
  gameConfig: { discardPiles: number };
};

export default function WaitingRoomPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { setRoomId, setCurrentPlayerId, setGameState } = useGameStore();

  const clientId = useMemo(() => {
    try {
      return getOrCreateClientId();
    } catch {
      return null;
    }
  }, []);

  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);

  const isHost = Boolean(room && clientId && room.ownerId === clientId);
  const canStart = Boolean(room && isHost && room.players.length >= 2);

  const roomTitle = `Room #${slug.slice(-4)}`;

  const refetchRoom = useCallback(async () => {
    if (!clientId) return;
    const view = await apiFetch<RoomView>(`/rooms/by-slug/${slug}`, {
      method: "GET",
      clientId,
    });
    setRoom(view);
    setRoomId(view.id);
    setCurrentPlayerId(clientId);
    return view;
  }, [clientId, setCurrentPlayerId, setRoomId, slug]);

  useEffect(() => {
    let cancelled = false;
    let unsub: null | (() => void) = null;
    const boot = async () => {
      if (!clientId) return;
      setLoading(true);
      setError(null);

      try {
        // 1) Resolve room by slug (for deep-link support)
        const view = await apiFetch<RoomView>(`/rooms/by-slug/${slug}`, {
          method: "GET",
          clientId,
        });

        if (cancelled) return;
        setRoom(view);
        setRoomId(view.id);
        setCurrentPlayerId(clientId);

        // 2) Ensure membership + get ws token (idempotent join)
        const joinRes = await apiFetch<{ wsJoinToken: string }>(
          `/rooms/${view.id}/join`,
          { method: "POST", clientId }
        );
        if (cancelled) return;

        // 3) Connect to Socket.IO to receive presence + GAME_STARTED
        const sock = getSocketClient();
        sock.connect(joinRes.wsJoinToken);
        unsub = sock.on((ev) => {
          if (ev.type === "PLAYER_JOINED" || ev.type === "PLAYER_LEFT") {
            void refetchRoom().catch(() => {});
          }
          if (ev.type === "ROOM_UPDATED") {
            // Update room settings in real-time
            setRoom(ev.room as RoomView);
          }
          if (ev.type === "GAME_STARTED") {
            // Seed store so /game can render immediately (optional)
            setGameState(ev.state as GameState);
            router.push(`/game?room=${view.id}`);
          }
          if (ev.type === "STATE_UPDATE") {
            // Keep store up to date if you ever render game state here
            setGameState(ev.state as GameState);
          }
        });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load room");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
      unsub?.();
      // Do not disconnect globally; keep connection reusable.
    };
  }, [
    clientId,
    refetchRoom,
    router,
    setCurrentPlayerId,
    setGameState,
    setRoomId,
    slug,
  ]);

  useEffect(() => {
    if (!room) return;
    if (room.status === "in_progress") {
      router.push(`/game?room=${room.id}`);
    }
  }, [room, router]);

  const patchRoom = async (
    patch: Partial<Pick<RoomView, "visibility" | "maxPlayers">> & {
      gameConfig?: Partial<RoomView["gameConfig"]>;
    }
  ) => {
    if (!clientId || !room) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiFetch<RoomView>(`/rooms/${room.id}`, {
        method: "PATCH",
        clientId,
        body: JSON.stringify(patch),
      });
      setRoom(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const startGame = async () => {
    if (!clientId || !room) return;
    setStarting(true);
    setError(null);
    try {
      await apiFetch<RoomView>(`/rooms/${room.id}/start`, {
        method: "POST",
        clientId,
      });
      // GAME_STARTED should arrive via socket; fallback via refetch:
      await refetchRoom();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
    } finally {
      setStarting(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // no-op
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-muted">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="brutal-border p-6 bg-card brutal-shadow">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-4xl font-bold">{roomTitle}</h1>
              <p className="text-text-muted font-semibold">
                Invite code: <span className="font-mono">{slug}</span>
              </p>
            </div>
            <button
              onClick={copyInvite}
              className="brutal-button bg-btn-neutral text-text-on-dark hover:bg-btn-neutral-hover"
            >
              Copy invite link
            </button>
          </div>

          {error && (
            <div className="mt-4 brutal-border bg-warning-bg p-3">
              <p className="font-bold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 brutal-border p-6 bg-card brutal-shadow">
            <h2 className="text-2xl font-bold mb-3">Players</h2>

            {loading && (
              <p className="text-text-muted font-semibold">Loading room…</p>
            )}

            {!loading && room && (
              <>
                <p className="text-text-muted font-semibold mb-3">
                  {room.players.length}/{room.maxPlayers} players
                </p>
                <div className="space-y-2">
                  {room.players.map((p) => (
                    <div
                      key={p.id}
                      className="brutal-border p-3 bg-muted flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-bold truncate">
                          {p.displayName}
                          {p.id === clientId ? " (you)" : ""}
                        </p>
                        <p className="text-xs text-text-muted font-mono truncate">
                          {p.id}
                        </p>
                      </div>
                      {p.isOwner && (
                        <span className="brutal-border px-2 py-1 bg-warning-bg font-bold text-sm">
                          Host
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="brutal-border p-6 bg-card brutal-shadow space-y-4">
            <h2 className="text-2xl font-bold">Game settings</h2>

            {!room && !loading && (
              <p className="text-text-muted font-semibold">
                Room not found (or not accessible).
              </p>
            )}

            {room && (
              <>
                <div className="space-y-2">
                  <label className="block font-bold">Visibility</label>
                  <select
                    value={room.visibility}
                    disabled={!isHost || saving || room.status !== "open"}
                    onChange={(e) =>
                      void patchRoom({
                        visibility: e.target.value as RoomView["visibility"],
                      })
                    }
                    className="w-full brutal-border px-3 py-2 bg-card"
                  >
                    <option value="public">public</option>
                    <option value="private">private</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block font-bold">Max players</label>
                  <input
                    type="number"
                    min={2}
                    max={16}
                    value={room.maxPlayers}
                    disabled={!isHost || saving || room.status !== "open"}
                    onChange={(e) =>
                      void patchRoom({ maxPlayers: Number(e.target.value) })
                    }
                    className="w-full brutal-border px-3 py-2 bg-card"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block font-bold">Discard piles</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={room.gameConfig.discardPiles}
                    disabled={!isHost || saving || room.status !== "open"}
                    onChange={(e) =>
                      void patchRoom({
                        gameConfig: { discardPiles: Number(e.target.value) },
                      })
                    }
                    className="w-full brutal-border px-3 py-2 bg-card"
                  />
                </div>

                <div className="pt-2">
                  <button
                    onClick={startGame}
                    disabled={!canStart || starting}
                    className="brutal-button w-full bg-btn-success text-text-on-dark hover:bg-btn-success-hover disabled:bg-btn-disabled disabled:cursor-not-allowed"
                  >
                    {starting ? "Starting…" : "Start game"}
                  </button>
                  {!isHost && (
                    <p className="text-xs text-text-muted font-semibold mt-2">
                      Only the host can start the game.
                    </p>
                  )}
                  {isHost && room.players.length < 2 && (
                    <p className="text-xs text-text-muted font-semibold mt-2">
                      Need at least 2 players to start.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
