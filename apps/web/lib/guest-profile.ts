import { apiFetch, ApiHttpError, getOrCreateClientId } from "./api";

export type GuestProfile = {
  clientId: string;
  displayName: string;
  updatedAt: string;
  suggestions: string[];
};

const initializing = new Map<string, Promise<GuestProfile>>();
const storageKey = (id: string) => `montoncito:nickname:${id}`;

function remember(profile: Pick<GuestProfile, "clientId" | "displayName">) {
  try {
    localStorage.setItem(storageKey(profile.clientId), profile.displayName);
  } catch {
    // A blocked/full browser store does not prevent playing or saving on the server.
  }
}

export function initializeGuestProfile(
  clientId = getOrCreateClientId(),
): Promise<GuestProfile> {
  const pending = initializing.get(clientId);
  if (pending) return pending;
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(storageKey(clientId));
  } catch {
    // Use the server profile when browser storage is unavailable.
  }
  const displayName = saved?.trim();
  const request = apiFetch<GuestProfile>("/profile", {
    method: "POST",
    clientId,
    body: JSON.stringify(
      displayName && displayName.length <= 32 ? { displayName } : {},
    ),
  })
    .then((profile) => {
      remember(profile);
      return profile;
    })
    .finally(() => initializing.delete(clientId));
  initializing.set(clientId, request);
  return request;
}

export function nicknameValidationError(draft: string): string | null {
  if (!draft.trim()) return "Enter a nickname.";
  if (draft.trim().length > 32) return "Use 32 characters or fewer.";
  return null;
}

export async function saveGuestNickname(
  draft: string,
  isCurrent: () => boolean = () => true,
): Promise<GuestProfile> {
  const validation = nicknameValidationError(draft);
  if (validation) throw new Error(validation);
  const clientId = getOrCreateClientId();
  try {
    // Editors open only after profile initialization. Saving must not start a
    // second initialization whose late response can overwrite a newer name.
    const saved = await apiFetch<GuestProfile>("/profile", {
      method: "PATCH",
      clientId,
      body: JSON.stringify({ displayName: draft }),
    });
    if (isCurrent()) remember(saved);
    return saved;
  } catch (error) {
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
