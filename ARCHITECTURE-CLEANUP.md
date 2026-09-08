# Architecture Cleanup

Implemented locally on September 7, 2026. Nothing published.

## GitHub Upload List

Replace these files at the repository root:
- index.html
- style.css
- economy.js
- state-save.js
- main.js
- render.js
- ui-events.js
- library.js

Add these new files at the repository root:
- game-actions.js
- musicxml.js

Upload these ten files together. No assets, music catalog entries, or game-data.js changes are needed for this cleanup.
Optional developer files: tests/game-core.test.cjs, tests/browser-smoke.mjs, ARCHITECTURE-CLEANUP.md, progress.md.
Do not upload outputs/, output/, or local browser caches.

## Boundaries

- game-data.js: unchanged definitions, prices, multipliers and unlock thresholds.
- economy.js: shared formulas, including the existing venue chain, Patron and endowment rules moved out of main.
- game-actions.js: DOM/storage-free validated purchases, exact action previews, buy-all, clicks, achievements, prestige, endowment/reset and elapsed-time progression.
- state-save.js: read-only loading/migration, validation, backups, recovery and all storage writes.
- render.js: screen rendering, keyed shop row reconciliation, unchanged-node caching and formatting.
- ui-events.js: delegated shop input, details state, note input and cancellable action-selector gestures.
- main.js: initialization, navigation, notifications/tutorial orchestration, action callbacks and lifecycle.
- musicxml.js: independent MusicXML parser; accepts a DOMParser implementation for isolated testing.
- library.js: catalog integration, Practice unlock UI and WebAudio playback.

Main was reduced from 3,039 to roughly 1,600 lines without converting to JavaScript modules or adding runtime dependencies.

## Saves

The primary save key and existing progress fields remain unchanged. A backup uses the primary key plus "_backup".
Loading does not write. Malformed saves recover from a valid backup or legacy save. If none is readable, writing is blocked so the original data is retained.
Failed writes leave loaded progress in memory and show a persistent warning. Autosave uses the same helper.
Hard reset clears primary, backup and legacy keys before starting a fresh state.
Reparsed works preserve IDs, Practice and unlocked-event counts, clamped to the new event total. parserVersion is additive metadata.
Catalog downloads are staged and cannot overwrite a newly reset state or discard Practice/unlocks earned during the request.

## Behavior Corrections (Not Rebalancing)

- Active time, reload catch-up and background catch-up use the same function. Background catch-up is applied once on return, capped at six hours; both Notes and Practice accrue. No away clicks are generated.
- Time is settled before purchases and pause changes. Reloading after a modal no longer retains an invisible blocking flag.
- Previews include Patron spending, so purchasing a venue or its upgrades may have a smaller net gain, or even a negative net gain. Negative previews are now displayed honestly.
- Conducting Skill and instrument click previews use the real click formula, rather than approximations that incorrectly multiplied unrelated click components.
- The piano score now overlaps voices/staves instead of playing them sequentially. Unlocks remain a chronological event prefix; keeping the old count may expose a different set of events at that same count. Ties remain separate.
- Unavailable Upgrades does not disable the action selector. Enter/Space executes; hold or ArrowDown opens the choices; Escape dismisses. Long-press and cancelled gestures do not purchase.
- Floating toolbars honor their hidden state outside gameplay and during the tutorial. The mobile note retains its centered proportions.
- Direct-opening index.html still runs the base game. Music catalog fetching needs HTTP (a local server or GitHub Pages); file-opening no longer causes an automatic unsupported-fetch console error.

No price, multiplier, achievement reward or prestige formula was rebalanced.

## Verification

Run from this folder:

    node tests/game-core.test.cjs
    node tests/browser-smoke.mjs
    BROWSER=webkit node tests/browser-smoke.mjs

Browser tests use an existing Playwright installation outside the game. Override PLAYWRIGHT_MODULE with its index.mjs path if necessary.
Tests create isolated browser contexts and seed their own test saves; they do not modify your normal browser save.

Coverage:
- Eight core test groups: read-only migration; corrupt/structurally invalid saves; backup/legacy recovery; read/write/partial-write failures; hard reset; active/catch-up consistency; cap/paused/backwards/repeated timestamps; exact early/late previews; Notes-only buy-all and priority; idempotent achievements; prestige/endowment; a pure-action progression smoke run.
- Chromium and WebKit: first-click purchases spanning refreshes; rapid purchases; stable note images and purchase elements; keyboard input; cancelled mouse purchase; unavailable selector and Escape; long press without spending; mobile note tap and centering; start/tutorial flow; hidden prestige; direct file opening; prestige/hard reset; endowment reset; visible save failure; background Notes/Practice and reload without double credit.
- MusicXML fixture covers backup, forward, chords, rests, separate ties and first-part selection. The supplied piano score is checked for simultaneous starts and correct measure endpoints.
- Partial playback scheduling is inspected with a test AudioContext; navigation stops playback. This verifies scheduled timing, not subjective audio quality.
- Web-game skill client run and screenshots inspected. Browser screenshots are in outputs/architecture/.

Physical iPhone Safari and listening to the synth on speakers remain worthwhile manual checks; automated WebKit is not a physical-device test.

