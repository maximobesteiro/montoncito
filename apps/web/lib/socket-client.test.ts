import { expect, it, vi } from "vitest";

const socket = vi.hoisted(() => ({
  listeners: new Map<string, (...args: unknown[]) => void>(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connect: vi.fn(),
  connected: true,
}));
vi.mock("socket.io-client", () => ({
  io: () => ({
    ...socket,
    on: (name: string, callback: (...args: unknown[]) => void) =>
      socket.listeners.set(name, callback),
  }),
}));
vi.mock("./api", () => ({ getServerUrl: () => "http://server.test" }));

import { getSocketClient } from "./socket-client";

it("requests chat history on each connection and reconciles overlap with live Lobby chat", () => {
  const client = getSocketClient();
  const events: unknown[] = [];
  client.connect("token");
  client.on((event) => events.push(event));
  socket.listeners.get("connect")?.();
  expect(socket.emit).toHaveBeenCalledWith("chat.history.request", {
    version: 1,
  });
  const older = {
    type: "CHAT_MESSAGE",
    id: "one",
    playerId: "p1",
    playerName: "Alice",
    text: "Old",
    timestamp: 1,
  };
  const overlap = { ...older, id: "two", text: "Live" };
  socket.listeners.get("event")?.(overlap);
  socket.listeners.get("chat.history")?.({
    version: 1,
    messages: [older, overlap],
  });
  expect(events.at(-1)).toMatchObject({
    type: "CHAT_HISTORY",
    messages: [older, overlap],
  });

  socket.listeners.get("connect")?.();
  expect(socket.emit).toHaveBeenCalledTimes(2);
  socket.listeners.get("chat.history")?.({ version: 1, messages: [overlap] });
  expect(events.at(-1)).toMatchObject({
    type: "CHAT_HISTORY",
    messages: [overlap],
  });
  client.disconnect();
});

it("renews Lobby membership before reconnecting after a transport interruption", async () => {
  const client = getSocketClient();
  const renewToken = vi.fn().mockResolvedValue("new-token");
  client.connect("old-token", renewToken);
  socket.listeners.get("disconnect")?.("transport close");
  await vi.waitFor(() => expect(renewToken).toHaveBeenCalledOnce());
  expect(socket.connect).toHaveBeenCalled();
  client.disconnect();
});
