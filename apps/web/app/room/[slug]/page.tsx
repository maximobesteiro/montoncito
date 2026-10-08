"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiHttpError, getOrCreateClientId } from "@/lib/api";
import { getSocketClient, type ChatMessage } from "@/lib/socket-client";
import { getRoomSettings, saveRoomSettings } from "@/lib/room-settings-storage";
import { RoomChat } from "@/components/RoomChat";
import { useToast } from "@/components/ToastProvider";
import { ConfirmationModal } from "@/components/ConfirmationModal";
import { appendChatMessage } from "@/lib/room-chat";
import {
  initializeGuestProfile,
  saveGuestNickname,
  rememberGuestProfile,
  subscribeGuestProfile,
  withGuestProfileRecovery,
  type GuestProfile,
} from "@/lib/guest-profile";
import { NicknameEditor } from "@/components/NicknameEditor";
import {
  getCasualEntry,
  forgetCasualEntry,
  completeCasualEntry,
  startFreshCasualEntry,
  CasualDestinationUnavailableError,
  CasualEntryLookupError,
} from "@/lib/casual-entry";

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

type Admission = RoomView & { wsJoinToken: string; profile?: GuestProfile };

export default function WaitingRoomPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const sanitizedSlug = useMemo(() => slug.slice(0, 15).toLowerCase(), [slug]);
  const [casualEntry, setCasualEntry] =
    useState<ReturnType<typeof getCasualEntry>>();
  const [entryLookupFailed, setEntryLookupFailed] = useState(false);
  const [admissionAttempt, setAdmissionAttempt] = useState(0);

  const [clientId, setClientId] = useState<string | null>(null);

  const [room, setRoom] = useState<RoomView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [casualUnavailable, setCasualUnavailable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [kickingPlayerId, setKickingPlayerId] = useState<string | null>(null);
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [editingNickname, setEditingNickname] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [admissionProfile, setAdmissionProfile] = useState<GuestProfile | null>(
    null,
  );
  const [admissionDraft, setAdmissionDraft] = useState("");
  useEffect(() => subscribeGuestProfile(setAdmissionProfile), []);
  const [needsNickname, setNeedsNickname] = useState(false);
  const [admitted, setAdmitted] = useState(false);
  const unresolvedAdmission = useRef<string | null>(null);
  const retryAdmission = useRef<null | ((draft: string) => Promise<void>)>(
    null,
  );
  const nicknameSession = useRef(0);
  const liveRoomRevision = useRef(0);
  const invalidateNicknameEditor = useCallback(() => {
    nicknameSession.current++;
    setEditingNickname(false);
  }, []);

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
    room && isHost && room.players.length >= 2 && allNonHostReady,
  );

  const roomTitle = `Room #${(room?.slug ?? sanitizedSlug).slice(-4)}`;

  // Canonicalize overlong slugs: truncate to accepted length.
  useEffect(() => {
    if (slug !== sanitizedSlug) {
      router.replace(`/room/${sanitizedSlug}`);
    }
  }, [router, sanitizedSlug, slug]);

  const roomId = room?.id;
  const refetchRoom = useCallback(async () => {
    if (!clientId || !roomId) return;
    const revision = liveRoomRevision.current;
    const view = await apiFetch<RoomView>(`/rooms/${roomId}`, {
      method: "GET",
      clientId,
    });
    if (revision === liveRoomRevision.current) setRoom(view);
    return view;
  }, [clientId, roomId]);

  useEffect(() => {
    let cancelled = false;
    let unsub: null | (() => void) = null;
    const boot = async () => {
      let casualEntry: ReturnType<typeof getCasualEntry>;
      setLoading(true);
      setError(null);
      setCasualUnavailable(false);
      setEntryLookupFailed(false);
      setAdmitted(false);
      setNeedsNickname(false);
      setRoom(null);

      try {
        casualEntry = getCasualEntry(sanitizedSlug);
        const clientId = getOrCreateClientId();
        setClientId(clientId);
        setCasualEntry(casualEntry);
        let profile = await initializeGuestProfile(clientId);
        if (cancelled) return;
        setSuggestions(profile.suggestions);
        setAdmissionProfile(profile);
        // 1) Resolve room by slug (for deep-link support)
        const resolved = await withGuestProfileRecovery(profile, (current) =>
          apiFetch<RoomView>(
            casualEntry
              ? `/rooms/${casualEntry.id}`
              : `/rooms/by-slug/${sanitizedSlug}`,
            {
              method: "GET",
              clientId,
              headers: { "x-profile-generation": current.generation },
            },
          ),
        );
        profile = resolved.profile;
        let view = resolved.value;

        if (cancelled) return;
        setRoom(view);

        // 1b) If we're the host, re-apply locally saved settings (best-effort).
        // This mitigates room recreation/reset after everyone leaves.
        const saved = getRoomSettings(sanitizedSlug);
        if (
          !casualEntry &&
          saved &&
          view.ownerId === clientId &&
          view.status === "open"
        ) {
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
        const connectMembership = (joinRes: Admission) => {
          if (cancelled) return;
          if (casualEntry) completeCasualEntry();

          // Update local room immediately so the joining player sees themselves
          const {
            wsJoinToken,
            profile: confirmedProfile,
            ...joinedRoom
          } = joinRes;
          if (confirmedProfile) {
            setAdmissionProfile(confirmedProfile);
            joinedRoom.players = joinedRoom.players.map((player) =>
              player.id === clientId
                ? { ...player, displayName: confirmedProfile.displayName }
                : player,
            );
          }
          setNeedsNickname(false);
          setAdmitted(true);
          setError(null);
          setRoom(joinedRoom);

          // 3) Connect to Socket.IO to receive presence + GAME_STARTED
          const sock = getSocketClient();
          unsub = sock.on((ev) => {
            if (ev.type === "ROOM_UPDATED") {
              liveRoomRevision.current++;
              const updated = ev.room as RoomView;
              if (
                updated.status !== "open" ||
                !updated.players.some((player) => player.id === clientId)
              )
                invalidateNicknameEditor();
              // Update room state (including player list) in real-time
              setRoom(ev.room as RoomView);
            }
            if (ev.type === "GAME_STARTED") {
              liveRoomRevision.current++;
              invalidateNicknameEditor();
              router.push(`/game/${ev.roomId}`);
            }
            if (ev.type === "KICKED") {
              if (casualEntry) forgetCasualEntry(casualEntry.id);
              liveRoomRevision.current++;
              invalidateNicknameEditor();
              sock.disconnect();
              showToast("You have been kicked from the room", "warning");
              router.push("/");
            }
            if (ev.type === "CHAT_MESSAGE") {
              setChatMessages((prev) => appendChatMessage(prev, ev));
            }
            if (ev.type === "CHAT_HISTORY") {
              setChatMessages(ev.messages);
            }
            // Note: PLAYER_JOINED and PLAYER_LEFT are presence indicators (online/offline status)
            // but don't change the room's player list. Use ROOM_UPDATED for actual roster changes.
          });
          const synchronizeRoom = async () => {
            const revision = liveRoomRevision.current;
            try {
              const current = await apiFetch<RoomView>(`/rooms/${view.id}`, {
                method: "GET",
                clientId,
              });
              if (cancelled || revision !== liveRoomRevision.current) return;
              if (!current.players.some((player) => player.id === clientId))
                throw new ApiHttpError(
                  403,
                  "Your Lobby membership was removed.",
                );
              setRoom(current);
            } catch (error) {
              if (cancelled || revision !== liveRoomRevision.current) return;
              sock.disconnect();
              setAdmitted(false);
              invalidateNicknameEditor();
              const unavailable = Boolean(
                casualEntry &&
                  error instanceof ApiHttpError &&
                  (error.status === 403 || error.status === 404),
              );
              setCasualUnavailable(unavailable);
              setError(
                unavailable
                  ? new CasualDestinationUnavailableError().message
                  : "Couldn't synchronize this Lobby. Retry entry to check your membership and current game.",
              );
            }
          };
          sock.connect(
            wsJoinToken,
            async () => {
              try {
                const { wsJoinToken: renewed } = await apiFetch<{
                  wsJoinToken: string;
                }>(`/rooms/${view.id}/socket-token`, {
                  method: "POST",
                  clientId,
                });
                return renewed;
              } catch (error) {
                if (
                  error instanceof ApiHttpError &&
                  (error.status === 403 || error.status === 404)
                ) {
                  sock.disconnect();
                  if (!cancelled) router.push("/");
                }
                throw error;
              }
            },
            () => {
              // Subscribe first, then read after each actual connection. A start
              // between boot's snapshot and subscription must not be missed.
              void synchronizeRoom();
            },
          );
        };
        const reconcileAdmission = async () => {
          try {
            const confirmed = await initializeGuestProfile(clientId);
            if (cancelled) return null;
            setAdmissionProfile(confirmed);
            profile = confirmed;
            const current = await apiFetch<RoomView>(`/rooms/${view.id}`, {
              clientId,
            });
            if (cancelled) return null;
            if (current.players.some((player) => player.id === clientId)) {
              const token = await apiFetch<{ wsJoinToken: string }>(
                `/rooms/${view.id}/socket-token`,
                { method: "POST", clientId },
              );
              if (cancelled) return null;
              connectMembership({ ...current, ...token, profile: confirmed });
              unresolvedAdmission.current = null;
              return null;
            }
            unresolvedAdmission.current = null;
            return confirmed;
          } catch (failure) {
            if (cancelled) return null;
            if (failure instanceof ApiHttpError && failure.status === 404) {
              unresolvedAdmission.current = null;
              throw new Error(
                "This Lobby no longer exists. You have not joined. Return home to choose another Lobby.",
              );
            }
            throw new Error(
              "Couldn't confirm whether you joined. The request may have completed. Retry to check membership before confirming another replacement.",
            );
          }
        };
        const admit = async (draft?: string) => {
          if (
            casualEntry ||
            (view.status !== "open" &&
              view.players.some((player) => player.id === clientId))
          ) {
            // Recover confirmed Casual admission or a seated match member.
            // The token endpoint verifies membership even if the read is stale.
            const token = await apiFetch<{ wsJoinToken: string }>(
              `/rooms/${view.id}/socket-token`,
              { method: "POST", clientId },
            );
            connectMembership({ ...view, ...token, profile });
            return;
          }
          if (
            unresolvedAdmission.current === view.id &&
            !(await reconcileAdmission())
          )
            return;
          try {
            const joined = await apiFetch<Admission>(`/rooms/${view.id}/join`, {
              method: "POST",
              clientId,
              headers: { "x-profile-generation": profile.generation },
              body: JSON.stringify(
                draft === undefined
                  ? {}
                  : {
                      displayName: draft,
                      base: {
                        generation: profile.generation,
                        revision: profile.revision,
                      },
                    },
              ),
            });
            if (joined.profile)
              joined.profile = await rememberGuestProfile(joined.profile);
            if (cancelled) return;
            unresolvedAdmission.current = null;
            connectMembership(joined);
          } catch (failure) {
            if (cancelled) return;
            if (
              failure instanceof ApiHttpError &&
              failure.code === "STALE_PROFILE_GENERATION"
            ) {
              profile = await initializeGuestProfile(clientId);
              setAdmissionProfile(profile);
              throw new Error(
                "The server restarted. Your nickname was restored. Retry entry to choose a current Lobby.",
              );
            }
            if (
              failure instanceof ApiHttpError &&
              failure.code === "STALE_PROFILE"
            ) {
              profile = await initializeGuestProfile(clientId);
              setAdmissionProfile(profile);
              throw new Error(
                "Your nickname changed. Review the confirmed name and retry your draft.",
              );
            }
            if (
              failure instanceof ApiHttpError &&
              failure.code === "NICKNAME_CONFLICT"
            ) {
              throw failure;
            }
            if (!(failure instanceof ApiHttpError)) {
              // The response may have been lost after commit. Resolve through
              // public reads before describing the result or repeating admission.
              unresolvedAdmission.current = view.id;
              const confirmed = await reconcileAdmission();
              if (!confirmed) return;
              throw new Error(
                `Your confirmed nickname is ${confirmed.displayName}. You are not currently a member of this Lobby. Retry to request admission.`,
              );
            }
            throw new Error(
              `You have not joined. Your nickname replacement was not confirmed. ${failure instanceof Error ? failure.message : "Please try again."}`,
            );
          }
        };
        retryAdmission.current = async (draft) => {
          try {
            await admit(draft);
          } catch (failure) {
            if (
              failure instanceof ApiHttpError &&
              failure.code === "NICKNAME_CONFLICT"
            ) {
              throw new Error(
                "That nickname is already used in this Lobby or another Lobby you have joined. Choose another nickname and retry.",
              );
            }
            throw failure;
          }
        };
        try {
          await admit();
        } catch (failure) {
          if (
            !(failure instanceof ApiHttpError) ||
            failure.code !== "NICKNAME_CONFLICT"
          )
            throw failure;
          if (cancelled) return;
          setAdmissionDraft(profile.displayName);
          try {
            const available = await apiFetch<{ suggestions: string[] }>(
              `/rooms/${view.id}/nickname-suggestions`,
              { clientId },
            );
            if (cancelled) return;
            setSuggestions(available.suggestions);
            setAdmissionDraft(available.suggestions[0] ?? profile.displayName);
          } catch (suggestionFailure) {
            if (
              suggestionFailure instanceof ApiHttpError &&
              (suggestionFailure.status === 409 ||
                suggestionFailure.status === 404)
            )
              throw suggestionFailure;
            // Custom editing remains available when suggestions cannot be loaded.
            if (!cancelled) setSuggestions([]);
          }
          if (!cancelled) setNeedsNickname(true);
        }
      } catch (e) {
        if (cancelled) return;
        setEntryLookupFailed(e instanceof CasualEntryLookupError);
        const unavailable = Boolean(
          casualEntry &&
            e instanceof ApiHttpError &&
            (e.status === 403 || e.status === 404),
        );
        setCasualUnavailable(unavailable);
        setError(
          unavailable
            ? new CasualDestinationUnavailableError().message
            : e instanceof Error
              ? e.message
              : "Failed to load room",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();
    return () => {
      cancelled = true;
      retryAdmission.current = null;
      liveRoomRevision.current++;
      nicknameSession.current++;
      unsub?.();
      // Disconnect so server can treat this as leaving (refresh/navigation/tab close).
      getSocketClient().disconnect();
    };
  }, [
    router,
    sanitizedSlug,
    showToast,
    invalidateNicknameEditor,
    admissionAttempt,
  ]);

  useEffect(() => {
    if (!room || !admitted) return;
    if (
      room.status !== "open" &&
      room.gameId &&
      room.players.some((player) => player.id === clientId)
    ) {
      invalidateNicknameEditor();
      router.push(`/game/${room.id}`);
    }
  }, [room, router, invalidateNicknameEditor, clientId, admitted]);

  const patchRoom = async (
    patch: Partial<Pick<RoomView, "visibility" | "maxPlayers">> & {
      gameConfig?: Partial<RoomView["gameConfig"]>;
    },
  ) => {
    if (!clientId || !room) return;
    setSaving(true);
    setError(null);
    try {
      const revision = liveRoomRevision.current;
      const updated = await apiFetch<RoomView>(`/rooms/${room.id}`, {
        method: "PATCH",
        clientId,
        body: JSON.stringify(patch),
      });
      if (revision === liveRoomRevision.current) setRoom(updated);

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
      const revision = liveRoomRevision.current;
      const updated = await apiFetch<RoomView>(`/rooms/${room.id}/ready`, {
        method: "POST",
        clientId,
        body: JSON.stringify({ ready }),
      });
      if (revision === liveRoomRevision.current) setRoom(updated);
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to update ready state",
        "error",
      );
    }
  };

  const startGame = async () => {
    if (!clientId || !room) return;

    // Client-side gate: check if all non-host players are ready
    if (!allNonHostReady) {
      showToast(
        "All players must be ready before starting the game",
        "warning",
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
        "error",
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
    invalidateNicknameEditor();
    try {
      await apiFetch(`/rooms/${room.id}/leave`, {
        method: "POST",
        clientId,
      });
      if (casualEntry) forgetCasualEntry(casualEntry.id);
      router.push("/");
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : "Failed to leave room",
        "error",
      );
    } finally {
      setIsLeaveModalOpen(false);
    }
  };

  const handleExitClick = () => {
    if (!admitted) {
      router.push("/");
      return;
    }
    if (room && room.players.length > 1) {
      // Other players are waiting - show confirmation
      setIsLeaveModalOpen(true);
    } else {
      // Alone in the room - leave immediately
      void leaveRoom();
    }
  };

  const sendChatMessage = useCallback((text: string) => {
    const sock = getSocketClient();
    sock.sendChat(text);
  }, []);

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-muted">
      <div className="max-w-6xl mx-auto space-y-4">
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
              {!admitted && !needsNickname && (
                <button
                  className="brutal-button mt-2 bg-card"
                  disabled={loading}
                  onClick={() => {
                    if (casualUnavailable) {
                      startFreshCasualEntry();
                      router.push("/");
                    } else setAdmissionAttempt((attempt) => attempt + 1);
                  }}
                >
                  {casualUnavailable
                    ? "Find another game"
                    : casualEntry || entryLookupFailed
                      ? "Retry entry"
                      : "Retry admission"}
                </button>
              )}
            </div>
          )}
        </div>

        {needsNickname && admissionProfile && room && (
          <section
            className="brutal-border p-6 bg-card brutal-shadow space-y-3"
            aria-label="Choose a nickname before joining"
          >
            <h2 className="text-2xl font-bold">Choose a nickname to join</h2>
            <p>
              Your confirmed nickname, {admissionProfile.displayName}, is
              already used in this Lobby. You have not joined. Save explicitly
              confirms your shared nickname and joins the Lobby.
            </p>
            {suggestions.length === 0 && (
              <p>
                No generated nicknames are available. Enter your own nickname or
                retry Shuffle.
              </p>
            )}
            <NicknameEditor
              nickname={admissionDraft}
              suggestions={suggestions}
              loadSuggestions={async () =>
                (
                  await apiFetch<{ suggestions: string[] }>(
                    `/rooms/${room.id}/nickname-suggestions`,
                    { clientId: clientId ?? undefined },
                  )
                ).suggestions
              }
              onCancel={() => router.push("/")}
              onSave={async (draft) => {
                await retryAdmission.current?.(draft);
              }}
            />
          </section>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-10 gap-4">
          <div className="xl:col-span-3 brutal-border p-6 bg-card brutal-shadow">
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
                      className="brutal-border p-3 bg-muted flex flex-wrap items-center justify-between gap-3"
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
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.id === clientId &&
                          room.status === "open" &&
                          !editingNickname && (
                            <button
                              aria-label="Edit nickname"
                              className="brutal-button px-3 py-2 bg-card"
                              onClick={() => {
                                nicknameSession.current++;
                                setEditingNickname(true);
                              }}
                            >
                              Edit
                            </button>
                          )}
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
                      {p.id === clientId &&
                        room.status === "open" &&
                        editingNickname && (
                          <div className="w-full min-w-0">
                            <NicknameEditor
                              nickname={p.displayName}
                              baseProfile={admissionProfile ?? undefined}
                              suggestions={suggestions}
                              loadSuggestions={async () => {
                                const profile =
                                  await initializeGuestProfile(clientId);
                                return profile.suggestions;
                              }}
                              onCancel={invalidateNicknameEditor}
                              onSave={async (draft, base) => {
                                const session = nicknameSession.current;
                                const isCurrent = () =>
                                  nicknameSession.current === session;
                                try {
                                  await saveGuestNickname(draft, base);
                                  if (isCurrent()) invalidateNicknameEditor();
                                } catch (error) {
                                  if (isCurrent()) throw error;
                                }
                              }}
                            />
                          </div>
                        )}
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

          <div className="xl:col-span-4 brutal-border p-6 bg-card brutal-shadow space-y-4">
            <h2 className="text-2xl font-bold">Game settings</h2>

            {!room && !loading && (
              <p className="text-text-muted font-semibold">
                Room not found (or not accessible).
              </p>
            )}

            {room && admitted && (
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
                    max={4}
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
                    max={4}
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

          {admitted && (
            <RoomChat
              messages={chatMessages}
              currentPlayerId={clientId}
              onSendMessage={sendChatMessage}
              className="lg:col-span-2 xl:col-span-3"
            />
          )}
        </div>
      </div>
    </div>
  );
}
