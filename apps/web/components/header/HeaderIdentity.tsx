"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The active page owns identity and its lifetime. The shell only provides a
// destination: no second profile store, route inference, or retained stale slot.
export const HeaderIdentityTarget = createContext<HTMLElement | null>(null);

export function HeaderIdentity({ children }: { children: ReactNode }) {
  const target = useContext(HeaderIdentityTarget);
  return target ? createPortal(children, target) : null;
}

export function HeaderNickname({
  nickname,
  onEdit,
}: {
  nickname: string;
  onEdit?: () => void;
}) {
  const name = <span className="truncate">{nickname}</span>;
  return onEdit ? (
    <button
      type="button"
      onClick={onEdit}
      title={nickname}
      aria-label={`Edit nickname: ${nickname}`}
      className="flex min-w-0 items-center gap-1 rounded px-1 py-2 text-sm hover:bg-surface focus-visible:outline-2"
    >
      {name}
      <span aria-hidden="true" className="shrink-0">
        ✎
      </span>
    </button>
  ) : (
    <span title={nickname} className="block truncate text-sm">
      {nickname}
    </span>
  );
}
