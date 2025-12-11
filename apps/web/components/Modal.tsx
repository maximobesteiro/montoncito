"use client";

import { ReactNode, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  title: string;
  children: ReactNode;
  dismissible?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  showCloseIcon?: boolean;
}

export function Modal({
  isOpen,
  title,
  children,
  dismissible = true,
  onCancel,
  onConfirm,
  confirmText = "Confirm",
  cancelText = "Cancel",
  showCloseIcon = true,
}: ModalProps) {
  // Handle Escape key press
  useEffect(() => {
    if (!isOpen || !dismissible) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, dismissible, onCancel]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (dismissible) {
      onCancel();
    }
  };

  const handleModalClick = (e: React.MouseEvent) => {
    // Prevent clicks inside modal from closing it
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 bg-overlay flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div
        className="brutal-border bg-card brutal-shadow p-6 max-w-lg w-full mx-4 relative"
        onClick={handleModalClick}
      >
        {/* Close icon */}
        {showCloseIcon && (
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 brutal-border w-8 h-8 flex items-center justify-center bg-card hover:bg-surface font-bold text-l cursor-pointer"
            aria-label="Close"
          >
            ×
          </button>
        )}

        {/* Title */}
        <h2 className="text-2xl font-bold mb-4 pr-10">{title}</h2>

        {/* Content */}
        <div className="mb-6">{children}</div>

        {/* Buttons */}
        <div className="flex gap-4 justify-end">
          <button
            onClick={onCancel}
            className="brutal-button bg-btn-neutral text-text-on-dark hover:bg-btn-neutral-hover"
          >
            {cancelText}
          </button>
          {onConfirm && (
            <button
              onClick={onConfirm}
              className="brutal-button bg-btn-primary text-text-on-dark hover:bg-btn-primary-hover"
            >
              {confirmText}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
