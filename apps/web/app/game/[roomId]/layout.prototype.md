# Throwaway: conservative Game room cleanup

Question: how much does removing administrative chrome fix before changing the board itself?

Run `pnpm prototype:game` from the repository root. Open:

<http://localhost:3000/game/layout-demo?prototype=layout&variant=base>

Use the bottom arrows (or Left/Right) to compare variants; the original `variant=current` remains directly accessible. Expand Scenarios to select a visual fixture, connection state and active player. This is a development-only read-only fixture, not a live match. All scenario state is in memory; the URL identifies the selected scenario for sharing/reloading, without browser-storage persistence. The chat is a visual stand-in, not the real chat implementation. The switcher is evaluation tooling, not proposed UI; it overlays the bottom edge.

## Second exploration: integrated versus compact

Open <http://localhost:3000/game/layout-demo?prototype=layout&variant=integrated> or use `variant=compact`. The arrows now cycle through all four versions in both directions.

Both new versions remove the separate Turn row, turn number and local-player title. Turn ownership shares the Build piles heading with quiet Draw/Recycle counters. The local area loses its heavy enclosing card; zone order and desktop chat-above-opponents column remain unchanged. Own Stock and Hand stay side by side on mobile. Hand cards overlap only as needed, with visible upper-left values and suits; clicking or keyboard-activating a card raises it for inspection without submitting an Action. The Hand fixture now includes an Ace, 8, King, Jack and Joker in every variant to probe different labels.

- **C / integrated:** own cards 72 × 104, opponent cards 56 × 80.
- **D / compact:** own cards 56 × 80, opponent cards 48 × 64.

Inspection histories retain the existing expandable Pile implementation. Smaller inspection controls retain a minimum 44 × 44 footprint. Overlapped Hand strips do **not** guarantee 44px exposed touch widths on narrow screens; this is a human-validation question, not a solved accessibility or gameplay design. No drag/drop or legal-move evaluation is implemented in these new variants. Mobile chat remains a simplified visual stand-in.

Browser measurements on the default two-player scenario:

| Viewport   | C Hand / Discards bottom | D Hand / Discards bottom |
| ---------- | ------------------------ | ------------------------ |
| 1440 × 900 | 416 / 692                | 367 / 615                |
| 390 × 844  | 422 / 698                | 373 / 621                |
| 320 × 740  | 554 / 830                | 373 / 621                |

No horizontal document overflow at these sizes. C still wraps Build piles at 320px and pushes Discards below the viewport. D keeps the default own-play circuit in the viewport at all three sizes, but this does not establish that all opponents or a dense table fit. The floating evaluation controls can occlude the bottom of the screen; they are not part of the proposed game UI. Browser checks covered exposed-strip selection, keyboard selection, turn changes, offline status, dense-table switching and backwards variant navigation, with no page errors.

The baseline preserves card order, sizes, typography and the right column. It removes the room header and replaces the large Turn block with a compact status. Technical-data access is deliberately deferred; neither a menu nor floating info control is chosen here. The original `/game/prototype` route is unrelated existing work and remains untouched.

## Initial browser measurements (not a human verdict)

At 1440 × 900, Hand bounds move from y=648–780 to 476–608; Discard bounds move from 832–1108 to 660–936. At 390 × 844, Hand bounds move from 956–1200 to 784–1028, and Discard bounds from 1216–1748 to 1044–1576. Chrome removal recovers 172px, but does not meet the no-routine-scroll objective alone. Existing stock/Hand reflow, wrapped Hand cards and pile footprints remain candidates for the next discussion.

No production choice has been validated. Do not promote this code as implementation. After feedback, retain the experiment on a throwaway branch if needed; do not merge its selector/CSS into the real design.

## Third exploration: horizontal distribution on D

Human feedback: D is the most promising direction, but left-aligned Build piles leave excess unused width, and Stock/Hand feel crowded together. This is a preference for further exploration, not approval to implement.

- **D / compact** remains unchanged as the reference.
- **E / compact-centered:** Build piles centered within the play column; Stock at left; Hand centered within the remaining right-hand space.
- **F / compact-right:** same centered Build piles and left Stock, with Hand aligned to the right edge.

Open `?prototype=layout&variant=compact-centered` or `?prototype=layout&variant=compact-right` on `/game/layout-demo`. The carousel includes B–F; A remains available through its original `variant=current` URL. No sizes, vertical order, Discard alignment or right-column composition change in E/F. The Stock/Hand gap grows to 24–48px as space allows. The Hand group, including its label, has a bounded natural width rather than stretching across all free space. On narrow mobile screens E/F converge because the Hand consumes the available width; preserving readable cards takes priority over manufacturing a centering difference.

Browser verification at 1440×900, 390×844 and 320×740 found no horizontal overflow or change to D's Hand/Discard vertical bounds. At desktop width, the Hand starts at x=220 in D, x=415 in E, and x=581 in F, while Stock stays at x=144. No browser page errors. Human comparison remains pending.

## Fourth exploration: validate E against changing state

**Human verdict on alignment:** E wins (Hand centered in the space to the right of Stock). This selects the visual direction, not a production implementation. Preserve E while exploring its limits instead of introducing new aesthetic variants.

The Scenario selector now offers Habitual, two Hand cards, one Hand card, empty Hand with no Draw/Recycle, zero Build piles and empty Discards, six Builds, four Discards, four players, a combined case, and eighteen Builds. Scenario IDs live in `scenarios.prototype.ts` and can be shared as `&scenario=partial`, `single`, `empty`, `start`, `builds`, `discards`, `players`, `combined`, or `dense` (default `normal`). These are intentionally hand-shaped visual fixtures, not claims that an engine replay reaches each state. No game-rule validation or gameplay submission is performed.

Hand width and mobile overlap columns now follow the actual card count. Empty Hand shows a quiet placeholder while retaining row height. Changing scenarios resets inspection and selection; changing active player or offline state does not represent a gameplay Action. Builds now include different top ranks and heights instead of eighteen identical rank-two piles, exposing real label/stack sizing pressure.

### Browser findings, not a usability verdict

Ten scenarios were measured at each of 1440×900, 1024×768, 390×844, 320×740 and 844×390. No horizontal document overflow; Hand centers remained within one pixel of their intended region at all 50 combinations. Exposed-strip selection, keyboard selection, scenario changes/reload, removal of a selected card, history expansion/collapse, offline status and rival Turn display were checked without page errors. Type checking passes.

| Viewport | Habitual Hand / Discards bottom | Result / limitation                                                                                           |
| -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1440×900 | 370 / 618                       | Own play area fits in every fixture, including dense.                                                         |
| 1024×768 | 370 / 618                       | Own area fits except eighteen Builds (Discards bottom 846).                                                   |
| 390×844  | 376 / 624                       | Own area fits except eighteen Builds (Discards bottom 1080). Six Builds bottom 738.                           |
| 320×740  | 484 / 732                       | Habitual barely fits by geometry; longer Build labels cause a wrap. Six Builds bottom 738; dense bottom 1188. |
| 844×390  | 376 / 624                       | No tested scenario keeps the entire own play area visible. Landscape remains unresolved.                      |

“Fits” above measures geometry only: it does not prove unobscured touch access, account for the prototype's floating controls/chat button, or establish that all rival cimas fit. Multiple opponents remain below the own area on mobile and can require scrolling. History expansion is deliberately allowed to require scrolling. Browser emulation cannot establish real-device touch comfort.

Open decisions exposed by this round: landscape treatment while preserving the agreed zone order; acceptable handling of dense Build collections; very narrow screens with long pile labels; rival visibility on mobile; real selection/destination/drag behavior. No new policy for these has been silently added to E. Menu/info access remains deferred.

## Fifth exploration: E with a stable mobile rival dock (superseded)

**Agreed question:** does keeping the active rival's public tops visible justify the height taken away from the own-play circuit? This is a usability experiment on E, not a new visual variant or a production implementation.

Human choices for this round:

- Prioritize portrait. Landscape remains accessible by scrolling, without an orientation lock or a promise of simultaneous visibility.
- Dense Build collections stay fully rendered in the general document scroll. No nested Build scroller, pagination, filtering or pile limit.
- Below 1024px, E replaces its below-board opponents with a fixed bottom panel next to the chat entry. Other variants and desktop composition remain unchanged.
- Rival summaries retain seated order and show identity, Stock count and Hand count. During a rival Turn, show that rival's Stock top and every Discard top, including counts; never their Hand faces. During the local Turn, show summaries only.
- Reserve the same panel height during every Turn, including the local Turn. The resulting empty detail space is an intentional cost to evaluate, not an automatic-collapse policy.

Run `pnpm prototype:game`, then open:

<http://localhost:3000/game/layout-demo?prototype=layout&variant=compact-centered&scenario=combined>

Also compare `scenario=players`, `discards` and `dense`. Open Scenarios and use **Turno de** to switch among all seated players. E's mobile evaluation controls now sit above the board in document flow, rather than occluding its bottom edge. The dock itself is 224px high plus the safe-area inset, with matching document end padding so the final own cards and inspection controls can scroll above it. Chat remains a read-only stand-in and opens over the dock; this does not validate production chat or gestures.

### Browser checks, not a human verdict

Checked all four scenarios at 390×844, 320×740, 844×390 and 1440×900 (16 combinations). Each seated player was selected as active. No horizontal document overflow or page errors; mobile dock position and height stayed constant through Turn changes. Chat opened and closed, and the bottom of own Discards could scroll above the dock. Desktop keeps the chat/opponents column; D still has its original mobile chat and no rival dock. Type checking passes.

| Viewport | Dock top | Dock height | Cost to evaluate                                                                                 |
| -------- | -------- | ----------- | ------------------------------------------------------------------------------------------------ |
| 390×844  | 620      | 224         | Own Discards require scrolling even in the four-player habitual fixture.                         |
| 320×740  | 516      | 224         | Less reading room; narrow labels and exposed Hand strips still need human validation.            |
| 844×390  | 166      | 224         | Most height belongs to the dock; scrolling access is not evidence of comfortable landscape play. |

These measurements use a zero safe-area inset and do not simulate browser chrome or real-device touch comfort. The dock's 48×64 rival cards are read-only. The Next.js development indicator may still overlay the chat button; it is not proposed game UI. Human review should judge rival readability, loss of own-play context, the blank reserved area during the local Turn, chat access and the extra scroll in dense tables. No verdict or promotion to production is implied.

## Sixth exploration: E alignment with D's mobile opponents

**Human feedback:** E remains the chosen visual direction, but its fixed mobile rival panel takes too much space. D's mobile opponent presentation is preferred.

**Agreed trial:** preserve E's centered Builds and Hand centered to the right of Stock; restore D's opponent sections below the own-play area on mobile. Remove the fixed rival panel and its reserved height. All opponents' Stock and Discard tops remain available in document flow, including during the local Turn; consulting them may require scrolling. Desktop and the other variants remain unchanged.

E's evaluation controls remain above the board in document flow, so they do not obscure the comparison. Mobile chat returns to the same stand-in entry as D. The unused `rivals-dock.prototype.tsx` is retained as an artifact of the previous experiment, not rendered.

Keep the existing landscape and density policy: document scrolling, no orientation lock, nested Build scroller, pagination, filtering or pile limit. This round tests whether the recovered viewport improves own play enough to justify scrolling to consult rivals; it is not a production decision.

Use the same E URL above and compare `scenario=players`, `combined` and `dense` in portrait and landscape. Human review is pending; measurements from the fixed-dock experiment above do not describe this version.
