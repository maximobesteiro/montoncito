"use client";

import { useEffect, useId, useRef, useState } from "react";
import { nicknameValidationError } from "@/lib/guest-profile";

type NicknameEditorProps = {
  nickname: string;
  suggestions: readonly string[];
  onSave: (draft: string) => Promise<void>;
  onCancel: () => void;
  loadSuggestions?: () => Promise<readonly string[]>;
};

export function NicknameEditor({
  nickname,
  suggestions,
  onSave,
  onCancel,
  loadSuggestions,
}: NicknameEditorProps) {
  const id = useId();
  const [draft, setDraft] = useState(nickname);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const [shuffling, setShuffling] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const buttonClass = "brutal-button px-3 py-2 bg-card disabled:opacity-50";

  const save = async () => {
    if (submitting.current || shuffling) return;
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
      if (!mounted.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : "Couldn't save your nickname. Please try again.",
      );
    } finally {
      submitting.current = false;
      if (mounted.current) setSaving(false);
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
        disabled={saving || shuffling}
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
          disabled={
            saving ||
            shuffling ||
            (!loadSuggestions && suggestions.length === 0)
          }
          onClick={async () => {
            setShuffling(true);
            try {
              const available = loadSuggestions
                ? await loadSuggestions()
                : suggestions;
              if (!mounted.current) return;
              const choices = available.filter(
                (name) => name.toLowerCase() !== draft.trim().toLowerCase(),
              );
              if (choices.length) {
                setDraft(choices[Math.floor(Math.random() * choices.length)]!);
                setError(null);
              } else {
                setError(
                  available.length
                    ? "Your draft is the only available generated nickname. You can save it or enter your own."
                    : "No generated nicknames are available. Enter your own nickname.",
                );
              }
            } catch {
              if (mounted.current)
                setError(
                  "Couldn't load nickname suggestions. Please try again.",
                );
            } finally {
              if (mounted.current) setShuffling(false);
            }
          }}
        >
          {shuffling ? "Shuffling..." : "Shuffle"}
        </button>
        <button
          type="submit"
          className={buttonClass}
          disabled={saving || shuffling}
        >
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
