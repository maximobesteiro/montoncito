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
