# Lobby-to-winner verification

Coverage for [#65](https://github.com/maximobesteiro/montoncito/issues/65), the homepage nickname slice [#88](https://github.com/maximobesteiro/montoncito/issues/88), and live Lobby nicknames [#89](https://github.com/maximobesteiro/montoncito/issues/89).

## Run

```sh
pnpm --filter web exec playwright install chromium
pnpm --filter web test test/game-journey.test.ts
pnpm --filter web test 'app/game/[roomId]/page.test.tsx'
pnpm --filter web test 'app/game/[roomId]/page.layout.test.tsx'
pnpm --filter server exec jest --runInBand lobby-nicknames.spec.ts
pnpm --filter server exec tsc --noEmit
pnpm check-types
pnpm build
pnpm test
```

The journey test builds the server and its workspace dependencies, starts Nest on
an ephemeral loopback port, and launches two isolated Chromium browser contexts.
It bundles the real Home, Lobby, and Game room pages with Vite and the compiled
application stylesheet. Only Next routing is replaced by browser history routing.
REST, Socket.IO, the Game room hook, session transitions, and accepted gameplay
all use the application code. The browser clients receive actual server frames;
the test compares their Authoritative states after each accepted Action.

## Scenarios

The nickname journeys exercise the actual homepage/editor and real profile API at 1440px and touch-enabled 390px. They verify automatic invented names, draft-only Shuffle, keyboard Save/Cancel, blank and length validation, canonical international names, browser-tab closure/reopening with retained storage, and creation under the confirmed name. A controlled failed HTTP response verifies the saving state, duplicate-submit prevention, retained draft/confirmed name, Cancel, and a successful retry. Direct-invite coverage restores a stored nickname before joining and checks the host's visible roster. Public REST checks verify canonical values, identity preservation, rejected saves, the 32-character boundary, and initialization that cannot overwrite an existing profile with an older cached name.

Live Lobby journeys verify own-row-only editing for the host and a ready guest, removal of visible guest IDs, two-client rename delivery, capitalization conflicts, retained rejected drafts and confirmed names, and readiness preservation. Generated suggestions are exhausted through real REST memberships to verify custom-name recovery and conflict feedback for another joined Lobby. Controlled response delays verify departure and match-start navigation discard pending editor results and preserve newer browser preferences and match snapshots.

Additional delayed readiness and settings responses verify that older REST rosters cannot overwrite names already delivered through WebSocket updates. Suggestion coverage distinguishes an exhausted pool from a pool whose only available name is already the draft.

`apps/server/src/profiles/lobby-nicknames.spec.ts` starts the real Nest REST and Socket.IO application on an ephemeral port. It tests simultaneous conflicting renames, concurrent admissions and rename/admission races, idempotent joins, unrelated-Lobby reuse, atomic validation across multiple Lobbies, filtered and exhausted suggestions, fan-out to every affected Lobby, chat names at send time, and unchanged active match snapshots and Sequence numbers.

| Requirement                                                                    | Coverage                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create/join, configured Discard piles, ready/start, repeated Turns to a winner | Two live clients play a standard seeded match, starting with 20 Stock cards each and two Discard piles, at 1440px and touch-enabled 390px. All gameplay goes through visible tap/click controls and real WebSocket Actions.                                                                    |
| Named winner, viewer identity, final read-only board, connected chat           | Both clients verify their respective winner heading, retain the final board without gameplay sources, and exchange chat after Stock reaches zero. The page test also cancels a gesture when a winning snapshot arrives.                                                                        |
| Lobby chat history recovered in the Game room                                  | Send chat before start, navigate both clients into the same Game room, and read the recovered message there, including the mobile chat sheet.                                                                                                                                                  |
| Drop, Build completion/recycling, Hand refill, dynamic Builds                  | A controlled server setup at both widths uses real mouse/touch release hit-testing to complete rank 12, recycles 12 cards, empties/refills Hand from that Recycle pile, creates two new Builds, and plays across three Turns to a Stock winner.                                                |
| Opponent public cards and Discard inspection                                   | The controlled journey inspects own and opponent covered Discard cards and verifies visible opponent Stock and concealed Hand counts. Histories remain inspectable after the winner.                                                                                                           |
| Exceptional End Turn and no-moves fallback                                     | A controlled server setup at both widths permits End Turn with an empty Hand and exhausted Draw/Recycle piles. The next player makes the final legal play and wins by fewer Stock cards, with a nonempty Stock.                                                                                |
| Pending, rejection, stale/reconnecting, terminal sessions                      | `page.test.tsx` controls session outcomes to verify pending source/destination marks, rejected Actions on the latest board, read-only reconnect snapshots, gesture cancellation, and terminal feedback. `lib/use-game-room.test.ts` covers persisted Pending Action retries and chat recovery. |
| Dense boards and small screens                                                 | `page.layout.test.tsx` measures the rendered page at 320, 390, 768, 1024, and 1440px with 18 Builds, one to four Discard piles, and three opponents.                                                                                                                                           |

The server fixture changes setup only for controlled rare scenarios. It adds no
application routes or production fixture controls. The ordinary seeded journey
uses the standard game setup and a fixed seed. Display names are copied from
Lobby profiles into Authoritative state when the game starts.

The mock reference remains labelled and available only by direct link at
`/game/prototype`.
