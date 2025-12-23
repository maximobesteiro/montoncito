"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MenuButton } from "../components/MenuButton";
import { Modal } from "../components/Modal";
import { HowToPlayModal } from "../components/HowToPlayModal";
import { apiFetch, getOrCreateClientId } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [gameId, setGameId] = useState("");

  const handleJoinGame = () => {
    const slug = gameId.trim();
    if (!slug) return;
    setIsJoinModalOpen(false);
    setGameId("");
    router.push(`/room/${slug}`);
  };

  const handleCreateGame = async () => {
    const clientId = getOrCreateClientId();
    const created = await apiFetch<{ slug: string }>(`/rooms`, {
      method: "POST",
      clientId,
      body: JSON.stringify({}),
    });
    router.push(`/room/${created.slug}`);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background p-4 sm:p-8 font-sans">
      <main className="w-full max-w-md flex flex-col gap-4">
        <MenuButton
          title="Casual Game"
          subtitle="Join any game awaiting players"
          onClick={() => {}}
        />

        <MenuButton
          title="Join a Game"
          subtitle="Provide a game ID to join a specific game"
          onClick={() => setIsJoinModalOpen(true)}
        />

        <MenuButton
          title="Create a Game"
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
        onCancel={() => {
          setIsJoinModalOpen(false);
          setGameId("");
        }}
        onConfirm={handleJoinGame}
      >
        <input
          type="text"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          maxLength={10}
          placeholder="Enter game ID"
          className="w-full brutal-border px-3 py-2 bg-card"
        />
      </Modal>
    </div>
  );
}
