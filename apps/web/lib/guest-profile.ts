import { apiFetch, ApiHttpError, getOrCreateClientId } from "./api";

export type GuestProfile = {
  clientId: string;
  displayName: string;
  updatedAt: string;
  suggestions: string[];
  generation: string;
  revision: number;
};

export class StaleGuestProfileError extends Error {
  constructor(public readonly confirmedProfile?: GuestProfile) {
    super(
      "Your nickname changed. Review the confirmed name and retry your draft.",
    );
  }
}

const initializing = new Map<string, Promise<GuestProfile>>();
const storageKey = (id: string) => `montoncito:nickname:${id}`;
const profileKey = (id: string) => `montoncito:profile:${id}`;
const confirmed = new Map<string, GuestProfile>();
const retiredGenerations = new Map<string, Set<string>>();
const listeners = new Set<(profile: GuestProfile) => void>();

function storedProfile(id: string): GuestProfile | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(profileKey(id)) ?? "null");
    if (
      value?.clientId === id &&
      typeof value.displayName === "string" &&
      typeof value.generation === "string" &&
      Number.isInteger(value.revision) &&
      Array.isArray(value.suggestions)
    )
      return value;
  } catch {
    /* Storage is optional. */
  }
}

function latestKnownProfile(id: string): GuestProfile | undefined {
  const stored = storedProfile(id);
  const memory = confirmed.get(id);
  if (!stored) return memory;
  if (!memory) return stored;
  if (stored.generation === memory.generation)
    return stored.revision > memory.revision ? stored : memory;
  return retiredGenerations.get(id)?.has(stored.generation) ? memory : stored;
}

async function withGuestProfileLock<T>(
  id: string,
  operation: () => Promise<T>,
): Promise<T> {
  // Without cross-tab exclusion, restoring a preference is unsafe. Fail
  // recoverably rather than racing an accepted change in another tab.
  if (!navigator.locks)
    return Promise.reject(
      new Error("Nickname recovery needs a browser with Web Locks support."),
    );
  return navigator.locks.request(`montoncito:profile:${id}`, operation);
}

export function subscribeGuestProfile(
  listener: (profile: GuestProfile) => void,
) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    const id = getOrCreateClientId();
    if (event.key !== profileKey(id)) return;
    const profile = latestKnownProfile(id);
    if (profile) publish(profile);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function publish(profile: GuestProfile) {
  const previous = confirmed.get(profile.clientId);
  if (previous && previous.generation !== profile.generation) {
    retireGeneration(previous);
  }
  confirmed.set(profile.clientId, profile);
  for (const listener of listeners) listener(profile);
}

function retireGeneration(profile: GuestProfile) {
  const retired = retiredGenerations.get(profile.clientId) ?? new Set<string>();
  retired.add(profile.generation);
  retiredGenerations.set(profile.clientId, retired);
}

function acceptGuestProfile(
  profile: GuestProfile,
  allowGenerationChange = false,
) {
  const current = latestKnownProfile(profile.clientId);
  if (
    current &&
    current.generation !== profile.generation &&
    !allowGenerationChange
  )
    return current;
  if (
    current?.generation === profile.generation &&
    current.revision > profile.revision
  )
    return current;
  if (current && current.generation !== profile.generation)
    retireGeneration(current);
  try {
    localStorage.setItem(profileKey(profile.clientId), JSON.stringify(profile));
    localStorage.setItem(storageKey(profile.clientId), profile.displayName);
  } catch {
    // A blocked/full browser store does not prevent playing or saving on the server.
  }
  publish(profile);
  return profile;
}

export function rememberGuestProfile(
  profile: GuestProfile,
): Promise<GuestProfile> {
  return withGuestProfileLock(profile.clientId, async () =>
    acceptGuestProfile(profile),
  );
}

export function initializeGuestProfile(
  clientId = getOrCreateClientId(),
): Promise<GuestProfile> {
  const pending = initializing.get(clientId);
  if (pending) return pending;
  const request = withGuestProfileLock(clientId, async () => {
    let saved: string | null =
      latestKnownProfile(clientId)?.displayName ?? null;
    try {
      saved ??= localStorage.getItem(storageKey(clientId));
    } catch {
      // Use the server profile when browser storage is unavailable.
    }
    const displayName = saved?.trim();
    const profile = await apiFetch<GuestProfile>("/profile", {
      method: "POST",
      clientId,
      body: JSON.stringify(
        displayName && displayName.length <= 32 ? { displayName } : {},
      ),
    });
    return acceptGuestProfile(profile, true);
  }).finally(() => initializing.delete(clientId));
  initializing.set(clientId, request);
  return request;
}

export async function withGuestProfileRecovery<T>(
  profile: GuestProfile,
  request: (current: GuestProfile) => Promise<T>,
): Promise<{ profile: GuestProfile; value: T }> {
  try {
    return { profile, value: await request(profile) };
  } catch (error) {
    if (
      !(error instanceof ApiHttpError) ||
      error.code !== "STALE_PROFILE_GENERATION"
    )
      throw error;
    const current = await initializeGuestProfile(profile.clientId);
    return { profile: current, value: await request(current) };
  }
}

export function nicknameValidationError(draft: string): string | null {
  if (!draft.trim()) return "Enter a nickname.";
  if (draft.trim().length > 32) return "Use 32 characters or fewer.";
  return null;
}

export async function saveGuestNickname(
  draft: string,
  base?: GuestProfile,
): Promise<GuestProfile> {
  const validation = nicknameValidationError(draft);
  if (validation) throw new Error(validation);
  const clientId = getOrCreateClientId();
  try {
    // Editors open only after profile initialization. Saving must not start a
    // second initialization whose late response can overwrite a newer name.
    const expected = base ?? latestKnownProfile(clientId);
    if (!expected) throw new Error("Initialize your nickname before saving.");
    const saved = await apiFetch<GuestProfile>("/profile", {
      method: "PATCH",
      clientId,
      body: JSON.stringify({
        displayName: draft,
        base: { generation: expected.generation, revision: expected.revision },
      }),
    });
    return await rememberGuestProfile(saved);
  } catch (error) {
    if (error instanceof ApiHttpError && error.code === "STALE_PROFILE") {
      const profile = await initializeGuestProfile(clientId).catch(
        () => undefined,
      );
      throw new StaleGuestProfileError(profile);
    }
    if (error instanceof ApiHttpError && error.status === 409) {
      throw new Error(
        "That nickname is already used in a Lobby you have joined. It may be another Lobby. Choose another nickname.",
      );
    }
    if (error instanceof ApiHttpError && error.status === 400) {
      throw new Error(
        "That nickname could not be saved. Use 1 to 32 characters.",
      );
    }
    throw new Error("Couldn't save your nickname. Please try again.");
  }
}
