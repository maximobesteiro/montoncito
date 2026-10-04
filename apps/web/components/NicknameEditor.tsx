"use client";

import { useId, useRef, useState } from "react";
import { nicknameValidationError } from "@/lib/guest-profile";

type NicknameEditorProps = {
  nickname: string;
  suggestions: readonly string[];
  onSave: (draft: string) => Promise<void>;
  onCancel: () => void;
};

export function NicknameEditor({
  nickname,
  suggestions,
  onSave,
  onCancel,
}: NicknameEditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(nickname);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const buttonClass = "brutal-button px-3 py-2 bg-card disabled:opacity-50";

  const save = async () => {
    if (submitting.current) return;
    const validation = nicknameValidationError(draft);
    if (validation) {
      setError(validation);
      return;
    }
    submitting.current = true;
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't save your nickname. Please try again.",
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3"
      aria-busy={saving}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !submitting.current) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <label htmlFor={id} className="font-bold">
        Nickname
      </label>
      <input
        id={id}
        autoFocus
        value={draft}
        disabled={saving}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        className="w-full min-w-0 brutal-border px-3 py-2 bg-card"
      />
      <p id={`${id}-hint`} className="text-sm text-text-muted">
        Use up to 32 characters.
      </p>
      {error && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-sm text-text-primary"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass}
          disabled={saving || suggestions.length === 0}
          onClick={() => {
            const choices = suggestions.filter((name) => name !== draft);
            if (choices.length)
              setDraft(choices[Math.floor(Math.random() * choices.length)]!);
            setError(null);
          }}
        >
          Shuffle
        </button>
        <button type="submit" className={buttonClass} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
