import { apiFetch, ApiHttpError, getOrCreateClientId } from "./api";
import {
  initializeGuestProfile,
  rememberGuestProfile,
  withGuestProfileRecovery,
  type GuestProfile,
} from "./guest-profile";

// Keep Casual provenance for this tab's destination, including Lobby reloads.
// Reading by ID avoids creating another Lobby if this destination disappears.
const destinationKey = (id: string) => `montoncito:casual-destination:${id}`;

export function rememberCasualEntry(room: { id: string; slug: string }) {
  sessionStorage.setItem(
    destinationKey(getOrCreateClientId()),
    JSON.stringify({ id: room.id, slug: room.slug }),
  );
}

export function getCasualEntry(slug: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const saved = sessionStorage.getItem(destinationKey(getOrCreateClientId()));
    if (saved === null) return undefined;
    const destination: unknown = JSON.parse(saved);
    if (
      !destination ||
      typeof destination !== "object" ||
      !("id" in destination) ||
      typeof destination.id !== "string" ||
      !destination.id ||
      !("slug" in destination) ||
      typeof destination.slug !== "string" ||
      !destination.slug
    )
      throw new Error("Invalid Casual destination");
    return destination.slug === slug
      ? { id: destination.id, slug: destination.slug }
      : undefined;
  } catch {
    // Unreadable provenance is not evidence of an ordinary invite. Callers
    // must show a recoverable error rather than resolve a creating slug URL.
    throw new CasualEntryLookupError();
  }
}

export class CasualEntryLookupError extends Error {
  constructor() {
    super(
      "Couldn't read your stored game entry. Restore browser storage access and retry entry. No Lobby was created or joined.",
    );
  }
}

export function forgetCasualEntry(id: string) {
  const key = destinationKey(getOrCreateClientId());
  const saved = sessionStorage.getItem(key);
  if (saved && JSON.parse(saved).id === id) sessionStorage.removeItem(key);
}

export function completeCasualEntry() {
  sessionStorage.removeItem(attemptKey(getOrCreateClientId()));
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
  const clientId = getOrCreateClientId();
  sessionStorage.removeItem(attemptKey(clientId));
  sessionStorage.removeItem(destinationKey(clientId));
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
    // Persist the confirmed destination before any further asynchronous work.
    // The attempt remains recoverable until the destination finishes booting.
    rememberCasualEntry(room);
    await rememberGuestProfile(room.profile);
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
