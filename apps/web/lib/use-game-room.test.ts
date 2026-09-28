import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStartedGame } from "@mont/core-game";

const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  refs: [] as { current: unknown }[],
  cursor: 0,
  effect: undefined as (() => void | (() => void)) | undefined,
  socket: undefined as FakeSocket | undefined,
  tokenResponses: [] as (string | Error)[],
  apiFetch: vi.fn(),
}));

class FakeSocket {
  connected = false;
  auth: Record<string, unknown> = {};
  emitted: { event: string; payload?: unknown }[] = [];
  private listeners = new Map<string, ((payload?: unknown) => void)[]>();

  on(event: string, listener: (payload?: unknown) => void) {
    const current = this.listeners.get(event) ?? [];
    current.push(listener);
    this.listeners.set(event, current);
    return this;
  }

  emit(event: string, payload?: unknown) {
    this.emitted.push({ event, payload });
    return this;
  }

  connect() {
    this.connected = true;
    this.fire("connect");
  }

  disconnect() {
    this.connected = false;
    this.fire("disconnect", "io client disconnect");
  }

  fire(event: string, payload?: unknown) {
    this.listeners.get(event)?.forEach((listener) => listener(payload));
  }
}

vi.mock("react", () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void)) => {
    harness.effect = effect;
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    harness.refs[index] ??= { current: initial };
    return harness.refs[index];
  },
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    harness.states[index] ??=
      typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [
      harness.states[index],
      (update: unknown) => {
        harness.states[index] =
          typeof update === "function"
            ? (update as (value: unknown) => unknown)(harness.states[index])
            : update;
      },
    ];
  },
}));

vi.mock("socket.io-client", () => ({
  io: () => {
    harness.socket = new FakeSocket();
    return harness.socket;
  },
}));

vi.mock("./api", () => ({
  apiFetch: harness.apiFetch,
  ApiHttpError: class ApiHttpError extends Error {
    constructor(
      public readonly status: number,
      message: string,
    ) {
      super(message);
    }
  },
  getOrCreateClientId: () => "player-1",
  getServerUrl: () => "http://server.test",
}));

import { useGameRoom } from "./use-game-room";
import { ApiHttpError } from "./api";

describe("useGameRoom reconnect behavior", () => {
  const roomId = "room-1";
  const snapshot = {
    version: 1,
    seq: 0,
    state: createStartedGame({ players: ["player-1", "player-2"], seed: 1 }),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    harness.states = [];
    harness.refs = [];
    harness.cursor = 0;
    harness.effect = undefined;
    harness.socket = undefined;
    harness.tokenResponses = ["initial-token"];
    harness.apiFetch.mockReset().mockImplementation(async () => {
      const next = harness.tokenResponses.shift();
      if (next instanceof Error) throw next;
      return { wsJoinToken: next };
    });
    const storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => "player-1",
        setItem: vi.fn(),
      },
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a temporary credential failure and resubmits the same Pending Action ID after snapshot", async () => {
    harness.tokenResponses.push(
      new Error("HTTP 503 Service Unavailable"),
      "renewed-token",
    );
    const initialView = renderHook();
    expect(harness.effect).toBeDefined();
    harness.effect?.();
    expect(harness.apiFetch).toHaveBeenCalled();
    await flushPromises();
    const socket = harness.socket!;
    socket.connect();
    socket.fire("room.sync.snapshot", snapshot);

    const view = renderHook();
    expect(view.state).toEqual(snapshot.state);
    expect(view.submitAction({ kind: "END_TURN" })).toBe(true);
    const submitted = socket.emitted.find(
      (frame) => frame.event === "room.action.submit",
    )!;
    const actionId = (submitted.payload as { actionId: string }).actionId;

    socket.connected = false;
    socket.fire("disconnect", "transport close");
    await flushPromises();
    expect(harness.apiFetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    const reconnecting = renderHook();
    expect(reconnecting.state).toEqual(snapshot.state);
    expect(reconnecting.pendingAction).toMatchObject({ actionId });
    expect(reconnecting.connectionStatus).toBe("connecting");
    expect(reconnecting.problem).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    expect(socket.auth).toEqual({ token: "renewed-token" });
    socket.fire("room.sync.snapshot", snapshot);

    const retried = socket.emitted.filter(
      (frame) => frame.event === "room.action.submit",
    );
    expect(retried).toHaveLength(2);
    expect(retried[1]?.payload).toMatchObject({ actionId });
    expect(initialView.connectionStatus).toBe("connecting");
  });

  it("persists the Pending Action before delivery and recovers it after a same-tab refresh", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const firstSocket = harness.socket!;
    firstSocket.connect();
    firstSocket.fire("room.sync.snapshot", { ...snapshot, seq: 4 });

    const view = renderHook();
    expect(view.submitAction({ kind: "END_TURN" })).toBe(true);
    const originalSubmission = firstSocket.emitted.find(
      (frame) => frame.event === "room.action.submit",
    )?.payload;
    expect(originalSubmission).toBeDefined();
    expect(
      window.sessionStorage.getItem(`montoncito:${roomId}:pending-action`),
    ).toBe(JSON.stringify(originalSubmission));

    firstSocket.disconnect();
    harness.states = [];
    harness.refs = [];
    harness.cursor = 0;
    harness.effect = undefined;
    harness.socket = undefined;
    harness.tokenResponses.push("refreshed-token");

    renderHook();
    harness.effect?.();
    await flushPromises();
    const refreshedSocket = harness.socket!;
    refreshedSocket.connect();
    expect(
      refreshedSocket.emitted.some(
        (frame) => frame.event === "room.action.submit",
      ),
    ).toBe(false);

    refreshedSocket.fire("room.sync.snapshot", { ...snapshot, seq: 5 });

    const retriedSubmission = refreshedSocket.emitted.find(
      (frame) => frame.event === "room.action.submit",
    )?.payload;
    expect(retriedSubmission).toEqual(originalSubmission);
    expect(renderHook().state).toEqual(snapshot.state);
  });

  it("keeps the pending lock through other players' updates and reconnects until a matching outcome", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.fire("room.sync.snapshot", snapshot);
    const view = renderHook();
    expect(view.submitAction({ kind: "END_TURN" })).toBe(true);
    const submission = socket.emitted.find(
      ({ event }) => event === "room.action.submit",
    )!.payload as { actionId: string };
    expect(renderHook()).toMatchObject({
      seq: 0,
      state: snapshot.state,
      pendingAction: submission,
    });
    const newerState = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 2 },
    };
    socket.fire("room.state", { version: 1, seq: 1, state: newerState });
    socket.fire("room.action.accepted", {
      version: 1,
      actionId: "550e8400-e29b-41d4-a716-446655440040",
      seq: 1,
      state: newerState,
    });
    expect(renderHook()).toMatchObject({
      seq: 1,
      state: newerState,
      pendingAction: submission,
    });
    expect(renderHook().submitAction({ kind: "END_TURN" })).toBe(false);

    socket.connected = false;
    socket.fire("disconnect", "transport close");
    expect(renderHook().pendingAction).toMatchObject(submission);
    socket.connected = true;
    socket.fire("connect");
    expect(renderHook().connectionStatus).toBe("synchronizing");
    expect(renderHook().pendingAction).toMatchObject(submission);
    expect(
      socket.emitted.filter(({ event }) => event === "room.action.submit"),
    ).toHaveLength(1);
    expect(renderHook().submitAction({ kind: "END_TURN" })).toBe(false);
    socket.fire("room.sync.snapshot", {
      ...snapshot,
      seq: 1,
      state: newerState,
    });
    expect(
      socket.emitted
        .filter(({ event }) => event === "room.action.submit")
        .map(({ payload }) => payload),
    ).toEqual([submission, submission]);
    socket.fire("room.action.rejected", {
      version: 1,
      actionId: submission.actionId,
      code: "STALE_BASE_SEQ",
      seq: 1,
      state: newerState,
    });
    expect(renderHook().pendingAction).toBeNull();
    expect(
      window.sessionStorage.getItem(`montoncito:${roomId}:pending-action`),
    ).toBeNull();
  });

  it("does not deliver an Action when same-tab persistence fails", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.connect();
    socket.fire("room.sync.snapshot", snapshot);
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });

    expect(renderHook().submitAction({ kind: "END_TURN" })).toBe(false);
    expect(
      socket.emitted.some((frame) => frame.event === "room.action.submit"),
    ).toBe(false);
    expect(renderHook().pendingAction).toBeNull();
    expect(renderHook().state).toEqual(snapshot.state);
    expect(renderHook().submissionError).toMatch(/did not submit/i);
  });

  it("rolls back a local submission when the socket cannot emit", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.fire("room.sync.snapshot", snapshot);
    vi.spyOn(socket, "emit").mockImplementationOnce(() => {
      throw new Error("transport failed");
    });

    expect(renderHook().submitAction({ kind: "END_TURN" })).toBe(false);
    expect(renderHook().pendingAction).toBeNull();
    expect(renderHook().state).toEqual(snapshot.state);
    expect(renderHook().submissionError).toMatch(/did not submit/i);
    expect(
      window.sessionStorage.getItem(`montoncito:${roomId}:pending-action`),
    ).toBeNull();
  });

  it("does not retry a Pending Action after receiving an invalid snapshot", async () => {
    const pendingAction = {
      version: 1,
      actionId: "550e8400-e29b-41d4-a716-446655440019",
      baseSeq: 0,
      action: { kind: "END_TURN" },
    };
    window.sessionStorage.setItem(
      `montoncito:${roomId}:pending-action`,
      JSON.stringify(pendingAction),
    );
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.connect();

    socket.fire("room.sync.snapshot", {
      version: 1,
      seq: -1,
      state: snapshot.state,
    });

    expect(
      socket.emitted.some((frame) => frame.event === "room.action.submit"),
    ).toBe(false);
    expect(renderHook().connectionStatus).toBe("failed");
  });

  it("does not retry a Pending Action from a snapshot older than current state", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.connect();
    socket.fire("room.sync.snapshot", { ...snapshot, seq: 5 });
    renderHook();

    const pendingAction = {
      version: 1,
      actionId: "550e8400-e29b-41d4-a716-446655440022",
      baseSeq: 4,
      action: { kind: "END_TURN" },
    };
    window.sessionStorage.setItem(
      `montoncito:${roomId}:pending-action`,
      JSON.stringify(pendingAction),
    );

    const syncRequestsBeforeStaleSnapshot = socket.emitted.filter(
      (frame) => frame.event === "room.sync.request",
    ).length;
    socket.fire("room.sync.snapshot", { ...snapshot, seq: 4 });

    expect(
      socket.emitted.some((frame) => frame.event === "room.action.submit"),
    ).toBe(false);
    expect(
      socket.emitted.filter((frame) => frame.event === "room.sync.request"),
    ).toHaveLength(syncRequestsBeforeStaleSnapshot + 1);

    socket.fire("room.sync.snapshot", { ...snapshot, seq: 5 });

    expect(
      socket.emitted.find((frame) => frame.event === "room.action.submit")
        ?.payload,
    ).toEqual(pendingAction);
    expect(renderHook().seq).toBe(5);
  });

  it("preserves a newer broadcast that has not rendered before a snapshot arrives", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.connect();
    socket.fire("room.sync.snapshot", { ...snapshot, seq: 5 });
    renderHook();

    const newerState = {
      ...snapshot.state,
      turn: { ...snapshot.state.turn, number: 6 },
    };
    socket.fire("room.state", {
      version: 1,
      seq: 6,
      state: newerState,
    });
    const pendingAction = {
      version: 1,
      actionId: "550e8400-e29b-41d4-a716-446655440023",
      baseSeq: 4,
      action: { kind: "END_TURN" },
    };
    window.sessionStorage.setItem(
      `montoncito:${roomId}:pending-action`,
      JSON.stringify(pendingAction),
    );

    socket.fire("room.sync.snapshot", { ...snapshot, seq: 5 });

    expect(
      socket.emitted.some((frame) => frame.event === "room.action.submit"),
    ).toBe(false);
    expect(renderHook()).toMatchObject({ seq: 6, state: newerState });
  });

  it("clears pending storage and Authoritative state when membership is removed", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    expect(harness.apiFetch).toHaveBeenCalled();
    expect(harness.socket).toBeDefined();
    const socket = harness.socket!;
    socket.connect();
    socket.fire("room.sync.snapshot", snapshot);
    const view = renderHook();
    view.submitAction({ kind: "END_TURN" });

    socket.fire("event", { type: "KICKED" });

    const removed = renderHook();
    expect(removed.connectionStatus).toBe("removed");
    expect(removed.state).toBeNull();
    expect(removed.pendingAction).toBeNull();
    expect(
      window.sessionStorage.getItem(`montoncito:${roomId}:pending-action`),
    ).toBeNull();
  });

  it("keeps a finished Game room synchronized but rejects route-facing submissions", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.connect();
    const finishedSnapshot = {
      ...snapshot,
      state: {
        ...snapshot.state,
        phase: "gameover" as const,
        winner: "player-1",
      },
    };
    socket.fire("room.sync.snapshot", finishedSnapshot);

    const view = renderHook();
    expect(view.state).toMatchObject({ phase: "gameover", winner: "player-1" });
    expect(view.submitAction({ kind: "END_TURN" })).toBe(false);
    expect(
      socket.emitted.some((frame) => frame.event === "room.action.submit"),
    ).toBe(false);
  });

  it.each(["turn", "gameover"] as const)(
    "sends and receives chat while %s without submitting an Action",
    async (phase) => {
      renderHook();
      harness.effect?.();
      await flushPromises();
      const socket = harness.socket!;
      socket.connect();
      socket.fire("room.sync.snapshot", {
        ...snapshot,
        state: {
          ...snapshot.state,
          phase,
          ...(phase === "gameover" ? { winner: "player-1" } : {}),
        },
      });
      const view = renderHook();

      expect(view.sendChat("Hello")).toBe(true);
      expect(socket.emitted).toContainEqual({
        event: "chat",
        payload: { text: "Hello" },
      });
      socket.fire("event", {
        type: "CHAT_MESSAGE",
        id: "chat-1",
        playerId: "player-2",
        playerName: "Bob",
        text: "Hi",
        timestamp: 123,
      });
      expect(renderHook().chatMessages).toMatchObject([
        { playerId: "player-2", playerName: "Bob", text: "Hi" },
      ]);
      expect(renderHook().seq).toBe(0);
      expect(
        socket.emitted.some((frame) => frame.event === "room.action.submit"),
      ).toBe(false);
    },
  );

  it("does not send chat while disconnected or before synchronization", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    expect(renderHook().sendChat("early")).toBe(false);
    socket.connect();
    socket.fire("room.sync.snapshot", snapshot);
    socket.connected = false;
    socket.fire("disconnect", "transport close");

    expect(renderHook().sendChat("draft")).toBe(false);
    expect(socket.emitted.some((frame) => frame.event === "chat")).toBe(false);
    socket.connected = true;
    socket.fire("connect");
    socket.fire("room.sync.snapshot", snapshot);
    expect(socket.emitted.some((frame) => frame.event === "chat")).toBe(false);
    expect(renderHook().sendChat("draft")).toBe(true);
  });

  it("recovers chat on entry and reconnect, reconciling live messages received before history", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    expect(socket.emitted).toContainEqual({
      event: "chat.history.request",
      payload: { version: 1 },
    });
    socket.fire("room.sync.snapshot", snapshot);
    const earlier = {
      type: "CHAT_MESSAGE",
      id: "one",
      playerId: "player-2",
      playerName: "Bob",
      text: "Waiting",
      timestamp: 10,
    };
    const overlap = {
      ...earlier,
      id: "two",
      text: "During recovery",
      timestamp: 11,
    };
    socket.fire("event", overlap);
    expect(renderHook().liveChatCount).toBe(0);
    socket.fire("chat.history", { version: 1, messages: [earlier, overlap] });
    expect(renderHook().liveChatCount).toBe(0);
    expect(renderHook().chatMessages.map(({ id }) => id)).toEqual([
      "one",
      "two",
    ]);

    socket.connected = false;
    socket.fire("disconnect", "transport close");
    socket.connected = true;
    socket.fire("connect");
    const missed = { ...earlier, id: "three", text: "Missed", timestamp: 12 };
    const latest = { ...earlier, id: "four", text: "Live", timestamp: 13 };
    socket.fire("event", latest);
    expect(renderHook().liveChatCount).toBe(0);
    socket.fire("chat.history", {
      version: 1,
      messages: [overlap, missed, latest],
    });
    expect(renderHook().liveChatCount).toBe(0);
    expect(renderHook().chatMessages.map(({ id }) => id)).toEqual([
      "two",
      "three",
      "four",
    ]);
    socket.fire("event", { ...latest, id: "five", text: "After recovery" });
    socket.fire("event", { ...latest, id: "five", text: "After recovery" });
    expect(renderHook().liveChatCount).toBe(1);
    expect(renderHook().chatMessages.map(({ id }) => id)).toEqual([
      "two",
      "three",
      "four",
      "five",
    ]);
    expect(
      socket.emitted.filter(({ event }) => event === "chat.history.request"),
    ).toHaveLength(2);
  });

  it("keeps delivery order when recovery crosses the 100-message window", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    const messages = Array.from({ length: 105 }, (_, index) => ({
      type: "CHAT_MESSAGE" as const,
      id: `chat-${index}`,
      playerId: "player-2",
      playerName: "Bob",
      text: `message-${index}`,
      timestamp: 1,
    }));
    for (const message of messages) socket.fire("event", message);
    socket.fire("chat.history", { version: 1, messages: messages.slice(5) });

    expect(renderHook().chatMessages.map(({ id }) => id)).toEqual(
      messages.slice(5).map(({ id }) => id),
    );
  });

  it("stops reconnecting and clears state when credential renewal confirms removal", async () => {
    renderHook();
    harness.effect?.();
    await flushPromises();
    const socket = harness.socket!;
    socket.connect();
    socket.fire("room.sync.snapshot", snapshot);
    renderHook().submitAction({ kind: "END_TURN" });
    harness.tokenResponses.push(new ApiHttpError(403, "No longer a member"));

    socket.connected = false;
    socket.fire("disconnect", "transport close");
    await flushPromises();

    const removed = renderHook();
    expect(removed.connectionStatus).toBe("removed");
    expect(removed.state).toBeNull();
    expect(removed.pendingAction).toBeNull();
    expect(
      window.sessionStorage.getItem(`montoncito:${roomId}:pending-action`),
    ).toBeNull();
    await vi.advanceTimersByTimeAsync(30000);
    expect(harness.apiFetch).toHaveBeenCalledTimes(2);
    expect(socket.connected).toBe(false);
  });

  function renderHook() {
    harness.cursor = 0;
    return useGameRoom(roomId);
  }

  async function flushPromises() {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
});
