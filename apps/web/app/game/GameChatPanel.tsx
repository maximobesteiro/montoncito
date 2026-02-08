"use client";

import { useState } from "react";

export function GameChatPanel() {
  const [messages] = useState<
    { id: string; playerName: string; text: string }[]
  >([
    { id: "1", playerName: "Player One", text: "Good luck!" },
    { id: "2", playerName: "Player Two", text: "You too!" },
    { id: "3", playerName: "Player One", text: "Nice move" },
  ]);
  const [input, setInput] = useState("");

  return (
    <div className="brutal-border bg-card brutal-shadow flex flex-col h-64">
      <div className="p-3 brutal-border-b bg-surface">
        <h3 className="font-bold text-lg">Chat</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <p className="text-text-muted text-sm">No messages yet</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="text-sm">
              <span className="font-bold">{msg.playerName}:</span>{" "}
              <span>{msg.text}</span>
            </div>
          ))
        )}
      </div>
      <div className="p-3 brutal-border-t flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 brutal-border px-2 py-1 bg-card text-sm"
        />
        <button className="brutal-button bg-btn-primary text-text-on-dark hover:bg-btn-primary-hover text-sm px-3">
          Send
        </button>
      </div>
    </div>
  );
}
