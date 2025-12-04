"use client";

import { useState } from "react";
import Link from "next/link";
import { useGameStore } from "@/stores/game-store";

interface Lobby {
  id: string;
  name: string;
  host: string;
  players: number;
  maxPlayers: number;
  status: "waiting" | "starting" | "in-progress";
  createdAt: string;
}

export default function LobbyPage() {
  const { setRoomId, setCurrentPlayerId } = useGameStore();
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newLobbyName, setNewLobbyName] = useState("");

  // Mock data for development
  const mockLobbies: Lobby[] = [
    {
      id: "lobby-1",
      name: "Quick Game",
      host: "Player One",
      players: 1,
      maxPlayers: 2,
      status: "waiting",
      createdAt: new Date().toISOString(),
    },
    {
      id: "lobby-2",
      name: "Tournament Match",
      host: "Player Two",
      players: 2,
      maxPlayers: 2,
      status: "starting",
      createdAt: new Date().toISOString(),
    },
  ];

  // In real implementation, fetch from REST API
  // useEffect(() => {
  //   fetch('/api/lobbies')
  //     .then(res => res.json())
  //     .then(data => setLobbies(data))
  //     .catch(console.error);
  // }, []);

  const handleJoinLobby = (lobbyId: string) => {
    // In real implementation, call POST /lobbies/{id}/join
    setRoomId(lobbyId);
    setCurrentPlayerId("P1"); // In real app, get from auth
    // Navigate to game room
    window.location.href = `/game?room=${lobbyId}`;
  };

  const handleCreateLobby = () => {
    // In real implementation, call POST /lobbies
    const newLobby: Lobby = {
      id: `lobby-${Date.now()}`,
      name: newLobbyName || "My Game",
      host: "You",
      players: 1,
      maxPlayers: 2,
      status: "waiting",
      createdAt: new Date().toISOString(),
    };
    setLobbies([...mockLobbies, newLobby]);
    setNewLobbyName("");
    setShowCreateForm(false);
    handleJoinLobby(newLobby.id);
  };

  const displayLobbies = lobbies.length > 0 ? lobbies : mockLobbies;

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-5xl font-bold mb-8 brutal-border px-6 py-3 bg-white inline-block brutal-shadow">
          Montoncito Lobby
        </h1>

        <div className="brutal-border p-6 mb-6 bg-white brutal-shadow">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-3xl font-bold">Public Lobbies</h2>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="brutal-button bg-green-500 text-white hover:bg-green-600"
            >
              {showCreateForm ? "Cancel" : "Create Game"}
            </button>
          </div>

          {showCreateForm && (
            <div className="mb-4 p-4 brutal-border bg-yellow-50">
              <h3 className="font-bold mb-2">Create New Lobby</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newLobbyName}
                  onChange={(e) => setNewLobbyName(e.target.value)}
                  placeholder="Lobby name (optional)"
                  className="flex-1 brutal-border px-3 py-2"
                />
                <button
                  onClick={handleCreateLobby}
                  className="brutal-button bg-blue-500 text-white hover:bg-blue-600"
                >
                  Create
                </button>
              </div>
            </div>
          )}

          {displayLobbies.length === 0 ? (
            <p className="text-gray-600 font-semibold">No lobbies available</p>
          ) : (
            <div className="space-y-3">
              {displayLobbies.map((lobby) => (
                <div
                  key={lobby.id}
                  className="brutal-border p-4 bg-gray-50 flex justify-between items-center"
                >
                  <div>
                    <h3 className="font-bold text-lg">{lobby.name}</h3>
                    <p className="text-sm text-gray-600">
                      Host: {lobby.host} | Players: {lobby.players}/
                      {lobby.maxPlayers} | Status: {lobby.status}
                    </p>
                  </div>
                  <button
                    onClick={() => handleJoinLobby(lobby.id)}
                    disabled={lobby.players >= lobby.maxPlayers}
                    className="brutal-button bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {lobby.players >= lobby.maxPlayers ? "Full" : "Join"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6">
          <Link
            href="/game"
            className="brutal-button bg-blue-500 text-white hover:bg-blue-600 inline-block"
          >
            Go to Game (Mock - No Backend)
          </Link>
        </div>
      </div>
    </div>
  );
}

