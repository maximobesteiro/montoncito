"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, getOrCreateClientId } from "@/lib/api";
import { getSocketClient } from "@/lib/socket-client";
import { getRoomSettings, saveRoomSettings } from "@/lib/room-settings-storage";
import { useGameStore } from "@/stores/game-store";
import { useToast } from "@/components/ToastProvider";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import type { GameState } from "@mont/core-game";

type RoomView = {
  id: string;
  slug: string;
  visibility: "public" | "private";
  status: "open" | "in_progress" | "finished";
  maxPlayers: number;
  ownerId: string;
  players: Array<{
    id: string;
    displayName: string;
    isOwner: boolean;
    isReady: boolean;
  }>;
  createdAt: string;
  gameId?: string;
  gameConfig: { discardPiles: number };
};

export default function WaitingRoomPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const sanitizedSlug = useMemo(() => slug.slice(0, 15).toLowerCase(), [slug]);

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
  const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);

  const { showToast } = useToast();
  const isHost = Boolean(room && clientId && room.ownerId === clientId);

  // Check if all non-host players are ready
  const allNonHostReady = useMemo(() => {
    if (!room) return false;
    const nonHostPlayers = room.players.filter((p) => !p.isOwner);
    if (nonHostPlayers.length === 0) return false; // Need at least one non-host
    return nonHostPlayers.every((p) => p.isReady);
  }, [room]);

  // Get current player's ready state
  const myReadyState = useMemo(() => {
    if (!room || !clientId) return false;
    const me = room.players.find((p) => p.id === clientId);
    return me?.isReady ?? false;
  }, [room, clientId]);

  const canStart = Boolean(
    room && isHost && room.players.length >= 2 && allNonHostReady
  );

  const roomTitle = `Room #${(room?.slug ?? sanitizedSlug).slice(-4)}`;

  // Canonicalize overlong slugs: truncate to accepted length.
  useEffect(() => {
    if (slug !== sanitizedSlug) {
      router.replace(`/room/${sanitizedSlug}`);
    }
  }, [router, sanitizedSlug, slug]);

  const refetchRoom = useCallback(async () => {
    if (!clientId) return;
    const view = await apiFetch<RoomView>(`/rooms/by-slug/${sanitizedSlug}`, {
      method: "GET",
      clientId,
    });
    setRoom(view);
    setRoomId(view.id);
    setCurrentPlayerId(clientId);
    return view;
  }, [clientId, sanitizedSlug, setCurrentPlayerId, setRoomId]);

  useEffect(() => {
    let cancelled = false;
    let unsub: null | (() => void) = null;
    const boot = async () => {
      if (!clientId) return;
      setLoading(true);
      setError(null);

      try {
        // 1) Resolve room by slug (for deep-link support)
        let view = await apiFetch<RoomView>(`/rooms/by-slug/${sanitizedSlug}`, {
          method: "GET",
          clientId,
        });

        if (cancelled) return;
        setRoom(view);
        setRoomId(view.id);
        setCurrentPlayerId(clientId);

        // 1b) If we're the host, re-apply locally saved settings (best-effort).
        // This mitigates room recreation/reset after everyone leaves.
        const saved = getRoomSettings(sanitizedSlug);
        if (saved && view.ownerId === clientId && view.status === "open") {
          try {
            view = await apiFetch<RoomView>(`/rooms/${view.id}`, {
              method: "PATCH",
              clientId,
              body: JSON.stringify({
                visibility: saved.visibility,
                maxPlayers: saved.maxPlayers,
                gameConfig: { discardPiles: saved.discardPiles },
              }),
            });
            if (cancelled) return;
            setRoom(view);
          } catch {
            // no-op; keep server defaults if patch fails
          }
        }

        // 2) Ensure membership + get ws token (idempotent join)
        // Note: response includes updated room view (including *you* in players list).
        const joinRes = await apiFetch<RoomView & { wsJoinToken: string }>(
          `/rooms/${view.id}/join`,
          { method: "POST", clientId }
        );
        if (cancelled) return;

        // Update local room immediately so the joining player sees themselves
        const { wsJoinToken, ...joinedRoom } = joinRes;
        setRoom(joinedRoom);

        // 3) Connect to Socket.IO to receive presence + GAME_STARTED
        const sock = getSocketClient();
        sock.connect(wsJoinToken);
        unsub = sock.on((ev) => {
          if (ev.type === "ROOM_UPDATED") {
            // Update room state (including player list) in real-time
            setRoom(ev.room as RoomView);
          }
          if (ev.type === "GAME_STARTED") {
            // Seed store so /game can render immediately (optional)
            setGameState(ev.state as GameState);
            router.push(`/game?room=${view.id}`);
          }
          if (ev.type === "KICKED") {
            showToast("You have been kicked from the room", "warning");
            router.push("/");
          }
          if (ev.type === "STATE_UPDATE") {
            // Keep store up to date if you ever render game state here
            setGameState(ev.state as GameState);
          }
          // Note: PLAYER_JOINED and PLAYER_LEFT are presence indicators (online/offline status)
          // but don't change the room's player list. Use ROOM_UPDATED for actual roster changes.
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
      // Disconnect so server can treat this as leaving (refresh/navigation/tab close).
      getSocketClient().disconnect();
    };
  }, [
    clientId,
    refetchRoom,
    router,
    setCurrentPlayerId,
    setGameState,
    setRoomId,
    sanitizedSlug,
    showToast,
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

      const canPersist =
        updated.status === "open" && updated.ownerId === clientId;
      if (canPersist) {
        saveRoomSettings(sanitizedSlug, {
          visibility: updated.visibility,
          maxPlayers: updated.maxPlayers,
          discardPiles: updated.gameConfig.discardPiles,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const toggleReady = async (ready: boolean) => {
    if (!clientId || !room) return;
    try {
      const updated = await apiFetch<RoomView>(`/rooms/${room.id}/ready`, {
        method: "POST",
        clientId,
        body: JSON.stringify({ ready }),
      });
      setRoom(updated);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to update ready state",
        "error"
      );
    }
  };

  const startGame = async () => {
    if (!clientId || !room) return;

    // Client-side gate: check if all non-host players are ready
    if (!allNonHostReady) {
      showToast(
        "All players must be ready before starting the game",
        "warning"
      );
      return;
    }

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
      // Handle server-side rejection (safety net)
      const message = e instanceof Error ? e.message : "Failed to start";
      showToast(message, "error");
      setError(message);
    } finally {
      setStarting(false);
    }
  };

  const kickPlayer = async (targetId: string) => {
    if (!clientId || !room) return;
    try {
      await apiFetch(`/rooms/${room.id}/kick/${targetId}`, {
        method: "POST",
        clientId,
      });
      showToast("Player kicked successfully", "success");
      await refetchRoom();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to kick player",
        "error"
      );
    } finally {
      setKickingPlayerId(null);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      // no-op
    }
  };

  const leaveRoom = async () => {
    if (!clientId || !room) return;
    try {
      await apiFetch(`/rooms/${room.id}/leave`, {
        method: "POST",
        clientId,
      });
      router.push("/");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to leave room",
        "error"
      );
    } finally {
      setIsLeaveModalOpen(false);
    }
  };

  const handleExitClick = () => {
    if (room && room.players.length > 1) {
      // Other players are waiting - show confirmation
      setIsLeaveModalOpen(true);
    } else {
      // Alone in the room - leave immediately
      void leaveRoom();
    }
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-muted">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="brutal-border p-6 bg-card brutal-shadow relative">
          <button
            onClick={handleExitClick}
            className="absolute top-2 right-2 brutal-border w-8 h-8 flex items-center justify-center bg-card hover:bg-warning-bg transition-colors font-bold text-lg cursor-pointer"
            title="Exit room"
          >
            ×
          </button>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pr-10">
            <div>
              <h1 className="text-4xl font-bold">{roomTitle}</h1>
              <p className="text-text-muted font-semibold">
                Invite code:{" "}
                <span className="font-mono">{room?.slug ?? sanitizedSlug}</span>
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
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Ready checkmark for non-owners */}
                        {!p.isOwner && (
                          <div
                            className={`w-6 h-6 brutal-border flex items-center justify-center text-sm font-bold shrink-0 ${
                              p.isReady
                                ? "bg-btn-success text-text-on-dark"
                                : "bg-card"
                            }`}
                            title={p.isReady ? "Ready" : "Not ready"}
                          >
                            {p.isReady ? "✓" : ""}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold truncate">
                            {p.displayName}
                            {p.id === clientId ? " (you)" : ""}
                          </p>
                          <p className="text-xs text-text-muted font-mono truncate">
                            {p.id}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.isOwner && (
                          <span className="brutal-border px-2 py-1 bg-warning-bg font-bold text-sm">
                            Host
                          </span>
                        )}
                        {!p.isOwner && isHost && (
                          <button
                            onClick={() => setKickingPlayerId(p.id)}
                            className="brutal-border w-8 h-8 flex items-center justify-center bg-card hover:bg-warning-bg transition-colors font-bold text-lg cursor-pointer"
                            title="Kick player"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {kickingPlayerId && (
            <ConfirmationModal
              isOpen={true}
              title="Kick Player"
              message={`Are you sure you want to kick ${
                room?.players.find((p) => p.id === kickingPlayerId)
                  ?.displayName ?? "this player"
              } from the room?`}
              confirmText="Kick"
              onConfirm={() => kickPlayer(kickingPlayerId)}
              onCancel={() => setKickingPlayerId(null)}
            />
          )}

          <ConfirmationModal
            isOpen={isLeaveModalOpen}
            title="Leave Room"
            message="Other players are waiting. Are you sure you want to leave?"
            confirmText="Leave"
            onConfirm={() => void leaveRoom()}
            onCancel={() => setIsLeaveModalOpen(false)}
          />

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
                  {/* Non-host: Ready banner */}
                  {!isHost && (
                    <div className="brutal-border bg-btn-neutral p-4 text-center">
                      <label className="flex items-center justify-center gap-3 cursor-pointer">
                        <span className="text-xl font-bold text-text-on-dark">
                          I&apos;m Ready
                        </span>
                        <input
                          type="checkbox"
                          checked={myReadyState}
                          onChange={(e) => void toggleReady(e.target.checked)}
                          className="w-7 h-7 brutal-border bg-card cursor-pointer accent-btn-success"
                        />
                      </label>
                      <p className="text-sm text-text-on-dark/80 mt-2">
                        All players need to be ready for the host to start the
                        game.
                      </p>
                    </div>
                  )}

                  {/* Host: Start button */}
                  {isHost && (
                    <>
                      <button
                        onClick={startGame}
                        disabled={starting}
                        className={`brutal-button w-full text-text-on-dark ${
                          canStart
                            ? "bg-btn-success hover:bg-btn-success-hover"
                            : "bg-btn-disabled cursor-not-allowed"
                        }`}
                      >
                        {starting ? "Starting…" : "Start game"}
                      </button>
                      {room.players.length < 2 && (
                        <p className="text-xs text-text-muted font-semibold mt-2">
                          Need at least 2 players to start.
                        </p>
                      )}
                      {room.players.length >= 2 && !allNonHostReady && (
                        <p className="text-xs text-text-muted font-semibold mt-2">
                          Waiting for all players to be ready…
                        </p>
                      )}
                    </>
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
