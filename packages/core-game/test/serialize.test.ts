import { describe, expect, it } from "vitest";
import { createStartedGame, deserialize, serialize } from "../src";

describe("version-2 snapshots", () => {
  const state = createStartedGame({ players: ["P1", "P2"], seed: 42 });

  it("writes state and envelope version 2 and round trips unchanged", () => {
    const encoded = serialize(state);
    expect(JSON.parse(encoded)).toMatchObject({
      v: 2,
      payload: { version: 2, rulesetVersion: 1 },
    });
    expect(deserialize(encoded)).toEqual(state);
  });

  it.each([1, 3, null, undefined])("rejects snapshot envelope version %s", (v) => {
    expect(() => deserialize(JSON.stringify({ v, payload: state }))).toThrow(
      "Unsupported snapshot version",
    );
  });

  it.each([1, 3, null, undefined])("rejects embedded state version %s", (version) => {
    expect(() => deserialize(JSON.stringify({ v: 2, payload: { ...state, version } }))).toThrow(
      "Unsupported game-state version",
    );
  });

  it("rejects missing payloads and unsupported rulesets", () => {
    expect(() => deserialize('{"v":2}')).toThrow("Unsupported game-state version");
    expect(() => deserialize(JSON.stringify({ v: 2, payload: { ...state, rulesetVersion: 2 } }))).toThrow(
      "Unsupported ruleset version",
    );
  });

  it("refuses to write unsupported embedded versions", () => {
    const old = JSON.parse(JSON.stringify(state));
    old.version = 1;
    expect(() => serialize(old)).toThrow("Unsupported game-state version");
    old.version = 2;
    old.rulesetVersion = 2;
    expect(() => serialize(old)).toThrow("Unsupported ruleset version");
  });
});
