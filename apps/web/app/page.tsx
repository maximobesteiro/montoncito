"use client";

import { useState } from "react";
import { MenuButton } from "../components/MenuButton";
import { Modal } from "../components/Modal";

export default function Home() {
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [gameId, setGameId] = useState("");

  const handleJoinGame = () => {
    // TODO: Implement join game logic
    console.log("Joining game:", gameId);
    setIsJoinModalOpen(false);
    setGameId("");
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
          onClick={() => {}}
        />

        <MenuButton
          title="How to Play"
          subtitle="Learn the rules and mechanics"
          onClick={() => {}}
        />
      </main>

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
