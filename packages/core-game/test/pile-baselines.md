# Pre-normalization gameplay baselines

`__snapshots__/pile-baselines.test.ts.snap` contains golden vectors captured from
the version-1 core at commit `d6a5e8c60e526c9773b36e4b60df39854f71ce02`, before
adding the shared pile operations. Capture used:

```sh
pnpm --filter @mont/core-game exec vitest run test/pile-baselines.test.ts --update
```

The snapshot is the independent expected result. Keep it frozen during pile
normalization. Run without `--update` to check compatibility:

```sh
pnpm --filter @mont/core-game exec vitest run test/pile-baselines.test.ts
```

Each snapshot line is a JSON observation. The first records setup; subsequent
lines record a fixed Action, its accepted outcome and events, newly drawn card
identities in draw order, and observable gameplay state. Hands compare as sorted
card identities because they are unordered. Stock and Discard observations are
`[count, playableTopId]`. Build observations include the public top selector and
next required rank. Every observation records seeded Turn ownership and RNG
algorithm, seed, and cursor. Serialized state versions and internal pile array
orientation are deliberately absent.

Four setup cases cover supported player counts 2, 3, and 4 and Discard counts 1
through 4. Two Turn circuits record future deals and Discard tops. The recycling
case uses the existing custom-deck setup seam and a fixed seed. Accepted Stock
and Hand plays create and complete a Build, including King and Joker placements.
Discarding then refills across the final original Draw card and a twelve-card
Recycle reshuffle. Further fixed Actions consume every card in that shuffled
Draw pile. All twelve identities and their draw sequence are recorded, so either
reversing Draw consumption or changing the completed Build's Recycle input
sequence changes the baseline. No state is manually edited during replay.

Sensitivity checks during capture confirmed failures for reversed Draw
consumption, reversed post-reshuffle Draw output, and reversed completed-Build
Recycle input. Each temporary mutation was removed after its failing test run.

The tests never compute expected deals or shuffles using the new pile helpers.
The normalization ticket can update custom-deck setup representation at its
input boundary if necessary, and the public Build-top selector must follow the
new representation. The golden gameplay observations and recorded Actions must
remain unchanged. No second production engine is required.
