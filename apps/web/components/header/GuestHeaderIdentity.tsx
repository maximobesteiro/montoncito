"use client";

import { useEffect, useRef, useState } from "react";
import {
  initializeGuestProfile,
  saveGuestNickname,
  subscribeGuestProfile,
  type GuestProfile,
} from "@/lib/guest-profile";
import { HeaderIdentity, HeaderNickname } from "./HeaderIdentity";
import { NicknameModal } from "../NicknameModal";

export function GuestHeaderIdentity() {
  const [profile, setProfile] = useState<GuestProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    let initialized = false;
    setFailed(false);
    const unsubscribe = subscribeGuestProfile((value) => {
      if (initialized) setProfile(value);
    });
    void initializeGuestProfile()
      .then((value) => {
        if (active.current) {
          initialized = true;
          setProfile(value);
        }
      })
      .catch(() => {
        if (active.current) setFailed(true);
      });
    return () => {
      active.current = false;
      unsubscribe();
    };
  }, [attempt]);
  return (
    <>
      <HeaderIdentity>
        {profile ? (
          <HeaderNickname
            nickname={profile.displayName}
            onEdit={() => setEditing(true)}
          />
        ) : failed ? (
          <button
            type="button"
            className="min-w-0 text-sm underline"
            title="Couldn't load your nickname. Retry."
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry nickname
          </button>
        ) : (
          <span role="status" className="truncate text-sm text-text-muted">
            Loading nickname...
          </span>
        )}
      </HeaderIdentity>
      {editing && profile && (
        <NicknameModal
          nickname={profile.displayName}
          baseProfile={profile}
          suggestions={profile.suggestions}
          onCancel={() => setEditing(false)}
          onSave={async (draft, base) => {
            const confirmed = await saveGuestNickname(draft, base);
            if (active.current) {
              setProfile(confirmed);
              setEditing(false);
            }
          }}
        />
      )}
    </>
  );
}
