import { apiFetch, ApiHttpError, getOrCreateClientId } from "./api";
import {
  initializeGuestProfile,
  rememberGuestProfile,
  withGuestProfileRecovery,
  type GuestProfile,
} from "./guest-profile";

// Pass the confirmed destination to the Lobby during same-tab navigation.
// Reading by ID avoids creating another Lobby if this destination disappears.
let destination: { id: string; slug: string } | undefined;

export function rememberCasualEntry(room: { id: string; slug: string }) {
  destination = { id: room.id, slug: room.slug };
}

export function getCasualEntry(slug: string) {
  return destination?.slug === slug ? destination : undefined;
}

export function forgetCasualEntry(id: string) {
  if (destination?.id === id) destination = undefined;
}

type CasualAttempt = {
  operationId: string;
  generation: string;
  uncertain: boolean;
};
type CasualResult = {
  id: string;
  slug: string;
  status: "open" | "in_progress" | "finished";
  wsJoinToken: string;
  profile: GuestProfile;
};
const attemptKey = (id: string) => `montoncito:casual:${id}`;

export class CasualDestinationUnavailableError extends Error {
  constructor() {
    super(
      "Your original game or membership is no longer available. Find another game to start a fresh attempt.",
    );
  }
}

export function startFreshCasualEntry() {
  sessionStorage.removeItem(attemptKey(getOrCreateClientId()));
}

export async function enterCasualGame(): Promise<CasualResult> {
  const clientId = getOrCreateClientId();
  const key = attemptKey(clientId);
  const saved = sessionStorage.getItem(key);
  const previous: CasualAttempt | null = saved ? JSON.parse(saved) : null;
  const profile = await initializeGuestProfile(clientId);
  const attempt: CasualAttempt = previous ?? {
    operationId: crypto.randomUUID(),
    generation: profile.generation,
    uncertain: false,
  };
  const recovering = attempt.uncertain;
  const request = async (generation: string) => {
    attempt.generation = generation;
    attempt.uncertain = true;
    // Persist before sending. Reload must never turn an uncertain POST into a
    // fresh selection. A storage failure therefore prevents entry.
    sessionStorage.setItem(key, JSON.stringify(attempt));
    try {
      return await apiFetch<CasualResult>("/rooms/casual", {
        method: "POST",
        clientId,
        headers: { "x-profile-generation": generation },
        body: JSON.stringify({ operationId: attempt.operationId }),
      });
    } catch (error) {
      if (
        error instanceof ApiHttpError &&
        error.code === "STALE_PROFILE_GENERATION" &&
        !recovering
      ) {
        // The server rejected before admission. Profile recovery may safely
        // retry this attempt in the new generation.
        attempt.uncertain = false;
        sessionStorage.setItem(key, JSON.stringify(attempt));
      }
      throw error;
    }
  };
  try {
    const room = recovering
      ? await request(attempt.generation)
      : (
          await withGuestProfileRecovery(profile, (current) =>
            request(current.generation),
          )
        ).value;
    await rememberGuestProfile(room.profile);
    rememberCasualEntry(room);
    sessionStorage.removeItem(key);
    return room;
  } catch (error) {
    if (
      error instanceof ApiHttpError &&
      error.code === "STALE_PROFILE_GENERATION" &&
      recovering
    ) {
      // Restore the preference, but never recover a lost room/operation by
      // admitting again after a process restart.
      await initializeGuestProfile(clientId);
      throw new CasualDestinationUnavailableError();
    }
    if (
      error instanceof ApiHttpError &&
      error.code === "CASUAL_DESTINATION_UNAVAILABLE"
    )
      throw new CasualDestinationUnavailableError();
    throw error;
  }
}
