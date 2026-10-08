# Lobby-to-winner verification

Coverage for [#65](https://github.com/maximobesteiro/montoncito/issues/65), the homepage nickname slice [#88](https://github.com/maximobesteiro/montoncito/issues/88), live Lobby nicknames [#89](https://github.com/maximobesteiro/montoncito/issues/89), and fixed match identities [#91](https://github.com/maximobesteiro/montoncito/issues/91).

Same-browser nickname consistency and restart recovery cover [#92](https://github.com/maximobesteiro/montoncito/issues/92).

Casual Game entry covers [#99](https://github.com/maximobesteiro/montoncito/issues/99) of [spec #98](https://github.com/maximobesteiro/montoncito/issues/98). Browser journeys verify public fallback defaults despite remembered host settings, one-click joining and live rosters, full ready-member recovery, post-entry editing, host start, pending/error feedback and retry, and profile-generation recovery across a real server restart. `apps/server/src/rooms/casual-game.spec.ts` verifies authoritative selection and admission through real REST and Socket.IO, including custom settings, exclusions, oldest membership, grace-period admission, explicit departure, concurrent last-seat requests, and a finished match played through the public WebSocket protocol.

## Run

```sh
pnpm --filter web exec playwright install chromium
pnpm --filter web test test/game-journey.test.ts
pnpm --filter web test 'app/game/[roomId]/page.test.tsx'
pnpm --filter web test 'app/game/[roomId]/page.layout.test.tsx'
pnpm --filter server exec jest --runInBand lobby-nicknames.spec.ts
pnpm --filter server exec jest --runInBand casual-game.spec.ts
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

Shared-context pages verify confirmed-name synchronization without changing another tab's draft, stale-save feedback and explicit retry, close/reopen persistence, delayed initialization and out-of-order save responses. Restart coverage closes and recreates the real Nest application on the same port with retained browser data, initializes simultaneous tabs, rejects an old-generation save, and creates a new Lobby under the recovered nickname. Public API checks verify simultaneous restoration, competing saves with the same revision, stale admission rejection without membership changes, and initialization that preserves the winning name. The fixture adds no recovery endpoint and does not restore rooms or games.

Additional journeys verify failed restoration can retry without losing the remembered name, a delayed initialization spanning restart restores the name before direct-invite admission, and a failed storage write cannot let an older delayed save replace the newest in-memory confirmation.

Lobby Shuffle also uses shared initialization. A journey holds socket renewal pending across a server restart, shuffles an open editor, and verifies a fresh homepage and the public profile API retain the confirmed nickname.

Match identity journeys at both widths start a match, open another Lobby in shared-storage browser tabs, rename there, and verify the original board and newly sent chat keep the captured name and Sequence number. Carried Lobby chat keeps its stored sender name. A subsequent Lobby and match use the new name. Delayed saves accepted before and after start verify navigation removes the editor, late responses cannot reopen it, and a fresh homepage recovers the accepted profile for future use.

Focused public REST/WebSocket coverage verifies both accepted save/start orderings against synchronization snapshots. A controlled initial Stock pile permits a real WebSocket Action to finish the match, then another rename and chat prove post-game messages still use the captured name without changing the final snapshot or Sequence number.

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
