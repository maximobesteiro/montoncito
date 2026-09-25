import { describe, expect, it } from "vitest";
import { createStartedGame } from "@mont/core-game";
import {
  createGameRoomSession,
  failGameRoomSession,
  markGameRoomConnected,
  receiveGameRoomSnapshot,
} from "../src/session.js";

const snapshot = {
  version: 1,
  seq: 0,
  state: createStartedGame({ players: ["P1", "P2"], seed: 1, id: "game-1" }),
};

describe("Game room session transitions", () => {
  it("moves from connecting to synchronized on a valid full snapshot", () => {
    const session = markGameRoomConnected(createGameRoomSession());

    expect(receiveGameRoomSnapshot(session, snapshot)).toEqual({
      status: "synchronized",
      seq: 0,
      state: snapshot.state,
    });
  });

  it("retains a terminal protocol problem", () => {
    expect(
      failGameRoomSession(createGameRoomSession(), {
        version: 1,
        code: "UNSUPPORTED_VERSION",
        message: "Unsupported protocol version",
      }),
    ).toMatchObject({ status: "failed", problem: { code: "UNSUPPORTED_VERSION" } });
  });

  it("fails closed for malformed synchronization snapshots", () => {
    const session = markGameRoomConnected(createGameRoomSession());

    expect(receiveGameRoomSnapshot(session, { version: 2, seq: -1 })).toMatchObject({
      status: "failed",
      problem: { code: "MALFORMED_MESSAGE" },
    });
  });
});
