"use client";

import { Component, createRef, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  targeting: boolean;
  pending: boolean;
  destinations: string;
}

interface Viewport {
  host: Element;
  top: number;
  left: number;
  anchors: { element: Element; top: number }[];
}

export function getBoardScrollHost(board: Element | null): Element {
  for (
    let node = board?.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return document.scrollingElement ?? document.documentElement;
}

// React's snapshot lifecycle reads the OLD layout before any DOM mutations.
// A layout-effect cleanup is too late for server results and source switches.
export class InspectionViewport extends Component<
  Props,
  Record<string, never>,
  Viewport | null
> {
  private root = createRef<HTMLDivElement>();
  private reading: Viewport | null = null;
  private navigated = false;
  private baseline: Viewport | null = null;

  private capture(): Viewport | null {
    const root = this.root.current;
    if (!root) return null;
    const host = getBoardScrollHost(root);
    // No viewport geometry means there is no reading position to restore.
    if (!host.clientHeight) return null;
    const edge =
      host === document.scrollingElement ? 0 : host.getBoundingClientRect().top;
    const bottom =
      edge +
      (host === document.scrollingElement
        ? window.innerHeight
        : host.clientHeight);
    const anchors = Array.from(root.querySelectorAll("[aria-label]"))
      .filter((element) => !element.closest(".game-room-chat"))
      .map((element) => ({ element, top: element.getBoundingClientRect().top }))
      .filter(
        ({ element, top }) =>
          top >= edge &&
          top < bottom &&
          element.getBoundingClientRect().height > 0,
      )
      .sort((a, b) => a.top - b.top);
    return { host, top: host.scrollTop, left: host.scrollLeft, anchors };
  }

  private observeScroll = () => {
    const baseline = this.baseline;
    if (!baseline) return;
    if (
      baseline.host.scrollTop !== baseline.top ||
      baseline.host.scrollLeft !== baseline.left
    ) {
      // Native wheel/touch/keyboard scrolling and dnd-kit edge scrolling all
      // change this baseline. Collapse clamping is read synchronously at commit.
      this.navigated = true;
      this.baseline = this.capture();
    }
  };

  componentDidMount() {
    this.baseline = this.capture();
    document.addEventListener("scroll", this.observeScroll, true);
  }

  componentWillUnmount() {
    document.removeEventListener("scroll", this.observeScroll, true);
  }

  getSnapshotBeforeUpdate(previous: Props): Viewport | null {
    this.observeScroll();
    const viewport = this.capture();
    if (
      !previous.destinations &&
      this.props.destinations &&
      this.props.targeting &&
      !previous.pending
    ) {
      this.reading = viewport;
      this.navigated = false;
    }
    // Submitted Actions can never recover the pre-selection reading position.
    if (this.props.pending) this.reading = null;
    return viewport;
  }

  componentDidUpdate(
    previous: Props,
    _state: Record<string, never>,
    viewport: Viewport | null,
  ) {
    const changed = previous.destinations !== this.props.destinations;
    const cancelled =
      previous.targeting && !this.props.targeting && !this.props.pending;
    if (
      viewport &&
      (changed || previous.pending || previous.pending !== this.props.pending)
    ) {
      if (cancelled && this.reading && !this.navigated) {
        viewport.host.scrollTop = this.reading.top;
        viewport.host.scrollLeft = this.reading.left;
      } else if (
        (previous.targeting && previous.destinations) ||
        previous.pending
      ) {
        const anchor = viewport.anchors.find(
          ({ element }) => element.isConnected,
        );
        viewport.host.scrollTop = anchor
          ? viewport.host.scrollTop +
            anchor.element.getBoundingClientRect().top -
            anchor.top
          : viewport.top;
        viewport.host.scrollLeft = viewport.left;
      }
      // A switch that reopens destinations consumes their old reading context.
      // Later cancellation must not jump back across that already restored layout.
      if (
        changed &&
        previous.targeting &&
        this.props.targeting &&
        !this.props.destinations
      )
        this.reading = null;
    }
    if (cancelled) this.reading = null;
    this.baseline = this.capture();
  }

  render() {
    return (
      <div ref={this.root} style={{ display: "contents" }}>
        {this.props.children}
      </div>
    );
  }
}
