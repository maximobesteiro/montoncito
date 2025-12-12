"use client";

import { Modal } from "./Modal";

interface HowToPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}

export function HowToPlayModal({
  isOpen,
  onClose,
  title = "How to Play",
}: HowToPlayModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onCancel={onClose}
      cancelText="Close"
      dismissible
    >
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <div className="space-y-5">
          <section>
            <h3 className="text-lg font-black uppercase tracking-wide">
              Objective
            </h3>
            <p className="mt-2 text-text-primary">
              Be the first player to empty your{" "}
              <span className="font-bold">stock pile</span>.
            </p>
          </section>

          <section className="brutal-border bg-surface p-4">
            <h3 className="text-lg font-black uppercase tracking-wide">
              What you have
            </h3>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-text-primary">
              <li>
                <span className="font-bold">Stock pile</span>: face-down pile,
                top card is visible.
              </li>
              <li>
                <span className="font-bold">Hand</span>: usually 5 cards.
              </li>
              <li>
                <span className="font-bold">Discard piles</span>: up to 4
                face-up piles (only the top card of each is playable).
              </li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-black uppercase tracking-wide">
              Shared table
            </h3>
            <ul className="mt-2 list-disc pl-5 space-y-1 text-text-primary">
              <li>
                Up to <span className="font-bold">4 build piles</span> in the
                center.
              </li>
              <li>
                Build piles go <span className="font-bold">1 → 12</span> in
                order.
              </li>
              <li>
                When a pile reaches <span className="font-bold">12</span>, it
                clears and can restart at 1.
              </li>
            </ul>
          </section>

          <section className="brutal-border bg-surface p-4">
            <h3 className="text-lg font-black uppercase tracking-wide">
              Your turn (quickstart)
            </h3>
            <ol className="mt-2 list-decimal pl-5 space-y-2 text-text-primary">
              <li>
                <span className="font-bold">Play phase</span>: you may play as
                many valid cards as you want from{" "}
                <span className="font-bold">hand</span>,{" "}
                <span className="font-bold">stock top</span>, or{" "}
                <span className="font-bold">discard tops</span> onto a build
                pile.
              </li>
              <li>
                <span className="font-bold">End your turn</span>: when you’re
                done playing, discard <span className="font-bold">1</span> card
                from your hand onto one of your discard piles.
              </li>
              <li>
                <span className="font-bold">Next player</span>: draws back up to{" "}
                <span className="font-bold">5</span> cards to start their turn.
              </li>
            </ol>
          </section>

          <section className="brutal-border bg-warning-bg p-4">
            <h3 className="text-lg font-black uppercase tracking-wide">
              Wild cards
            </h3>
            <p className="mt-2 text-text-primary">
              Joker (<span className="font-bold">13</span>) is wild and can act
              as any needed value in a build pile sequence.
            </p>
          </section>

          <section>
            <h3 className="text-lg font-black uppercase tracking-wide">Win</h3>
            <p className="mt-2 text-text-primary">
              You win immediately when your{" "}
              <span className="font-bold">stock pile</span> is empty.
            </p>
          </section>
        </div>
      </div>
    </Modal>
  );
}
