// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RoomChat } from "./RoomChat";

afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("Game room chat panel", () => {
  it("keeps a draft while disconnected and sends it only when the player clicks after reconnecting", () => {
    const onSendMessage = vi.fn(() => true);
    const { rerender } = render(
      <RoomChat
        messages={[]}
        currentPlayerId="p1"
        onSendMessage={onSendMessage}
        canSend
      />,
    );
    const draft = screen.getByPlaceholderText("Type a message...");
    fireEvent.change(draft, { target: { value: "Saved for later" } });
    rerender(
      <RoomChat
        messages={[]}
        currentPlayerId="p1"
        onSendMessage={onSendMessage}
        canSend={false}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
    ).toBe(true);
    expect((draft as HTMLInputElement).value).toBe("Saved for later");
    fireEvent.keyDown(draft, { key: "Enter" });
    expect(onSendMessage).not.toHaveBeenCalled();

    rerender(
      <RoomChat
        messages={[]}
        currentPlayerId="p1"
        onSendMessage={onSendMessage}
        canSend
      />,
    );
    expect(onSendMessage).not.toHaveBeenCalled();
    expect((draft as HTMLInputElement).value).toBe("Saved for later");
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(onSendMessage).toHaveBeenCalledExactlyOnceWith("Saved for later");
    expect((draft as HTMLInputElement).value).toBe("");
  });

  it("retains the draft when sending loses the connection", () => {
    const onSendMessage = vi.fn(() => false);
    render(
      <RoomChat
        messages={[]}
        currentPlayerId="p1"
        onSendMessage={onSendMessage}
        canSend
      />,
    );
    const draft = screen.getByPlaceholderText(
      "Type a message...",
    ) as HTMLInputElement;
    fireEvent.change(draft, { target: { value: "Try again" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(draft.value).toBe("Try again");
  });
});
