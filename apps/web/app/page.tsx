"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MenuButton } from "../components/MenuButton";
import { Modal } from "../components/Modal";
import { HowToPlayModal } from "../components/HowToPlayModal";
import { apiFetch, getOrCreateClientId } from "@/lib/api";
import {
  initializeGuestProfile,
  saveGuestNickname,
  subscribeGuestProfile,
  withGuestProfileRecovery,
  type GuestProfile,
} from "@/lib/guest-profile";
import { NicknameEditor } from "@/components/NicknameEditor";
import {
  enterCasualGame,
  startFreshCasualEntry,
  CasualDestinationUnavailableError,
} from "@/lib/casual-entry";

export default function Home() {
  const router = useRouter();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [gameId, setGameId] = useState("");
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const casualPending = useRef(false);
  const [casualUnavailable, setCasualUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeGuestProfile(setProfile);
    void initializeGuestProfile()
      .then((value) => {
        if (!cancelled) setProfile(value);
      })
      .catch(() => {
        if (!cancelled)
          setError("Couldn't load your nickname. Try entering a game again.");
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const handleJoinGame = async () => {
    const slug = gameId.trim();
    if (!slug || entering) return;
    setEntering(true);
    setJoinError(null);
    try {
      await initializeGuestProfile();
      setIsJoinModalOpen(false);
      setGameId("");
      router.push(`/room/${slug}`);
    } catch {
      setJoinError("Couldn't load your nickname. Please try again.");
    } finally {
      setEntering(false);
    }
  };

  const handleCreateGame = async () => {
    if (entering) return;
    setEntering(true);
    setError(null);
    try {
      const clientId = getOrCreateClientId();
      const profile = await initializeGuestProfile(clientId);
      const { value: created } = await withGuestProfileRecovery(
        profile,
        (current) =>
          apiFetch<{ slug: string }>(`/rooms`, {
            method: "POST",
            clientId,
            headers: { "x-profile-generation": current.generation },
            body: JSON.stringify({}),
          }),
      );
      router.push(`/room/${created.slug}`);
    } catch {
      setError("Couldn't create a game. Please try again.");
    } finally {
      setEntering(false);
    }
  };

  const handleCasualGame = async () => {
    if (entering || casualPending.current) return;
    casualPending.current = true;
    setEntering(true);
    setFinding(true);
    setError(null);
    try {
      const room = await enterCasualGame();
      router.push(
        room.status === "open" ? `/room/${room.slug}` : `/game/${room.id}`,
      );
    } catch (error) {
      const unavailable = error instanceof CasualDestinationUnavailableError;
      setCasualUnavailable(unavailable);
      setError(
        unavailable
          ? error.message
          : "Couldn't find a game. Retry Casual Game to check the same attempt.",
      );
    } finally {
      casualPending.current = false;
      setEntering(false);
      setFinding(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background p-4 sm:p-8 font-sans">
      <main className="w-full max-w-md flex flex-col gap-4">
        <section
          className="brutal-border bg-card p-4 flex flex-col gap-3"
          aria-label="Guest nickname"
        >
          {profile ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 break-words">
                  Playing as{" "}
                  <span className="font-bold">{profile.displayName}</span>
                </p>
                {!editing && (
                  <button
                    type="button"
                    className="brutal-button px-3 py-2"
                    aria-label="Edit nickname"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                )}
              </div>
              {editing && (
                <NicknameEditor
                  nickname={profile.displayName}
                  baseProfile={profile}
                  suggestions={profile.suggestions}
                  onCancel={() => setEditing(false)}
                  onSave={async (draft, base) => {
                    const saved = await saveGuestNickname(draft, base);
                    setProfile(saved);
                    setEditing(false);
                  }}
                />
              )}
            </>
          ) : (
            <p role="status">Loading nickname...</p>
          )}
          {error && <p role="alert">{error}</p>}
        </section>
        <MenuButton
          title={finding ? "Finding a game..." : "Casual Game"}
          disabled={entering || casualUnavailable}
          subtitle="Join any game awaiting players"
          onClick={() => void handleCasualGame()}
        />
        {casualUnavailable && (
          <button
            type="button"
            className="brutal-button px-3 py-2"
            disabled={entering}
            onClick={() => {
              try {
                startFreshCasualEntry();
                setCasualUnavailable(false);
                void handleCasualGame();
              } catch {
                setError("Couldn't start a fresh attempt. Please try again.");
              }
            }}
          >
            Find another game
          </button>
        )}

        <MenuButton
          title="Join a Game"
          disabled={entering}
          subtitle="Provide a game ID to join a specific game"
          onClick={() => {
            setJoinError(null);
            setIsJoinModalOpen(true);
          }}
        />

        <MenuButton
          title="Create a Game"
          disabled={entering}
          subtitle="Start your own public or private game"
          onClick={() => void handleCreateGame()}
        />

        <MenuButton
          title="How to Play"
          subtitle="Learn the rules and mechanics"
          onClick={() => setIsHowToPlayOpen(true)}
        />
      </main>

      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />

      <Modal
        isOpen={isJoinModalOpen}
        title="Join a Game"
        busy={entering}
        confirmText={entering ? "Joining..." : "Confirm"}
        onCancel={() => {
          setIsJoinModalOpen(false);
          setGameId("");
          setJoinError(null);
        }}
        onConfirm={() => void handleJoinGame()}
      >
        <input
          type="text"
          value={gameId}
          disabled={entering}
          onChange={(e) => setGameId(e.target.value)}
          maxLength={10}
          placeholder="Enter game ID"
          className="w-full brutal-border px-3 py-2 bg-card"
        />
        {joinError && (
          <p role="alert" className="mt-3">
            {joinError}
          </p>
        )}
      </Modal>
    </div>
  );
}
