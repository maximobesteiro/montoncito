"use client";

import { Modal } from "./Modal";

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  isDestructive = false,
}: ConfirmationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      title={title}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmText={confirmText}
      cancelText={cancelText}
    >
      <div className="space-y-4">
        <p className="text-text-muted font-medium">{message}</p>
        {isDestructive && (
          <p className="text-sm font-bold text-red-500 uppercase tracking-wider">
            Warning: This action cannot be undone.
          </p>
        )}
      </div>
    </Modal>
  );
}

