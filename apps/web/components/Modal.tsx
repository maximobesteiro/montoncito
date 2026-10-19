"use client";

import { ReactNode, useEffect, useId, useRef } from "react";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  showCloseIcon?: boolean;
  showActions?: boolean;
}

export function Modal({
  isOpen,
  title,
  children,
  dismissible = true,
  busy = false,
  onCancel,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  showCloseIcon = true,
  showActions = true,
}: ModalProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const backdropPress = useRef(false);
  useEffect(() => {
    const panel = dialog.current;
    if (!isOpen || !panel) return;
    const opener = document.activeElement;
    const overflow = document.body.style.overflow;
    panel.showModal();
    panel
      .querySelector<HTMLElement>(
        "input:not([disabled]), textarea:not([disabled]), select:not([disabled])",
      )
      ?.focus();
    document.body.style.overflow = "hidden";
    return () => {
      panel.close();
      document.body.style.overflow = overflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const dismiss = () => {
    if (dismissible && !busy) {
      onCancel();
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-modal="true"
      aria-busy={busy}
      className="app-modal brutal-border bg-card text-text-primary brutal-shadow p-6 max-w-lg w-[calc(100%-2rem)] m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
          ),
        ).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        } else if (!first) event.preventDefault();
      }}
      onPointerDown={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        backdropPress.current =
          event.target === event.currentTarget &&
          (event.clientX < bounds.left ||
            event.clientX >= bounds.right ||
            event.clientY < bounds.top ||
            event.clientY >= bounds.bottom);
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget)
          dismiss();
        backdropPress.current = false;
      }}
    >
      {/* Close icon */}
      {showCloseIcon && (
        <button
          type="button"
          onClick={dismiss}
          disabled={busy || !dismissible}
          className="absolute top-4 right-4 brutal-border w-8 h-8 flex items-center justify-center bg-card hover:bg-surface font-bold text-l cursor-pointer"
          aria-label="Close"
        >
          ×
        </button>
      )}

      {/* Title */}
      <h2 id={titleId} className="text-2xl font-bold mb-4 pr-10">
        {title}
      </h2>

      {/* Content */}
      <div className={showActions ? "mb-6" : undefined}>{children}</div>

      {/* Buttons */}
      {showActions && (
        <div className="flex gap-4 justify-end">
          <button
            type="button"
            onClick={dismiss}
            disabled={busy || !dismissible}
            className="brutal-button bg-btn-neutral text-text-on-dark hover:bg-btn-neutral-hover"
          >
            {cancelText}
          </button>
          {onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="brutal-button bg-btn-primary text-text-on-dark hover:bg-btn-primary-hover"
            >
              {confirmText}
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}
