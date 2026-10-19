"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { NicknameEditor, type NicknameEditorProps } from "./NicknameEditor";

// Mount only for an active editing session. The caller owns voluntary-save or
// admission semantics; this presentation never initializes or saves a profile.
export function NicknameModal({
  children,
  ...editor
}: NicknameEditorProps & { children?: ReactNode }) {
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      isOpen
      title="Edit nickname"
      busy={saving}
      onCancel={editor.onCancel}
      showCloseIcon={false}
      showActions={false}
    >
      {children}
      <NicknameEditor
        {...editor}
        autoFocus={false}
        handleEscape={false}
        onSavingChange={setSaving}
      />
    </Modal>
  );
}
