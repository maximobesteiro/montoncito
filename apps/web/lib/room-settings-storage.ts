export type RoomSettings = {
  visibility: "public" | "private";
  maxPlayers: number;
  discardPiles: number;
};

const STORAGE_KEY_PREFIX = "montoncito:room:";

export function getRoomSettings(slug: string): RoomSettings | null {
  try {
    const key = `${STORAGE_KEY_PREFIX}${slug}`;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as RoomSettings) : null;
  } catch {
    return null;
  }
}

export function saveRoomSettings(slug: string, settings: RoomSettings): void {
  try {
    const key = `${STORAGE_KEY_PREFIX}${slug}`;
    localStorage.setItem(key, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}


