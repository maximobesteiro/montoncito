"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./prototype.module.css";

type Card = { rank: string; suit?: string; value: number };
type Source = { area: "hand" | "stock" | "discard"; index: number; card: Card };
type Player = {
  name: string;
  stock: Card;
  remaining: number;
  handCount: number;
  discards: Card[][];
};

const card = (rank: string, suit: string, value: number): Card => ({
  rank,
  suit,
  value,
});
const me: Player = {
  name: "You",
  stock: card("5", "♠", 5),
  remaining: 8,
  handCount: 5,
  discards: [
    [card("10", "♣", 10), card("6", "♥", 6), card("2", "♠", 2)],
    [card("12", "♦", 12), card("3", "♣", 3), card("5", "♥", 5)],
    [card("4", "♥", 4), card("11", "♠", 11), card("9", "♦", 9)],
  ],
};
const hand = [
  card("A", "♦", 1),
  card("8", "♣", 8),
  card("K", "♥", 13),
  card("11", "♦", 11),
  { rank: "Joker", value: 0 },
];
const opponents: Player[] = [
  {
    name: "Mara",
    stock: card("7", "♦", 7),
    remaining: 4,
    handCount: 3,
    discards: [
      [card("3", "♥", 3), card("6", "♣", 6)],
      [card("9", "♠", 9), card("2", "♦", 2)],
      [card("10", "♥", 10)],
    ],
  },
  {
    name: "Leo",
    stock: card("A", "♣", 1),
    remaining: 13,
    handCount: 5,
    discards: [
      [card("8", "♦", 8), card("4", "♠", 4)],
      [card("11", "♣", 11), card("7", "♥", 7)],
      [card("5", "♦", 5), card("12", "♠", 12)],
    ],
  },
];
const builds = [
  card("A", "♠", 1),
  card("4", "♦", 4),
  card("7", "♣", 7),
  card("10", "♥", 10),
];
const variants = ["3", "2", "4"] as const;
type Variant = (typeof variants)[number];
const names: Record<Variant, string> = {
  "3": "Shared table + tray",
  "2": "Stock as axis",
  "4": "Player comparison",
};
const label = (c: Card) => `${c.rank}${c.suit ?? ""}`;
const wild = (c: Card) => c.value === 0 || c.value === 13;

function CardFace({
  c,
  onClick,
  selected = false,
  small = false,
  back = false,
  ariaLabel,
}: {
  c?: Card;
  onClick?: () => void;
  selected?: boolean;
  small?: boolean;
  back?: boolean;
  ariaLabel?: string;
}) {
  const className = `${styles.card} ${small ? styles.smallCard : ""} ${back ? styles.back : ""} ${c?.suit === "♥" || c?.suit === "♦" ? styles.red : ""} ${selected ? styles.selected : ""}`;
  const content = back ? (
    <span aria-hidden="true">✳</span>
  ) : (
    <>
      <strong>{c?.rank}</strong>
      <span aria-hidden="true">{c?.suit ?? "★"}</span>
    </>
  );
  return onClick ? (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={onClick}
      className={className}
    >
      {content}
    </button>
  ) : (
    <div aria-label={ariaLabel} className={className}>
      {content}
    </div>
  );
}

function Stock({
  player,
  own,
  selected,
  onSelect,
}: {
  player: Player;
  own?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <section
      className={`${styles.stock} ${own ? styles.ownStock : ""}`}
      aria-label={`${player.name} Stock pile`}
    >
      <div className={styles.sectionHeading}>
        <h2>{own ? "Your Stock pile" : `${player.name}'s Stock pile`}</h2>
        <span>{player.remaining} left</span>
      </div>
      <div className={styles.stockVisual}>
        <div className={styles.stockBack} aria-hidden="true" />
        <CardFace
          c={player.stock}
          selected={selected}
          onClick={onSelect}
          ariaLabel={`${player.name} Stock pile top ${label(player.stock)}, ${player.remaining} cards left`}
        />
      </div>
      {own && <p className={styles.hint}>Empty this pile to win</p>}
    </section>
  );
}

function Discards({
  player,
  owner,
  selected,
  onSelect,
  onTarget,
  expanded,
  toggle,
  compact = false,
}: {
  player: Player;
  owner: string;
  selected?: Source | null;
  onSelect?: (source: Source) => void;
  onTarget?: (target: string) => void;
  expanded: Record<string, boolean>;
  toggle: (key: string) => void;
  compact?: boolean;
}) {
  return (
    <section
      className={styles.discards}
      aria-label={`${player.name} Discard piles`}
    >
      <h2>
        {owner === "you"
          ? "Your Discard piles"
          : `${player.name}'s Discard piles`}
      </h2>
      <div className={styles.discardGrid}>
        {player.discards.map((pile, index) => {
          const key = `${owner}-${index}`;
          const open = !!expanded[key];
          const visible = open ? pile : pile.slice(-(compact ? 1 : 3));
          return (
            <div key={key} className={styles.discardPile}>
              <div className={styles.pileTitle}>
                <span>Pile {index + 1}</span>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-label={`${open ? "Close" : "Open"} ${player.name} Discard pile ${index + 1} sequence`}
                  onClick={() => toggle(key)}
                >
                  {open ? "Close" : `View all ${pile.length}`}
                </button>
              </div>
              <div
                className={`${styles.sequence} ${open ? styles.openSequence : ""}`}
                aria-label={`Bottom to top, ${pile.length} cards`}
              >
                {visible.map((c, position) => {
                  const top =
                    (open
                      ? position
                      : position + pile.length - visible.length) ===
                    pile.length - 1;
                  return (
                    <CardFace
                      key={position}
                      c={c}
                      small
                      ariaLabel={`${label(c)}${top ? ", top card" : ", below top"}`}
                      selected={
                        top &&
                        owner === "you" &&
                        selected?.area === "discard" &&
                        selected.index === index
                      }
                      onClick={
                        top && onSelect
                          ? () => onSelect({ area: "discard", index, card: c })
                          : undefined
                      }
                    />
                  );
                })}
              </div>
              {owner === "you" &&
                selected?.area === "hand" &&
                !wild(selected.card) && (
                  <button
                    type="button"
                    className={styles.discardDrop}
                    onClick={() =>
                      onTarget?.(`Discard pile ${index + 1} (ends turn)`)
                    }
                  >
                    Discard here · end turn
                  </button>
                )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Hand({
  selected,
  onSelect,
}: {
  selected: Source | null;
  onSelect: (source: Source) => void;
}) {
  return (
    <section className={styles.hand} aria-label="Your Hand">
      <div className={styles.sectionHeading}>
        <h2>Your Hand</h2>
        <span>5 cards</span>
      </div>
      <div className={styles.handCards}>
        {hand.map((c, index) => (
          <CardFace
            key={index}
            c={c}
            selected={selected?.area === "hand" && selected.index === index}
            ariaLabel={`Hand ${label(c)}${wild(c) ? ", wild" : ""}`}
            onClick={() => onSelect({ area: "hand", index, card: c })}
          />
        ))}
      </div>
    </section>
  );
}

function Builds({
  selected,
  onTarget,
}: {
  selected: Source | null;
  onTarget: (target: string) => void;
}) {
  return (
    <section className={styles.builds} aria-label="Shared Build piles">
      <div className={styles.sectionHeading}>
        <h2>Build piles</h2>
        <span>Shared table</span>
      </div>
      <div className={styles.buildGrid}>
        {builds.map((c, index) => {
          const possible =
            !!selected &&
            (wild(selected.card) || selected.card.value === c.value + 1);
          return (
            <div key={index} className={styles.buildSlot}>
              <span>Pile {index + 1}</span>
              <button
                type="button"
                disabled={!possible}
                className={`${styles.destination} ${possible ? styles.possible : ""}`}
                aria-label={`Build pile ${index + 1}, top ${label(c)}${possible ? ", possible destination" : ""}`}
                onClick={() => onTarget(`Build pile ${index + 1}`)}
              >
                <CardFace c={c} />
              </button>
            </div>
          );
        })}
        <div className={styles.buildSlot}>
          <span>New pile</span>
          <button
            type="button"
            disabled={
              !selected || !(selected.card.value === 1 || wild(selected.card))
            }
            className={`${styles.destination} ${selected && (selected.card.value === 1 || wild(selected.card)) ? styles.possible : ""}`}
            aria-label="Start a new Build pile"
            onClick={() => onTarget("new Build pile")}
          >
            <span className={styles.emptyCard}>+</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function Opponent({
  player,
  index,
  expanded,
  toggle,
  compact,
}: {
  player: Player;
  index: number;
  expanded: Record<string, boolean>;
  toggle: (key: string) => void;
  compact?: boolean;
}) {
  return (
    <article
      className={`${styles.opponent} ${compact ? styles.compactOpponent : ""}`}
    >
      <div className={styles.opponentHeader}>
        <h2>{player.name}</h2>
        <span>{player.handCount} cards in Hand, hidden</span>
      </div>
      <div className={styles.opponentContent}>
        <Stock player={player} />
        <Discards
          player={player}
          owner={`opponent-${index}`}
          expanded={expanded}
          toggle={toggle}
          compact={compact}
        />
      </div>
    </article>
  );
}

function Opponents({
  expanded,
  toggle,
  compact = false,
}: {
  expanded: Record<string, boolean>;
  toggle: (key: string) => void;
  compact?: boolean;
}) {
  return (
    <section
      className={`${styles.opponents} ${compact ? styles.compactOpponents : ""}`}
      aria-label="Opponents"
    >
      <h2 className={styles.groupTitle}>Opponents</h2>
      {opponents.map((player, index) => (
        <Opponent
          key={player.name}
          player={player}
          index={index}
          expanded={expanded}
          toggle={toggle}
          compact={compact}
        />
      ))}
    </section>
  );
}

function Chat({
  open,
  setOpen,
  variant,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  variant: Variant;
}) {
  return (
    <div
      className={`${styles.chat} ${open ? styles.chatOpen : ""} ${variant === "4" ? styles.chatBelow : ""}`}
    >
      <button
        type="button"
        className={styles.chatToggle}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close chat" : "Open chat · 2 messages"}
      </button>
      <div className={styles.chatBody}>
        <h2>Room chat</h2>
        <p>
          <strong>Mara</strong> Nice opening.
        </p>
        <p>
          <strong>Leo</strong> Your turn!
        </p>
        <p className={styles.hint}>Mock conversation. No messages are sent.</p>
      </div>
    </div>
  );
}

function Variant3({
  selected,
  select,
  target,
  expanded,
  toggle,
  chatOpen,
  setChatOpen,
}: BoardProps) {
  return (
    <div className={styles.variant3}>
      <div className={styles.v3Opponents}>
        <Opponents compact expanded={expanded} toggle={toggle} />
      </div>
      <div className={styles.v3Table}>
        <Builds selected={selected} onTarget={target} />
      </div>
      <div className={styles.v3Chat}>
        <Chat variant="3" open={chatOpen} setOpen={setChatOpen} />
      </div>
      <div className={styles.v3Tray}>
        <Stock
          player={me}
          own
          selected={selected?.area === "stock"}
          onSelect={() => select({ area: "stock", index: 0, card: me.stock })}
        />
        <Discards
          player={me}
          owner="you"
          selected={selected}
          onSelect={select}
          onTarget={target}
          expanded={expanded}
          toggle={toggle}
        />
        <Hand selected={selected} onSelect={select} />
      </div>
    </div>
  );
}

function Variant2({
  selected,
  select,
  target,
  expanded,
  toggle,
  chatOpen,
  setChatOpen,
}: BoardProps) {
  return (
    <div className={styles.variant2}>
      <div className={styles.v2Opponents}>
        <Opponents compact expanded={expanded} toggle={toggle} />
      </div>
      <div className={styles.v2Hand}>
        <Hand selected={selected} onSelect={select} />
      </div>
      <div className={styles.v2Stock}>
        <Stock
          player={me}
          own
          selected={selected?.area === "stock"}
          onSelect={() => select({ area: "stock", index: 0, card: me.stock })}
        />
      </div>
      <div className={styles.v2Builds}>
        <Builds selected={selected} onTarget={target} />
      </div>
      <div className={styles.v2Discards}>
        <Discards
          player={me}
          owner="you"
          selected={selected}
          onSelect={select}
          onTarget={target}
          expanded={expanded}
          toggle={toggle}
        />
      </div>
      <div className={styles.v2Chat}>
        <Chat variant="2" open={chatOpen} setOpen={setChatOpen} />
      </div>
    </div>
  );
}

function Variant4({
  selected,
  select,
  target,
  expanded,
  toggle,
  chatOpen,
  setChatOpen,
}: BoardProps) {
  return (
    <div className={styles.variant4}>
      <div className={styles.v4Table}>
        <div className={styles.v4Builds}>
          <Builds selected={selected} onTarget={target} />
        </div>
        <div className={styles.v4Player}>
          <Stock
            player={me}
            own
            selected={selected?.area === "stock"}
            onSelect={() => select({ area: "stock", index: 0, card: me.stock })}
          />
          <Hand selected={selected} onSelect={select} />
        </div>
        <div className={styles.v4Discards}>
          <Discards
            player={me}
            owner="you"
            selected={selected}
            onSelect={select}
            onTarget={target}
            expanded={expanded}
            toggle={toggle}
          />
        </div>
      </div>
      <div className={styles.v4Compare}>
        <Chat variant="4" open={chatOpen} setOpen={setChatOpen} />
        <Opponents expanded={expanded} toggle={toggle} />
      </div>
    </div>
  );
}

type BoardProps = {
  selected: Source | null;
  select: (source: Source) => void;
  target: (target: string) => void;
  expanded: Record<string, boolean>;
  toggle: (key: string) => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
};

export function GamePrototype() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = params.get("variant");
  const variant: Variant = variants.find((v) => v === requested) ?? "3";
  const [selected, setSelected] = useState<Source | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [feedback, setFeedback] = useState(
    "Select a card to see its destinations.",
  );

  const switchVariant = useCallback(
    (step: number) => {
      const next =
        variants[
          (variants.indexOf(variant) + step + variants.length) % variants.length
        ] ?? "3";
      const query = new URLSearchParams(params.toString());
      query.set("variant", next);
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    },
    [variant, params, pathname, router],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const element = event.target as HTMLElement | null;
      if (element?.closest("input, textarea, select, [contenteditable='true']"))
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        switchVariant(event.key === "ArrowLeft" ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchVariant]);

  const select = (source: Source) => {
    if (selected?.area === source.area && selected.index === source.index) {
      setSelected(null);
      setFeedback("Selection cleared. Select a card to see its destinations.");
    } else {
      setSelected(source);
      setFeedback(
        `${label(source.card)} selected from ${source.area === "discard" ? `Discard pile ${source.index + 1}` : source.area === "stock" ? "Stock pile" : "Hand"}. Highlighted targets are available.`,
      );
    }
  };
  const target = (destination: string) => {
    if (!selected) return;
    setFeedback(
      `${label(selected.card)} → ${destination}. Preview only; cards stay in place.`,
    );
    setSelected(null);
  };
  const props: BoardProps = {
    selected,
    select,
    target,
    expanded,
    toggle: (key) => setExpanded((old) => ({ ...old, [key]: !old[key] })),
    chatOpen,
    setChatOpen,
  };

  return (
    <div className={styles.prototype}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>
            Throwaway Game room prototype · fictional match
          </p>
          <h1>
            Game room <span>Variant {variant}</span>
          </h1>
          <p>{names[variant]} · Your turn, play phase</p>
        </div>
        <p className={styles.turn}>
          You are up <span>Stock: 8 left</span>
        </p>
      </header>
      <p
        className={variant === "4" ? styles.feedbackHidden : styles.feedback}
        role="status"
        aria-live="polite"
      >
        {feedback}
      </p>
      {variant === "3" ? (
        <Variant3 {...props} />
      ) : variant === "2" ? (
        <Variant2 {...props} />
      ) : (
        <Variant4 {...props} />
      )}
      {/* NODE_ENV is supplied by Next.js; the switcher is for development comparison only. */}
      {/* eslint-disable-next-line turbo/no-undeclared-env-vars */}
      {process.env.NODE_ENV !== "production" && (
        <nav className={styles.switcher} aria-label="Prototype variants">
          <button
            type="button"
            onClick={() => switchVariant(-1)}
            aria-label="Previous variant"
          >
            ←
          </button>
          <span>
            Variant {variant} · {names[variant]}
          </span>
          <button
            type="button"
            onClick={() => switchVariant(1)}
            aria-label="Next variant"
          >
            →
          </button>
        </nav>
      )}
    </div>
  );
}
