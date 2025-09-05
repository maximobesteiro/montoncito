import { describe, it, expect } from "vitest";
import { hello } from "./index";

describe("hello()", () => {
  it("returns the expected string", () => {
    expect(hello()).toBe("core-game ready");
  });
});
