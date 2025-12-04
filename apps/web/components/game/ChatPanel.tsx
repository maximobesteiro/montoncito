"use client";

import { useState, useRef, useEffect } from "react";
import { useGameStore } from "@/stores/game-store";
import { useWebSocket } from "@/lib/use-websocket";

interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  timestamp: number;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { roomId, currentPlayerId } = useGameStore();
  const token = null; // In real app, get from auth
  const { sendChat } = useWebSocket({
    roomId,
    token,
    currentPlayerId,
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !roomId) return;
    
    // In real implementation, this would come from WebSocket events
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      playerId: currentPlayerId || "unknown",
      playerName: currentPlayerId || "You",
      text: input.trim(),
      timestamp: Date.now(),
    };
    
    setMessages((prev) => [...prev, newMessage]);
    setInput("");
    
    if (sendChat) {
      sendChat(input.trim());
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div className="brutal-border bg-white brutal-shadow w-80 h-96 flex flex-col">
          <div className="p-3 brutal-border-b bg-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-lg">Chat</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="brutal-border px-2 py-1 bg-white hover:bg-gray-100 font-bold"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 ? (
              <p className="text-gray-500 text-sm">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="text-sm">
                  <span className="font-bold">{msg.playerName}:</span>{" "}
                  <span>{msg.text}</span>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className="p-3 brutal-border-t flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              className="flex-1 brutal-border px-2 py-1"
            />
            <button
              onClick={handleSend}
              className="brutal-button bg-blue-500 text-white hover:bg-blue-600"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="brutal-button bg-blue-500 text-white hover:bg-blue-600"
        >
          Chat
        </button>
      )}
    </div>
  );
}


