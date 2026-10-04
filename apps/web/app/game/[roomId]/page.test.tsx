// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  applyMove,
  createStartedGame,
  deserialize,
  serialize,
  type Card,
  type GameState,
  type Move,
  type Rank,
} from "@mont/core-game";

const gameRoom = vi.hoisted(() => ({
  view: {} as Record<string, unknown>,
  roomId: "room-1",
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ roomId: gameRoom.roomId }),
}));
vi.mock("@/lib/use-game-room", () => ({ useGameRoom: () => gameRoom.view }));

import GameRoomPage from "./page";
import { denseBoardState } from "./dense-board.fixture";

beforeEach(() => {
  // jsdom has no PointerEvent constructor; use mouse coordinates plus pointer identity.
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? "mouse";
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Element.prototype.scrollIntoView = vi.fn();
  window.sessionStorage.clear();
  gameRoom.roomId = "room-1";
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, "elementFromPoint");
});

function releaseOver(
  source: Element,
  target: () => Element,
  pointerType: string,
) {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => target(),
  });
  fireEvent.pointerDown(source, { pointerId: 1, pointerType, button: 0 });
  fireEvent.pointerUp(source, {
    pointerId: 1,
    pointerType,
    clientX: 10,
    clientY: 10,
  });
}

function showGameRoom(liveChatCount = 0) {
  gameRoom.view = {
    state: createStartedGame({ players: ["player-1", "player-2"], seed: 1 }),
    seq: 0,
    currentPlayerId: "player-1",
    connectionStatus: "connected",
    problem: null,
    pendingAction: null,
    lastActionResult: null,
    submitAction: vi.fn(),
    sendChat: vi.fn(),
    chatMessages: [],
    liveChatCount,
  };
}

function boardState(): GameState {
  const state = createStartedGame({
    players: ["player-1", "player-2"],
    seed: 1,
  });
  state.turn.activePlayer = "player-1";
  state.rules.discardPiles = 2;
  state.byId["player-1"]!.name = "Alice";
  state.byId["player-1"]!.hand.cards = [
    { kind: "standard", id: "ace", rank: 1, suit: "Hearts" },
    { kind: "standard", id: "two", rank: 2, suit: "Clubs" },
    { kind: "standard", id: "nine", rank: 9, suit: "Spades" },
    { kind: "standard", id: "king", rank: 13, suit: "Diamonds" },
    { kind: "joker", id: "joker" },
  ];
  state.byId["player-1"]!.discards = [[], []];
  state.byId["player-2"]!.name = "Bob";
  state.byId["player-2"]!.hand.cards = [
    { kind: "standard", id: "secret", rank: 8, suit: "Hearts" },
  ];
  state.byId["player-2"]!.discards = [[], []];
  state.center.buildPiles = [
    {
      id: "build-1",
      nextRank: 2,
      cards: [{ kind: "standard", id: "built-ace", rank: 1, suit: "Spades" }],
    },
  ];
  return state;
}

it("renders the accepted Ace then 2 as the visible and accessible Build top", () => {
  showGameRoom();
  const state = boardState();
  state.center.buildPiles = [];
  const ace = applyMove(state, {
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "ace",
    target: "new",
  });
  expect(ace.accepted).toBe(true);
  const buildId = ace.state.center.buildPiles[0]!.id;
  gameRoom.view = { ...gameRoom.view, state: ace.state, seq: 1 };
  const { rerender } = render(<GameRoomPage />);
  expect(
    screen.getByLabelText("Build top Ace of Hearts").textContent,
  ).toContain("A");

  const two = applyMove(ace.state, {
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "two",
    target: buildId,
  });
  expect(two.accepted).toBe(true);
  expect(two.state.center.buildPiles[0]!.cards.map((card) => card.id)).toEqual([
    "ace",
    "two",
  ]);
  gameRoom.view = { ...gameRoom.view, state: two.state, seq: 2 };
  rerender(<GameRoomPage />);
  const top = screen.getByLabelText("Build top 2 of Clubs");
  expect(top.textContent).toContain("2");
  expect(top.textContent).toContain("♣");
  expect(screen.queryByLabelText("Build top Ace of Hearts")).toBeNull();
  expect(screen.queryByLabelText("Hand 2 of Clubs")).toBeNull();
});

const buildPlacements: {
  name: string;
  card: Card;
  newPile: boolean;
  value: string;
  suit: string;
}[] = [
  {
    name: "Ace of Hearts",
    card: { kind: "standard", id: "placed", rank: 1, suit: "Hearts" },
    newPile: true,
    value: "A",
    suit: "♥",
  },
  {
    name: "King of Diamonds",
    card: { kind: "standard", id: "placed", rank: 13, suit: "Diamonds" },
    newPile: true,
    value: "K",
    suit: "♦",
  },
  {
    name: "Joker",
    card: { kind: "joker", id: "placed" },
    newPile: true,
    value: "J",
    suit: "🃏",
  },
  {
    name: "2 of Clubs",
    card: { kind: "standard", id: "placed", rank: 2, suit: "Clubs" },
    newPile: false,
    value: "2",
    suit: "♣",
  },
  {
    name: "King of Diamonds",
    card: { kind: "standard", id: "placed", rank: 13, suit: "Diamonds" },
    newPile: false,
    value: "K",
    suit: "♦",
  },
  {
    name: "Joker",
    card: { kind: "joker", id: "placed" },
    newPile: false,
    value: "J",
    suit: "🃏",
  },
];

it.each(
  (["Hand", "Stock", "Discard"] as const).flatMap((source) =>
    buildPlacements.map((placement) => ({ source, ...placement })),
  ),
)(
  "renders accepted $source $name with newPile=$newPile and preserves cards while pending",
  ({ source, card, name, newPile, value, suit }) => {
    showGameRoom();
    let state = boardState();
    state.center.buildPiles = [];
    if (!newPile) {
      const starter = applyMove(state, {
        kind: "PLAY_HAND_TO_BUILD",
        cardId: "ace",
        target: "new",
      });
      expect(starter.accepted).toBe(true);
      state = starter.state;
    }
    const player = state.byId["player-1"]!;
    const covered: Card = {
      kind: "standard",
      id: "covered-source",
      rank: 7,
      suit: "Spades",
    };
    if (source === "Hand") player.hand.cards = [covered, card];
    if (source === "Stock") player.stock.faceDown = [covered, card];
    if (source === "Discard") player.discards[0] = [covered, card];
    const before = structuredClone(state);
    const target = newPile ? "new" : state.center.buildPiles[0]!.id;
    const action: Move =
      source === "Hand"
        ? { kind: "PLAY_HAND_TO_BUILD", cardId: card.id, target }
        : source === "Stock"
          ? { kind: "PLAY_STOCK_TO_BUILD", target }
          : { kind: "PLAY_DISCARD_TO_BUILD", pileIndex: 0, target };
    const sourceLabel =
      source === "Discard"
        ? `Discard pile 1, ${name}`
        : `${source === "Stock" ? "Stock top" : "Hand"} ${name}`;
    gameRoom.view = { ...gameRoom.view, state, seq: 1 };
    const { rerender } = render(<GameRoomPage />);
    fireEvent.click(screen.getByRole("button", { name: sourceLabel }));
    if (!newPile)
      expect(
        screen.getByLabelText("Build top Ace of Hearts").textContent,
      ).toContain("A");

    gameRoom.view = {
      ...gameRoom.view,
      pendingAction: { actionId: "pending", action },
    };
    rerender(<GameRoomPage />);
    expect(screen.getByLabelText(sourceLabel)).toBeTruthy();
    if (newPile) expect(screen.queryByLabelText(/^Build top /)).toBeNull();
    else
      expect(
        screen.getByLabelText("Build top Ace of Hearts").textContent,
      ).toContain("A");

    const result = applyMove(state, action);
    expect(result.accepted).toBe(true);
    const expectedPlayer = structuredClone(before.byId["player-1"]!);
    if (source === "Hand")
      expectedPlayer.hand.cards = expectedPlayer.hand.cards.filter(
        (c) => c.id !== card.id,
      );
    if (source === "Stock") expectedPlayer.stock.faceDown = [covered];
    if (source === "Discard") expectedPlayer.discards[0] = [covered];
    expect(result.state.byId["player-1"]).toEqual(expectedPlayer);
    expect(result.state.byId["player-2"]).toEqual(before.byId["player-2"]);
    expect(state).toEqual(before);

    gameRoom.view = {
      ...gameRoom.view,
      state: result.state,
      seq: 2,
      pendingAction: null,
    };
    rerender(<GameRoomPage />);
    const checkTop = () => {
      const top = screen.getByLabelText(`Build top ${name}`);
      expect(top.textContent).toContain(value);
      expect(top.textContent).toContain(suit);
      expect(screen.queryByLabelText(sourceLabel)).toBeNull();
    };
    checkTop();
    if (source === "Stock")
      expect(
        screen.getByLabelText("Stock top 7 of Spades").textContent,
      ).toContain("7");
    if (source === "Discard")
      expect(
        screen.getByLabelText("Discard pile 1, 7 of Spades").textContent,
      ).toContain("7");

    // A recovered snapshot must render the same authoritative top, even read-only.
    gameRoom.view = {
      ...gameRoom.view,
      state: deserialize(serialize(result.state)),
      connectionStatus: "synchronizing",
    };
    rerender(<GameRoomPage />);
    checkTop();
  },
);

it("announces the named viewer as winner after the final Stock play and keeps the final board read-only", () => {
  showGameRoom();
  const state = boardState();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);
  fireEvent.pointerDown(
    screen.getByRole("button", { name: "Hand 2 of Clubs" }),
    {
      pointerId: 1,
      pointerType: "touch",
    },
  );
  const final = structuredClone(state);
  final.phase = "gameover";
  final.winner = "player-1";
  final.byId["player-1"]!.stock.faceDown = [];
  gameRoom.view = { ...gameRoom.view, state: final, seq: 1 };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("heading", { name: "Alice wins! (You)" }),
  ).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("Alice wins!");
  expect(screen.getByText(/Final board is read-only/)).toBeTruthy();
  expect(screen.getByText("Stock (0)")).toBeTruthy();
  expect(screen.getByText("build-1 → 2")).toBeTruthy();
  expect(screen.queryByText(/Your Turn|Active:/)).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: /^(Hand |Stock top |Discard pile |Build pile |New Build pile|End Turn)/,
    }),
  ).toBeNull();
  fireEvent.pointerUp(screen.getByLabelText("Hand 2 of Clubs"), {
    pointerId: 1,
    pointerType: "touch",
  });
  expect(submitAction).not.toHaveBeenCalled();
});

it("shows the server's no-moves fallback winner rather than the last active player", () => {
  showGameRoom();
  const state = boardState();
  state.deck.drawPile = [];
  state.deck.recyclePile = [];
  state.center.buildPiles = [];
  state.byId["player-1"]!.hand.cards = [
    { kind: "standard", id: "last", rank: 9, suit: "Clubs" },
  ];
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "s1", rank: 8, suit: "Clubs" },
    { kind: "standard", id: "s2", rank: 8, suit: "Hearts" },
  ];
  state.byId["player-2"]!.stock.faceDown = [
    { kind: "standard", id: "s3", rank: 8, suit: "Spades" },
  ];
  const result = applyMove(state, {
    kind: "DISCARD_FROM_HAND",
    cardId: "last",
    pileIndex: 0,
  });
  expect(result.accepted).toBe(true);
  expect(result.state.winner).toBe("player-2");
  gameRoom.view = { ...gameRoom.view, state: result.state, seq: 1 };
  render(<GameRoomPage />);
  expect(screen.getByRole("heading", { name: "Bob wins!" })).toBeTruthy();
  expect(screen.queryByText(/Active:|Your Turn/)).toBeNull();
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Hand / })).toBeNull();
});

it("marks the pending source and target without moving cards across updates and reconnect", () => {
  showGameRoom();
  const state = boardState();
  const action = {
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "two",
    target: "build-1",
  };
  gameRoom.view = {
    ...gameRoom.view,
    state,
    pendingAction: { actionId: "pending", action },
  };
  const { rerender } = render(<GameRoomPage />);
  const checkPending = () => {
    expect(screen.getByLabelText("Hand 2 of Clubs").textContent).toContain(
      "Pending",
    );
    expect(
      within(screen.getByRole("region", { name: "Build piles" })).getByText(
        "Pending",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Hand / })).toBeNull();
  };
  checkPending();
  gameRoom.view = { ...gameRoom.view, seq: 1, connectionStatus: "connecting" };
  rerender(<GameRoomPage />);
  checkPending();
  gameRoom.view = { ...gameRoom.view, connectionStatus: "synchronizing" };
  rerender(<GameRoomPage />);
  checkPending();
  gameRoom.view = {
    ...gameRoom.view,
    connectionStatus: "connected",
    pendingAction: null,
    lastActionResult: { actionId: "pending", seq: 1, state },
  };
  rerender(<GameRoomPage />);
  expect(screen.queryByText("Pending")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/Action accepted|success/i)).toBeNull();
});

it("announces a readable rejection on the latest board, replaces it, and offers Dismiss", () => {
  showGameRoom();
  const state = boardState();
  const dismissActionResult = vi.fn();
  gameRoom.view = {
    ...gameRoom.view,
    state,
    seq: 2,
    dismissActionResult,
    lastActionResult: {
      actionId: "first",
      code: "STALE_BASE_SEQ",
      state,
      seq: 2,
    },
  };
  const { rerender } = render(<GameRoomPage />);
  expect(screen.getByRole("alert").textContent).toContain(
    "The board changed before your Action arrived",
  );
  expect(screen.getByRole("button", { name: "Hand 2 of Clubs" })).toBeTruthy();
  const latest = structuredClone(state);
  latest.center.buildPiles[0]!.nextRank = 3;
  gameRoom.view = {
    ...gameRoom.view,
    state: latest,
    seq: 3,
    lastActionResult: {
      actionId: "second",
      code: "ILLEGAL_ACTION",
      message: "That card cannot go on this Build pile.",
      state: latest,
      seq: 3,
    },
  };
  rerender(<GameRoomPage />);
  expect(screen.getByText("build-1 → 3")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain(
    "That card cannot go on this Build pile.",
  );
  expect(screen.queryByText(/The board changed before/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(dismissActionResult).toHaveBeenCalledTimes(1);
  gameRoom.view = { ...gameRoom.view, lastActionResult: null };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("labels the retained board stale, clears unsubmitted selection, and requires fresh selection after recovery", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  const { rerender } = render(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
  gameRoom.view = { ...gameRoom.view, connectionStatus: "connecting" };
  rerender(<GameRoomPage />);
  expect(screen.getByText(/Reconnecting to the Game room/)).toBeTruthy();
  expect(screen.getByText(/Board is stale and read-only/)).toBeTruthy();
  expect(screen.getByLabelText("Hand 2 of Clubs")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Hand / })).toBeNull();
  gameRoom.view = { ...gameRoom.view, connectionStatus: "synchronizing" };
  rerender(<GameRoomPage />);
  expect(screen.getByText(/Synchronizing Game room/)).toBeTruthy();
  expect(screen.queryByText(/Reconnecting to the Game room/)).toBeNull();
  gameRoom.view = { ...gameRoom.view, connectionStatus: "connected" };
  rerender(<GameRoomPage />);
  expect(screen.queryByText(/Board is stale/)).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Hand 2 of Clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(screen.getByText("build-1 → 2"));
  expect(submitAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledTimes(1);
});

it.each(["failed", "removed"])(
  "shows terminal %s with a Lobby link and no playable stale cards",
  (connectionStatus) => {
    showGameRoom();
    const submitAction = vi.fn(() => true);
    gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
    const { rerender } = render(<GameRoomPage />);
    fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
    gameRoom.view = {
      ...gameRoom.view,
      connectionStatus,
      problem: "The Game room is no longer available.",
    };
    rerender(<GameRoomPage />);
    expect(screen.getByRole("alert").textContent).toContain(
      "no longer available",
    );
    expect(
      screen
        .getByRole("link", { name: "Return to Lobby" })
        .getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByRole("region", { name: "Game board" })).toBeNull();
    expect(submitAction).not.toHaveBeenCalled();
  },
);

it("reports an unsubmitted attempt without pending marks or moving the card", () => {
  showGameRoom();
  const submitAction = vi.fn(() => false);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  const { rerender } = render(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  gameRoom.view = {
    ...gameRoom.view,
    submissionError: "Action did not submit. Please try again.",
  };
  rerender(<GameRoomPage />);
  expect(screen.getByRole("alert").textContent).toContain("did not submit");
  expect(screen.queryByText(/Action pending/)).toBeNull();
  expect(screen.queryByText("Pending")).toBeNull();
  expect(screen.getByRole("button", { name: "Hand 2 of Clubs" })).toBeTruthy();
});

it.each([
  {
    action: { kind: "PLAY_STOCK_TO_BUILD", target: "new" },
    source: "Your Stock",
    target: "Build piles",
  },
  {
    action: { kind: "PLAY_DISCARD_TO_BUILD", pileIndex: 0, target: "build-1" },
    source: "Alice Discard pile 1",
    target: "Build piles",
  },
  {
    action: { kind: "DISCARD_FROM_HAND", cardId: "nine", pileIndex: 1 },
    source: "Your Hand",
    target: "Alice Discard pile 2",
  },
])(
  "marks the source and destination of pending $action.kind while keeping gameplay locked",
  ({ action, source, target }) => {
    showGameRoom();
    const state = historyState();
    gameRoom.view = {
      ...gameRoom.view,
      state,
      pendingAction: { actionId: "pending", action },
    };
    render(<GameRoomPage />);
    expect(
      within(screen.getByRole("group", { name: source })).getByText("Pending"),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole(target === "Build piles" ? "region" : "group", {
          name: target,
        }),
      ).getByText("Pending"),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /^(Hand |Stock top |Discard pile |Build pile |New Build pile)/,
      }),
    ).toBeNull();
  },
);

it("opens mobile chat closed by default, cancels selection and drag, and restores the board on Close", () => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  window.sessionStorage.setItem("montoncito:room-1:chat-expanded", "true");
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  render(<GameRoomPage />);
  const source = screen.getByRole("button", { name: "Hand Ace of Hearts" });
  fireEvent.pointerDown(source, { pointerId: 1, pointerType: "touch" });
  expect(source.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
  expect(screen.getByRole("dialog", { name: "Game room chat" })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Hand Ace of Hearts" }),
  ).toBeNull();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => screen.getByRole("button", { name: "New Build pile" }),
  });
  fireEvent.pointerUp(screen.getByRole("region", { name: "Game board" }), {
    pointerId: 1,
    pointerType: "touch",
  });
  fireEvent.click(screen.getByText("New Build pile"));
  expect(submitAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Hand Ace of Hearts" }));
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).toHaveBeenCalledTimes(1);
});

function historyState(): GameState {
  const state = boardState();
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "oldest", rank: 4, suit: "Clubs" },
    { kind: "standard", id: "older", rank: 5, suit: "Hearts" },
    { kind: "standard", id: "covered", rank: 1, suit: "Diamonds" },
    { kind: "standard", id: "top", rank: 2, suit: "Hearts" },
  ];
  state.byId["player-2"]!.discards[0] = [
    { kind: "standard", id: "bob-old", rank: 6, suit: "Clubs" },
    { kind: "standard", id: "bob-top", rank: 2, suit: "Diamonds" },
  ];
  return state;
}

it.each([1, 2, 3, 4] as const)(
  "keeps all 18 Build targets and %i Discard piles usable with three inspection-only opponents",
  (count) => {
    showGameRoom();
    const submitAction = vi.fn(() => true);
    gameRoom.view = {
      ...gameRoom.view,
      state: denseBoardState(count),
      submitAction,
    };
    render(<GameRoomPage />);
    fireEvent.click(screen.getByRole("button", { name: "Hand 3 of Clubs" }));
    for (let index = 1; index <= 18; index++) {
      const build = screen.getByRole("button", {
        name: `Build pile build-${index}, next 3`,
      });
      expect(build.hasAttribute("disabled")).toBe(false);
      expect(within(build).getByLabelText("Build top 2 of Clubs")).toBeTruthy();
    }
    fireEvent.click(
      screen.getByRole("button", { name: "Build pile build-18, next 3" }),
    );
    expect(submitAction).toHaveBeenLastCalledWith({
      kind: "PLAY_HAND_TO_BUILD",
      cardId: "player-1-hand-3",
      target: "build-18",
    });
    fireEvent.click(screen.getByRole("button", { name: "Hand Ace of Clubs" }));
    fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
    expect(submitAction).toHaveBeenLastCalledWith({
      kind: "PLAY_HAND_TO_BUILD",
      cardId: "player-1-hand-1",
      target: "new",
    });
    fireEvent.click(screen.getByRole("button", { name: "Hand 5 of Clubs" }));
    for (let pile = 1; pile <= count; pile++) {
      expect(
        screen.getByRole("button", { name: `Discard Hand to pile ${pile}` }),
      ).toBeTruthy();
    }
    fireEvent.click(
      screen.getByRole("button", { name: `Discard Hand to pile ${count}` }),
    );
    expect(submitAction).toHaveBeenLastCalledWith({
      kind: "DISCARD_FROM_HAND",
      cardId: "player-1-hand-5",
      pileIndex: count - 1,
    });
    for (const name of ["Bob", "Carol", "Dave"]) {
      const opponent = screen.getByRole("region", { name });
      expect(
        within(opponent).getByText("Hand: 5 concealed cards"),
      ).toBeTruthy();
      expect(within(opponent).queryByLabelText(/^Hand /)).toBeNull();
      expect(
        opponent.querySelector("[data-drag-source], [data-drop-discard]"),
      ).toBeNull();
      expect(within(opponent).getAllByRole("group")).toHaveLength(count);
    }
  },
);

it("reads Builds, own Stock, Hand, Discards, then distinct opponents with Turn and concealed Hand counts", () => {
  showGameRoom();
  const state = boardState();
  state.turn.activePlayer = "player-2";
  gameRoom.view = { ...gameRoom.view, state };
  render(<GameRoomPage />);
  const build = screen.getByRole("region", { name: "Build piles" });
  const stock = screen.getByRole("group", { name: "Your Stock" });
  const hand = screen.getByRole("group", { name: "Your Hand" });
  const discards = screen.getByRole("group", { name: "Your Discard piles" });
  const bob = screen.getByRole("region", { name: "Bob" });
  for (const [before, after] of [
    [build, stock],
    [stock, hand],
    [hand, discards],
    [discards, bob],
  ]) {
    expect(
      before!.compareDocumentPosition(after!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  }
  expect(within(bob).getByText("Turn")).toBeTruthy();
  expect(within(bob).getByText("Hand: 1 concealed card")).toBeTruthy();
  expect(within(bob).queryByRole("button")).toBeNull();
});

it("shows three compact own cards, only the opponent top, and history controls only for multi-card piles", () => {
  showGameRoom();
  const state = historyState();
  state.byId["player-2"]!.discards[1] = [
    { kind: "standard", id: "single", rank: 7, suit: "Clubs" },
  ];
  gameRoom.view = { ...gameRoom.view, state };
  render(<GameRoomPage />);
  const own = screen.getByRole("group", { name: "Alice Discard pile 1" });
  const opponent = screen.getByRole("group", { name: "Bob Discard pile 1" });
  expect(within(own).queryByLabelText(/4 of Clubs/)).toBeNull();
  expect(within(own).getByLabelText(/5 of Hearts/)).toBeTruthy();
  expect(within(own).getByLabelText(/Ace of Diamonds/)).toBeTruthy();
  expect(within(own).getByText("4 cards")).toBeTruthy();
  expect(within(opponent).queryByLabelText(/6 of Clubs/)).toBeNull();
  expect(within(opponent).getByLabelText(/2 of Diamonds/)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "View all" })).toHaveLength(2);
  for (const name of ["Alice", "Bob"]) {
    const pile = screen.getByRole("group", { name: `${name} Discard pile 2` });
    expect(within(pile).queryByText("Discard 2")).toBeNull();
    expect(within(pile).queryByRole("button", { name: "View all" })).toBeNull();
  }
});

it("drags a legal Hand card by mouse onto an existing Build pile", () => {
  showGameRoom();
  const state = boardState();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);

  const hand = screen.getByRole("button", { name: "Hand 2 of Clubs" });
  releaseOver(
    hand,
    () => screen.getByRole("button", { name: /Build pile build-1/ }),
    "mouse",
  );
  fireEvent.click(hand, { detail: 1 });

  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "two",
    target: "build-1",
  });
  expect(screen.getByLabelText("Hand 2 of Clubs")).toBeTruthy();
});

it("expands histories independently in bottom-to-top order across snapshots and closes them on leaving the room", () => {
  showGameRoom();
  const state = historyState();
  state.byId["player-1"]!.discards[1] = structuredClone(
    state.byId["player-2"]!.discards[0]!,
  );
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);
  const pile = (name: string, index = 1) =>
    screen.getByRole("group", { name: `${name} Discard pile ${index}` });
  const hand = screen.getByRole("button", { name: "Hand 2 of Clubs" });
  fireEvent.click(hand);
  for (const group of [pile("Alice"), pile("Alice", 2), pile("Bob")]) {
    fireEvent.click(within(group).getByRole("button", { name: "View all" }));
    expect(
      within(group)
        .getByRole("button", { name: "Close" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  }
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /Build pile build-1/ })
      .getAttribute("data-legal-target"),
  ).toBe("true");
  const cards = within(pile("Alice")).getAllByLabelText(
    /^(Covered )?Discard pile 1,/,
  );
  expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual([
    "Covered Discard pile 1, 4 of Clubs",
    "Covered Discard pile 1, 5 of Hearts",
    "Covered Discard pile 1, Ace of Diamonds",
    "Discard pile 1, 2 of Hearts",
  ]);
  expect(within(pile("Alice")).getByText("Top")).toBeTruthy();
  fireEvent.click(within(pile("Alice")).getByRole("button", { name: "Close" }));
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /Build pile build-1/ })
      .getAttribute("data-legal-target"),
  ).toBe("true");
  const updated = structuredClone(state);
  updated.byId["player-2"]!.discards[0]!.push({
    kind: "standard",
    id: "bob-new",
    rank: 9,
    suit: "Diamonds",
  });
  gameRoom.view = { ...gameRoom.view, state: updated, seq: 1 };
  rerender(<GameRoomPage />);
  expect(
    within(pile("Alice")).getByRole("button", { name: "View all" }),
  ).toBeTruthy();
  expect(
    within(pile("Alice", 2)).getByRole("button", { name: "Close" }),
  ).toBeTruthy();
  expect(
    within(pile("Bob")).getByRole("button", { name: "Close" }),
  ).toBeTruthy();
  expect(
    within(pile("Bob")).getByLabelText("Covered Discard pile 1, 2 of Diamonds"),
  ).toBeTruthy();
  expect(
    within(pile("Bob")).getByLabelText("Discard pile 1, 9 of Diamonds"),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Hand 2 of Clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  expect(submitAction).not.toHaveBeenCalled();
  gameRoom.roomId = "room-2";
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  gameRoom.roomId = "room-1";
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
});

it.each([0, 1])(
  "resets inspection at %i cards and stays collapsed after subsequent growth",
  (remaining) => {
    showGameRoom();
    const state = historyState();
    const before = structuredClone(state);
    gameRoom.view = { ...gameRoom.view, state };
    const { rerender } = render(<GameRoomPage />);
    const pile = () =>
      screen.getByRole("group", { name: "Alice Discard pile 1" });
    const control = within(pile()).getByRole("button", { name: "View all" });
    const historyId = control.getAttribute("aria-controls");
    expect(document.getElementById(historyId!)).toBeTruthy();
    expect(control.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(control);

    const shrunk = structuredClone(state);
    shrunk.byId["player-1"]!.discards[0] =
      shrunk.byId["player-1"]!.discards[0]!.slice(-2);
    gameRoom.view = { ...gameRoom.view, state: shrunk, seq: 1 };
    rerender(<GameRoomPage />);
    expect(
      within(pile())
        .getByRole("button", { name: "Close" })
        .getAttribute("aria-controls"),
    ).toBe(historyId);
    expect(within(pile()).getByText("Top")).toBeTruthy();

    const reset = structuredClone(shrunk);
    reset.byId["player-1"]!.discards[0] = remaining
      ? reset.byId["player-1"]!.discards[0]!.slice(-1)
      : [];
    gameRoom.view = { ...gameRoom.view, state: reset, seq: 2 };
    rerender(<GameRoomPage />);
    expect(
      within(pile()).queryByRole("button", { name: /Close|View all/ }),
    ).toBeNull();
    expect(within(pile()).queryByText("Top")).toBeNull();

    gameRoom.view = { ...gameRoom.view, state, seq: 3 };
    rerender(<GameRoomPage />);
    const grown = within(pile()).getByRole("button", { name: "View all" });
    expect(grown.getAttribute("aria-expanded")).toBe("false");
    expect(grown.getAttribute("aria-controls")).toBe(historyId);
    expect(within(pile()).queryByLabelText(/4 of Clubs/)).toBeNull();
    expect(state).toEqual(before);
  },
);

it.each(["pending", "gameover", "connecting", "other-turn"])(
  "keeps own and opponent inspection accessible while gameplay is disabled by %s",
  (reason) => {
    showGameRoom();
    const state = historyState();
    if (reason === "gameover") {
      state.phase = "gameover";
      state.winner = "player-2";
    }
    if (reason === "other-turn") state.turn.activePlayer = "player-2";
    const submitAction = vi.fn(() => true);
    gameRoom.view = {
      ...gameRoom.view,
      state,
      submitAction,
      connectionStatus: reason === "connecting" ? "connecting" : "connected",
      pendingAction:
        reason === "pending"
          ? {
              actionId: "pending",
              action: {
                kind: "PLAY_DISCARD_TO_BUILD",
                pileIndex: 0,
                target: "build-1",
              },
            }
          : null,
    };
    render(<GameRoomPage />);
    for (const name of ["Alice", "Bob"]) {
      const pile = screen.getByRole("group", {
        name: `${name} Discard pile 1`,
      });
      const open = within(pile).getByRole("button", { name: "View all" });
      fireEvent.click(open);
      const cards = within(pile).getAllByLabelText(
        /^(Covered )?Discard pile 1,/,
      );
      expect(cards).toHaveLength(name === "Alice" ? 4 : 2);
      expect(
        within(pile).queryByRole("button", { name: /Discard pile 1,/ }),
      ).toBeNull();
      for (const card of cards) {
        expect(card.hasAttribute("data-drag-source")).toBe(false);
        fireEvent.click(card);
      }
      expect(within(pile).getByText("Top")).toBeTruthy();
      expect(pile.hasAttribute("data-drop-discard")).toBe(false);
      if (name === "Alice" && reason === "pending")
        expect(within(pile).getByText("Pending")).toBeTruthy();
      fireEvent.click(within(pile).getByRole("button", { name: "Close" }));
      expect(
        within(pile).getByRole("button", { name: "View all" }),
      ).toBeTruthy();
    }
    expect(submitAction).not.toHaveBeenCalled();
  },
);

it("keeps tap selection and deselection usable with pointer-generated clicks", () => {
  showGameRoom();
  gameRoom.view = { ...gameRoom.view, state: boardState() };
  render(<GameRoomPage />);
  const hand = screen.getByRole("button", { name: "Hand Ace of Hearts" });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => hand,
  });
  fireEvent.pointerDown(hand, {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
  });
  fireEvent.pointerUp(hand, { pointerId: 1, pointerType: "mouse" });
  fireEvent.click(hand, { detail: 1 });
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  fireEvent.pointerDown(hand, {
    pointerId: 2,
    pointerType: "mouse",
    button: 0,
  });
  fireEvent.pointerUp(hand, { pointerId: 2, pointerType: "mouse" });
  fireEvent.click(hand, { detail: 1 });
  expect(hand.getAttribute("aria-pressed")).toBe("false");
});

it.each([false, true])(
  "keeps covered cards inspection-only and discards selected Hand on the pile body with expanded=%s",
  (expanded) => {
    showGameRoom();
    const submitAction = vi.fn(() => true);
    gameRoom.view = { ...gameRoom.view, state: historyState(), submitAction };
    render(<GameRoomPage />);
    const pile = screen.getByRole("group", { name: "Alice Discard pile 1" });
    if (expanded)
      fireEvent.click(within(pile).getByRole("button", { name: "View all" }));
    const hand = screen.getByRole("button", { name: "Hand 9 of Spades" });
    fireEvent.click(hand);
    fireEvent.click(
      within(pile).getByLabelText("Covered Discard pile 1, Ace of Diamonds"),
    );
    expect(submitAction).not.toHaveBeenCalled();
    expect(hand.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(pile);
    expect(submitAction).toHaveBeenCalledExactlyOnceWith({
      kind: "DISCARD_FROM_HAND",
      cardId: "nine",
      pileIndex: 0,
    });
  },
);

it("keeps a previously selected card selected when a drag returns to its source", () => {
  showGameRoom();
  gameRoom.view = { ...gameRoom.view, state: boardState() };
  render(<GameRoomPage />);
  const hand = screen.getByRole("button", { name: "Hand Ace of Hearts" });
  fireEvent.click(hand);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => hand,
  });
  fireEvent.pointerDown(hand, {
    pointerId: 1,
    pointerType: "mouse",
    button: 0,
    clientX: 20,
    clientY: 200,
  });
  fireEvent.pointerMove(hand, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 60,
    clientY: 200,
  });
  fireEvent.pointerUp(hand, {
    pointerId: 1,
    pointerType: "mouse",
    clientX: 20,
    clientY: 200,
  });
  expect(hand.getAttribute("aria-pressed")).toBe("true");
});

it.each(["body", "older", "top", "empty"])(
  "drops Hand on the expanded own Discard %s as a discard destination",
  (destination) => {
    showGameRoom();
    const submitAction = vi.fn(() => true);
    gameRoom.view = { ...gameRoom.view, state: historyState(), submitAction };
    render(<GameRoomPage />);
    const pile = screen.getByRole("group", { name: "Alice Discard pile 1" });
    fireEvent.click(within(pile).getByRole("button", { name: "View all" }));
    releaseOver(
      screen.getByRole("button", { name: "Hand 9 of Spades" }),
      () => {
        switch (destination) {
          case "body":
            return pile;
          case "older":
            return within(pile).getByLabelText(
              "Covered Discard pile 1, 4 of Clubs",
            );
          case "top":
            return within(pile).getByRole("button", {
              name: "Discard pile 1, 2 of Hearts",
            });
          default:
            return screen.getByRole("button", {
              name: "Discard pile 2, empty",
            });
        }
      },
      "touch",
    );
    expect(submitAction).toHaveBeenCalledExactlyOnceWith({
      kind: "DISCARD_FROM_HAND",
      cardId: "nine",
      pileIndex: destination === "empty" ? 1 : 0,
    });
  },
);

it("keeps covered own cards and all expanded opponent cards inspection-only while the legal own top switches sources", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: historyState(), submitAction };
  render(<GameRoomPage />);
  const own = screen.getByRole("group", { name: "Alice Discard pile 1" });
  const opponent = screen.getByRole("group", { name: "Bob Discard pile 1" });
  for (const pile of [own, opponent])
    fireEvent.click(within(pile).getByRole("button", { name: "View all" }));
  const inspectionCards = [
    within(own).getByLabelText("Covered Discard pile 1, Ace of Diamonds"),
    within(opponent).getByLabelText("Covered Discard pile 1, 6 of Clubs"),
    within(opponent).getByLabelText("Discard pile 1, 2 of Diamonds"),
  ];
  for (const card of inspectionCards) {
    fireEvent.click(card);
    releaseOver(card, () => screen.getByText("New Build pile"), "mouse");
    expect(card.hasAttribute("data-drag-source")).toBe(false);
  }
  fireEvent.click(screen.getByRole("button", { name: "Hand 9 of Spades" }));
  for (const card of inspectionCards.slice(1)) fireEvent.click(card);
  expect(
    screen
      .getByRole("button", { name: "Hand 9 of Spades" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(within(own).getByRole("button", { name: "Close" }));
  expect(
    screen
      .getByRole("button", { name: "Hand 9 of Spades" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(within(own).getByRole("button", { name: "View all" }));
  const top = within(own).getByRole("button", {
    name: "Discard pile 1, 2 of Hearts",
  });
  fireEvent.click(top);
  expect(top.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(
    within(own).getByLabelText("Covered Discard pile 1, Ace of Diamonds"),
  );
  expect(top.getAttribute("aria-pressed")).toBe("true");
  expect(submitAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_DISCARD_TO_BUILD",
    pileIndex: 0,
    target: "build-1",
  });
});

it("cancels an in-flight Discard-top drag on a new snapshot without closing its history", () => {
  showGameRoom();
  const state = historyState();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);
  const pile = screen.getByRole("group", { name: "Alice Discard pile 1" });
  fireEvent.click(within(pile).getByRole("button", { name: "View all" }));
  const top = within(pile).getByRole("button", {
    name: "Discard pile 1, 2 of Hearts",
  });
  fireEvent.pointerDown(top, { pointerId: 1, pointerType: "touch" });
  const updated = structuredClone(state);
  updated.byId["player-1"]!.discards[0]!.pop();
  gameRoom.view = { ...gameRoom.view, state: updated, seq: 1 };
  rerender(<GameRoomPage />);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => screen.getByText("New Build pile"),
  });
  fireEvent.pointerUp(
    within(pile).getByLabelText("Discard pile 1, Ace of Diamonds"),
    { pointerId: 1, pointerType: "touch" },
  );
  expect(within(pile).getByRole("button", { name: "Close" })).toBeTruthy();
  expect(
    within(pile)
      .getByRole("button", { name: "Discard pile 1, Ace of Diamonds" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  expect(submitAction).not.toHaveBeenCalled();
});

it("scrolls toward off-screen Build targets while a touch drag holds at the screen edge", () => {
  showGameRoom();
  gameRoom.view = { ...gameRoom.view, state: boardState() };
  let scrollStep: FrameRequestCallback | undefined;
  const requestFrame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((step: FrameRequestCallback) => {
      scrollStep = step;
      return 1;
    });
  const cancelFrame = vi
    .spyOn(window, "cancelAnimationFrame")
    .mockImplementation(() => {});
  const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});
  try {
    render(<GameRoomPage />);
    const hand = screen.getByRole("button", { name: "Hand Ace of Hearts" });
    fireEvent.pointerDown(hand, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 50,
      clientY: 150,
    });
    fireEvent.pointerMove(hand, {
      pointerId: 1,
      pointerType: "touch",
      clientX: 50,
      clientY: 1,
    });
    scrollStep?.(0);
    expect(scrollBy).toHaveBeenCalledWith(0, -12);
    fireEvent.pointerCancel(hand, { pointerId: 1, pointerType: "touch" });
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
  } finally {
    cleanup();
    scrollBy.mockRestore();
    requestFrame.mockRestore();
    cancelFrame.mockRestore();
  }
});

it("stops a drag if pointer capture is lost before release", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  render(<GameRoomPage />);
  const hand = screen.getByRole("button", { name: "Hand 2 of Clubs" });
  fireEvent.pointerDown(hand, { pointerId: 5, pointerType: "touch" });
  fireEvent.lostPointerCapture(hand, { pointerId: 5, pointerType: "touch" });
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => screen.getByText("build-1 → 2"),
  });
  fireEvent.pointerUp(hand, { pointerId: 5, pointerType: "touch" });
  expect(submitAction).not.toHaveBeenCalled();
  expect(hand.getAttribute("aria-pressed")).toBe("true");
});

it("selects a held touch Hand card and ends the Turn only after dropping on an own Discard pile", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "discard-two", rank: 2, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  const hand = screen.getByRole("button", { name: "Hand 9 of Spades" });
  fireEvent.pointerDown(hand, { pointerId: 2, pointerType: "touch" });
  expect(hand.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: "New Build pile" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Discard Hand to pile 1" }),
  ).toBeTruthy();
  expect(submitAction).not.toHaveBeenCalled();
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () =>
      screen.getByRole("button", { name: "Discard pile 1, 2 of Hearts" }),
  });
  fireEvent.pointerUp(hand, { pointerId: 2, pointerType: "touch" });
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "DISCARD_FROM_HAND",
    cardId: "nine",
    pileIndex: 0,
  });
  expect(screen.getByLabelText("Hand 9 of Spades")).toBeTruthy();
});

it("drags a touch Hand card to an empty own Discard pile", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  render(<GameRoomPage />);
  releaseOver(
    screen.getByRole("button", { name: "Hand 9 of Spades" }),
    () => screen.getByRole("button", { name: "Discard pile 2, empty" }),
    "touch",
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "DISCARD_FROM_HAND",
    cardId: "nine",
    pileIndex: 1,
  });
});

it("drags the Stock top by touch to a new Build pile", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "stock-ace", rank: 1, suit: "Clubs" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  releaseOver(
    screen.getByRole("button", { name: "Stock top Ace of Clubs" }),
    () => screen.getByRole("button", { name: "New Build pile" }),
    "touch",
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_STOCK_TO_BUILD",
    target: "new",
  });
});

it("drags a wild Hand card to a new Build pile by touch", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  render(<GameRoomPage />);
  releaseOver(
    screen.getByRole("button", { name: "Hand Joker" }),
    () => screen.getByRole("button", { name: "New Build pile" }),
    "touch",
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "joker",
    target: "new",
  });
});

it("drags only the own Discard top by mouse to Build", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "covered", rank: 3, suit: "Hearts" },
    { kind: "standard", id: "discard-two", rank: 2, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  releaseOver(
    screen.getByRole("button", { name: "Discard pile 1, 2 of Hearts" }),
    () => screen.getByRole("button", { name: /Build pile build-1/ }),
    "mouse",
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_DISCARD_TO_BUILD",
    pileIndex: 0,
    target: "build-1",
  });
});

it("keeps a source selected after illegal or outside releases and never discards a wild Hand card", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  render(<GameRoomPage />);
  const king = screen.getByRole("button", { name: "Hand King of Diamonds" });
  releaseOver(
    king,
    () => screen.getByRole("group", { name: "Alice Discard pile 1" }),
    "touch",
  );
  expect(king.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: /Discard pile/ })).toBeNull();
  releaseOver(king, () => document.body, "mouse");
  expect(king.getAttribute("aria-pressed")).toBe("true");
  const two = screen.getByRole("button", { name: "Hand 2 of Clubs" });
  releaseOver(
    two,
    () => screen.getByRole("button", { name: "New Build pile" }),
    "mouse",
  );
  expect(two.getAttribute("aria-pressed")).toBe("true");
  expect(submitAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "two",
    target: "build-1",
  });
});

it.each(["connecting", "synchronizing", "connected"])(
  "blocks drag during %s when not ready for another Action",
  (connectionStatus) => {
    showGameRoom();
    const state = boardState();
    if (connectionStatus === "connected") state.turn.activePlayer = "player-2";
    const submitAction = vi.fn(() => true);
    gameRoom.view = { ...gameRoom.view, state, connectionStatus, submitAction };
    render(<GameRoomPage />);
    const hand = screen.getByLabelText("Hand 2 of Clubs");
    releaseOver(hand, () => screen.getByText("New Build pile"), "touch");
    expect(submitAction).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Hand 2 of Clubs" }),
    ).toBeNull();
  },
);

it("blocks drag while an Action is pending, including after a previous pointer press", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  const { rerender } = render(<GameRoomPage />);
  const hand = screen.getByRole("button", { name: "Hand 2 of Clubs" });
  fireEvent.pointerDown(hand, { pointerId: 3, pointerType: "touch" });
  gameRoom.view = {
    ...gameRoom.view,
    pendingAction: {
      actionId: "pending",
      action: { kind: "PLAY_HAND_TO_BUILD" },
    },
  };
  rerender(<GameRoomPage />);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => screen.getByText("build-1 → 2"),
  });
  fireEvent.pointerUp(hand, { pointerId: 3, pointerType: "touch" });
  expect(submitAction).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Hand 2 of Clubs")).toBeTruthy();
});

it("does not submit a drag released after disconnect", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  const { rerender } = render(<GameRoomPage />);
  const hand = screen.getByRole("button", { name: "Hand 2 of Clubs" });
  fireEvent.pointerDown(hand, { pointerId: 4, pointerType: "touch" });
  gameRoom.view = { ...gameRoom.view, connectionStatus: "connecting" };
  rerender(<GameRoomPage />);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => screen.getByText("build-1 → 2"),
  });
  fireEvent.pointerUp(hand, { pointerId: 4, pointerType: "touch" });
  expect(submitAction).not.toHaveBeenCalled();
});

it("plays a legal Hand card to Build on server update", () => {
  showGameRoom();
  const state = boardState();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  expect(screen.queryByText("Available moves")).toBeNull();
  expect(screen.getByText("Active: Alice (Your Turn)")).toBeTruthy();
  expect(screen.getAllByText("Stock (20)")).toHaveLength(2);
  expect(screen.getAllByRole("group", { name: /Discard pile 2/ })).toHaveLength(
    2,
  );
  expect(screen.getByText("Bob")).toBeTruthy();
  expect(screen.queryByText("8 of Hearts")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
  expect(
    screen
      .getByRole("button", { name: /Build pile build-1/ })
      .getAttribute("data-legal-target"),
  ).toBe("true");
  const newBuildPile = screen.getByRole("button", { name: "New Build pile" });
  expect(newBuildPile.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "two",
    target: "build-1",
  });
  expect(screen.getByLabelText("Hand 2 of Clubs")).toBeTruthy();

  gameRoom.view = {
    ...gameRoom.view,
    pendingAction: {
      actionId: "pending",
      action: { kind: "PLAY_HAND_TO_BUILD" },
    },
  };
  rerender(<GameRoomPage />);
  expect(screen.getByRole("status").textContent).toContain("Action pending");
  expect(screen.getByLabelText("Hand 2 of Clubs")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Build pile build-1/ }),
  ).toBeNull();

  const result = applyMove(state, {
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "two",
    target: "build-1",
  });
  expect(result.accepted).toBe(true);
  gameRoom.view = {
    ...gameRoom.view,
    state: result.state,
    seq: 1,
    pendingAction: null,
  };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "Hand 2 of Clubs" })).toBeNull();
  expect(screen.getByText("build-1 → 3")).toBeTruthy();
  expect(screen.getByLabelText("Build top 2 of Clubs").textContent).toContain(
    "2",
  );
});

it("discards a non-wild Hand card and follows the next Turn", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[1] = [
    { kind: "standard", id: "old", rank: 7, suit: "Clubs" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  fireEvent.click(screen.getByRole("button", { name: "Hand 9 of Spades" }));
  expect(
    screen.getByRole("button", { name: "Discard pile 1, empty" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", {
      name: "Discard Hand to pile 2, over 7 of Clubs",
    }),
  ).toBeTruthy();
  const buildPile = screen.getByRole("button", { name: /Build pile build-1/ });
  expect(buildPile.hasAttribute("disabled")).toBe(true);
  fireEvent.click(
    screen.getByRole("button", {
      name: "Discard Hand to pile 2, over 7 of Clubs",
    }),
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "DISCARD_FROM_HAND",
    cardId: "nine",
    pileIndex: 1,
  });
  expect(screen.getByLabelText("Hand 9 of Spades")).toBeTruthy();

  const accepted = structuredClone(state);
  const hand = accepted.byId["player-1"]!.hand;
  hand.cards = hand.cards.filter((c) => c.id !== "nine");
  accepted.byId["player-1"]!.discards[1]!.push({
    kind: "standard",
    id: "nine",
    rank: 9,
    suit: "Spades",
  });
  accepted.turn.activePlayer = "player-2";
  accepted.turn.number = 2;
  gameRoom.view = { ...gameRoom.view, state: accepted, seq: 1 };
  rerender(<GameRoomPage />);
  expect(screen.getByText("Active: Bob")).toBeTruthy();
  expect(screen.queryByLabelText("Hand 9 of Spades")).toBeNull();
  expect(screen.queryByRole("button", { name: /Hand / })).toBeNull();
  expect(screen.queryByRole("button", { name: /Discard pile/ })).toBeNull();
});

it("plays a wild Hand card to a new Build pile without Discard targets", () => {
  showGameRoom();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state: boardState(), submitAction };
  render(<GameRoomPage />);

  fireEvent.click(
    screen.getByRole("button", { name: "Hand King of Diamonds" }),
  );
  expect(screen.queryByRole("button", { name: /Discard pile/ })).toBeNull();
  const newBuildPile = screen.getByRole("button", { name: "New Build pile" });
  expect(newBuildPile.hasAttribute("disabled")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_HAND_TO_BUILD",
    cardId: "king",
    target: "new",
  });
});

it("selects the legal Stock top, switches sources, and follows accepted Stock progress", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "covered-stock", rank: 7, suit: "Clubs" },
    { kind: "standard", id: "stock-two", rank: 2, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  const stock = screen.getByRole("button", { name: "Stock top 2 of Hearts" });
  fireEvent.click(stock);
  expect(stock.getAttribute("aria-pressed")).toBe("true");
  expect(
    screen
      .getByRole("button", { name: /Build pile build-1/ })
      .getAttribute("data-legal-target"),
  ).toBe("true");
  fireEvent.click(stock);
  expect(stock.getAttribute("aria-pressed")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Hand Ace of Hearts" }));
  fireEvent.click(stock);
  expect(
    screen
      .getByRole("button", { name: "Hand Ace of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_STOCK_TO_BUILD",
    target: "build-1",
  });

  const result = applyMove(state, {
    kind: "PLAY_STOCK_TO_BUILD",
    target: "build-1",
  });
  expect(result.accepted).toBe(true);
  gameRoom.view = { ...gameRoom.view, state: result.state, seq: 1 };
  rerender(<GameRoomPage />);
  expect(screen.getByText("Stock (1)")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Stock top 7 of Clubs" }),
  ).toBeNull();
  expect(screen.getByText("build-1 → 3")).toBeTruthy();
  expect(screen.getByLabelText("Build top 2 of Hearts").textContent).toContain(
    "2",
  );
});

it("plays only the top of an own Discard pile and clears selection on Build completion", () => {
  showGameRoom();
  const state = boardState();
  state.center.buildPiles[0]!.nextRank = 12;
  state.center.buildPiles[0]!.cards = Array.from(
    { length: 11 },
    (_, index) => ({
      kind: "standard",
      id: `built-${index + 1}`,
      rank: (index + 1) as Rank,
      suit: "Spades",
    }),
  );
  state.byId["player-1"]!.discards = [
    [
      { kind: "standard", id: "covered-ace", rank: 1, suit: "Hearts" },
      { kind: "standard", id: "queen", rank: 12, suit: "Spades" },
    ],
    [{ kind: "joker", id: "discard-joker" }],
  ];
  state.byId["player-2"]!.discards = [
    [{ kind: "standard", id: "opponent-ace", rank: 1, suit: "Clubs" }],
    [],
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);

  expect(
    screen.queryByRole("button", { name: "Discard pile 1, Ace of Hearts" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Discard pile 1, Ace of Clubs" }),
  ).toBeNull();
  const queen = screen.getByRole("button", {
    name: "Discard pile 1, Queen of Spades",
  });
  fireEvent.click(queen);
  expect(queen.getAttribute("aria-pressed")).toBe("true");
  const newPile = screen.getByRole("button", { name: "New Build pile" });
  expect(newPile.hasAttribute("disabled")).toBe(true);
  fireEvent.click(newPile);
  expect(submitAction).not.toHaveBeenCalled();
  expect(queen.getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: /Build pile build-1/ }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_DISCARD_TO_BUILD",
    pileIndex: 0,
    target: "build-1",
  });

  const result = applyMove(state, {
    kind: "PLAY_DISCARD_TO_BUILD",
    pileIndex: 0,
    target: "build-1",
  });
  expect(result.accepted).toBe(true);
  gameRoom.view = { ...gameRoom.view, state: result.state, seq: 1 };
  rerender(<GameRoomPage />);
  expect(screen.getByText("Recycle pile: 12 cards")).toBeTruthy();
  expect(screen.queryByText("build-1 → 12")).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "Discard pile 1, Ace of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
});

it("starts a new Build pile from a wild Discard top without rank selection", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[0] = [
    { kind: "joker", id: "discard-joker" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, Joker" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_DISCARD_TO_BUILD",
    pileIndex: 0,
    target: "new",
  });
});

it("does not select blocked Stock, covered Discard cards, or opponent cards", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "blocked", rank: 8, suit: "Spades" },
  ];
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "covered-ace", rank: 1, suit: "Hearts" },
    { kind: "standard", id: "blocked-discard", rank: 8, suit: "Clubs" },
  ];
  state.byId["player-2"]!.discards[0] = [
    { kind: "standard", id: "opponent-two", rank: 2, suit: "Diamonds" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: /Stock top/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Discard pile/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Hand 2 of Clubs" }));
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Hand 2 of Clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("offers new Build destinations to an Ace Stock top and a King Discard top", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.stock.faceDown = [
    { kind: "standard", id: "stock-ace", rank: 1, suit: "Clubs" },
  ];
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "discard-king", rank: 13, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);

  fireEvent.click(
    screen.getByRole("button", { name: "Stock top Ace of Clubs" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, King of Hearts" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Stock top Ace of Clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, King of Hearts" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Discard pile 1, King of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  fireEvent.click(
    screen.getByRole("button", { name: "Stock top Ace of Clubs" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "PLAY_STOCK_TO_BUILD",
    target: "new",
  });
});

it("switches from Hand to a playable Discard top while keeping Hand discard available", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "discard-two", rank: 2, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  render(<GameRoomPage />);

  fireEvent.click(screen.getByRole("button", { name: "Hand 9 of Spades" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Discard pile 1, 2 of Hearts" }),
  );
  expect(submitAction).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Discard pile 1, 2 of Hearts" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Hand 9 of Spades" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Discard Hand to pile 1" }),
  );
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({
    kind: "DISCARD_FROM_HAND",
    cardId: "nine",
    pileIndex: 0,
  });
});

it("offers End Turn only with empty Hand, no refill, and no legal placement", () => {
  showGameRoom();
  const state = boardState();
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();

  const rare = structuredClone(state);
  rare.byId["player-1"]!.hand.cards = [];
  rare.deck.drawPile = [];
  rare.deck.recyclePile = [];
  rare.byId["player-1"]!.stock.faceDown[
    rare.byId["player-1"]!.stock.faceDown.length - 1
  ] = { kind: "standard", id: "blocked", rank: 8, suit: "Hearts" };
  gameRoom.view = { ...gameRoom.view, state: rare, seq: 1 };
  rerender(<GameRoomPage />);
  const refill = structuredClone(rare);
  refill.deck.recyclePile = [
    { kind: "standard", id: "refill", rank: 9, suit: "Clubs" },
  ];
  gameRoom.view = { ...gameRoom.view, state: refill, seq: 2 };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();
  const playable = structuredClone(rare);
  playable.byId["player-1"]!.discards[0] = [
    { kind: "standard", id: "two-discard", rank: 2, suit: "Clubs" },
  ];
  gameRoom.view = { ...gameRoom.view, state: playable, seq: 3 };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();
  gameRoom.view = { ...gameRoom.view, state: rare, seq: 4 };
  rerender(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "End Turn" }));
  expect(submitAction).toHaveBeenCalledExactlyOnceWith({ kind: "END_TURN" });

  const advanced = structuredClone(rare);
  advanced.turn.activePlayer = "player-2";
  advanced.turn.number = 2;
  gameRoom.view = { ...gameRoom.view, state: advanced, seq: 5 };
  rerender(<GameRoomPage />);
  expect(screen.queryByRole("button", { name: "End Turn" })).toBeNull();
  expect(screen.getByText("Active: Bob")).toBeTruthy();
});

it("locks a Pending Action across broadcasts until the server refills Hand", () => {
  showGameRoom();
  const state = boardState();
  state.byId["player-1"]!.hand.cards = [
    { kind: "standard", id: "ace", rank: 1, suit: "Hearts" },
  ];
  const submitAction = vi.fn(() => true);
  gameRoom.view = { ...gameRoom.view, state, submitAction };
  const { rerender } = render(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "Hand Ace of Hearts" }));
  fireEvent.click(screen.getByRole("button", { name: "New Build pile" }));

  gameRoom.view = {
    ...gameRoom.view,
    pendingAction: {
      actionId: "pending",
      action: { kind: "PLAY_HAND_TO_BUILD" },
    },
    seq: 1,
  };
  rerender(<GameRoomPage />);
  expect(screen.getByLabelText("Hand Ace of Hearts")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Hand / })).toBeNull();
  expect(screen.queryByRole("button", { name: /Build pile/ })).toBeNull();

  const accepted = structuredClone(state);
  accepted.byId["player-1"]!.hand.cards = [
    { kind: "standard", id: "refill", rank: 6, suit: "Diamonds" },
  ];
  accepted.center.buildPiles.push({
    id: "build-2",
    cards: [{ kind: "standard", id: "ace", rank: 1, suit: "Hearts" }],
    nextRank: 2,
  });
  gameRoom.view = {
    ...gameRoom.view,
    state: accepted,
    seq: 2,
    pendingAction: null,
  };
  rerender(<GameRoomPage />);
  expect(screen.queryByLabelText("Hand Ace of Hearts")).toBeNull();
  expect(
    screen.getByRole("button", { name: "Hand 6 of Diamonds" }),
  ).toBeTruthy();
  expect(screen.getByText("build-2 → 2")).toBeTruthy();
  expect(submitAction).toHaveBeenCalledTimes(1);
});

it("starts expanded and restores a room's collapsed state only within its browser session", () => {
  showGameRoom();
  const { unmount } = render(<GameRoomPage />);
  const toggle = screen.getByRole("button", { name: /collapse chat/i });
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByPlaceholderText("Type a message...")).toBeTruthy();
  fireEvent.click(toggle);
  expect(
    screen
      .getByRole("button", { name: /expand chat/i })
      .getAttribute("aria-expanded"),
  ).toBe("false");
  expect(screen.queryByRole("textbox")).toBeNull();

  unmount();
  const { rerender } = render(<GameRoomPage />);
  expect(screen.getByRole("button", { name: /expand chat/i })).toBeTruthy();

  gameRoom.roomId = "room-2";
  rerender(<GameRoomPage />);
  expect(screen.getByRole("button", { name: /collapse chat/i })).toBeTruthy();
  gameRoom.roomId = "room-1";
  rerender(<GameRoomPage />);
  expect(screen.getByRole("button", { name: /expand chat/i })).toBeTruthy();
});

it("keeps a chat draft when the player collapses and reopens the panel", () => {
  showGameRoom();
  render(<GameRoomPage />);
  const draft = screen.getByPlaceholderText(
    "Type a message...",
  ) as HTMLInputElement;
  fireEvent.change(draft, { target: { value: "Keep this draft" } });
  fireEvent.click(screen.getByRole("button", { name: /collapse chat/i }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /expand chat/i }));
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe(
    "Keep this draft",
  );
});

it("counts mobile live arrivals without counting history and keeps its draft/messages offline", () => {
  vi.mocked(window.matchMedia).mockReturnValue({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList);
  showGameRoom(4);
  const sendChat = vi.fn(() => true);
  gameRoom.view = {
    ...gameRoom.view,
    sendChat,
    chatMessages: [
      {
        id: "old",
        playerId: "player-2",
        playerName: "Bob",
        text: "From the Lobby",
        timestamp: 1,
      },
    ],
  };
  const { rerender } = render(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: "Open chat" }).textContent,
  ).not.toContain("unread");
  gameRoom.view = { ...gameRoom.view, liveChatCount: 6 };
  rerender(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: /Open chat.*2 unread/ }));
  expect(screen.getByText("From the Lobby")).toBeTruthy();
  const draft = screen.getByRole("textbox", {
    name: "Chat message",
  }) as HTMLInputElement;
  fireEvent.change(draft, { target: { value: "See you next Turn" } });
  gameRoom.view = {
    ...gameRoom.view,
    connectionStatus: "connecting",
    liveChatCount: 7,
  };
  rerender(<GameRoomPage />);
  fireEvent.keyDown(draft, { key: "Enter" });
  expect(sendChat).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.getByText("From the Lobby")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
  expect(
    screen.getByRole("button", { name: "Open chat" }).textContent,
  ).not.toContain("unread");
  fireEvent.click(screen.getByRole("button", { name: "Open chat" }));
  expect(draft.value).toBe("See you next Turn");
  gameRoom.view = { ...gameRoom.view, connectionStatus: "connected" };
  rerender(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(sendChat).toHaveBeenCalledExactlyOnceWith("See you next Turn");
});

it.each(["pending", "gameover"])(
  "keeps connected chat usable during %s gameplay",
  (phase) => {
    showGameRoom();
    const state = boardState();
    if (phase === "gameover") {
      state.phase = "gameover";
      state.winner = "player-2";
    }
    const sendChat = vi.fn(() => true);
    const submitAction = vi.fn();
    gameRoom.view = {
      ...gameRoom.view,
      state,
      sendChat,
      submitAction,
      pendingAction:
        phase === "pending"
          ? { actionId: "pending", action: { kind: "PLAY_HAND_TO_BUILD" } }
          : null,
    };
    render(<GameRoomPage />);
    fireEvent.change(screen.getByRole("textbox", { name: "Chat message" }), {
      target: { value: "Still here" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(sendChat).toHaveBeenCalledExactlyOnceWith("Still here");
    expect(submitAction).not.toHaveBeenCalled();
  },
);

it("keeps chat available when session storage cannot be read", () => {
  showGameRoom();
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage disabled");
  });
  try {
    render(<GameRoomPage />);
    expect(screen.getByRole("button", { name: /collapse chat/i })).toBeTruthy();
  } finally {
    read.mockRestore();
  }
});

it("counts only live arrivals while collapsed and clears unread when expanded", () => {
  showGameRoom(3); // Recovered before the page became visible.
  const { rerender } = render(<GameRoomPage />);
  fireEvent.click(screen.getByRole("button", { name: /collapse chat/i }));
  gameRoom.view = {
    ...gameRoom.view,
    chatMessages: [
      {
        id: "history",
        playerId: "player-2",
        playerName: "Bob",
        text: "Old",
        timestamp: 1,
      },
    ],
  };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /expand chat/i }).textContent,
  ).not.toContain("unread");

  gameRoom.view = { ...gameRoom.view, liveChatCount: 5 };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /expand chat/i }).textContent,
  ).toContain("2 unread");
  gameRoom.view = {
    ...gameRoom.view,
    chatMessages: [
      {
        id: "recovered",
        playerId: "player-2",
        playerName: "Bob",
        text: "Recovered",
        timestamp: 2,
      },
    ],
  };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /expand chat/i }).textContent,
  ).toContain("2 unread");
  fireEvent.click(screen.getByRole("button", { name: /expand chat/i }));
  expect(
    screen.getByRole("button", { name: /collapse chat/i }).textContent,
  ).not.toContain("unread");
  gameRoom.view = { ...gameRoom.view, liveChatCount: 6 };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: /collapse chat/i }).textContent,
  ).not.toContain("unread");
});

it("keeps the game-page chat draft through disconnect and reconnect until the player sends it", () => {
  const sendChat = vi.fn(() => true);
  gameRoom.view = {
    state: createStartedGame({ players: ["player-1", "player-2"], seed: 1 }),
    seq: 0,
    currentPlayerId: "player-1",
    connectionStatus: "connected",
    problem: null,
    pendingAction: null,
    lastActionResult: null,
    submitAction: vi.fn(),
    chatMessages: [],
    sendChat,
  };
  const { rerender } = render(<GameRoomPage />);
  const draft = screen.getByPlaceholderText(
    "Type a message...",
  ) as HTMLInputElement;
  fireEvent.change(draft, { target: { value: "After reconnect" } });

  gameRoom.view = { ...gameRoom.view, connectionStatus: "connecting" };
  rerender(<GameRoomPage />);
  expect(
    screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(draft.value).toBe("After reconnect");
  expect(sendChat).not.toHaveBeenCalled();

  gameRoom.view = { ...gameRoom.view, connectionStatus: "connected" };
  rerender(<GameRoomPage />);
  expect(draft.value).toBe("After reconnect");
  expect(sendChat).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(sendChat).toHaveBeenCalledExactlyOnceWith("After reconnect");
  expect(draft.value).toBe("");
});

it("shows recovered Lobby and live chat on the Game room page", () => {
  gameRoom.view = {
    state: createStartedGame({ players: ["player-1", "player-2"], seed: 1 }),
    seq: 0,
    currentPlayerId: "player-1",
    connectionStatus: "connected",
    problem: null,
    pendingAction: null,
    lastActionResult: null,
    submitAction: vi.fn(),
    sendChat: vi.fn(),
    chatMessages: [
      {
        id: "old",
        playerId: "player-2",
        playerName: "Bob",
        text: "Before play",
        timestamp: 1,
      },
      {
        id: "new",
        playerId: "player-1",
        playerName: "Alice",
        text: "During play",
        timestamp: 2,
      },
    ],
  };
  render(<GameRoomPage />);
  expect(screen.getByText("Before play")).toBeTruthy();
  expect(screen.getByText("During play")).toBeTruthy();
  expect(screen.getByText("Alice (you):")).toBeTruthy();
});
