# Exploratory playthrough notes (AI-driven, not a human session)

**Who played:** an automated agent (the author of this repository's code) driving the real production build through the browser with Playwright: real clicks on the real controls, then reading the screenshots and event logs. This is **not** a human playtest and says nothing about how a person feels; the human protocol is `docs/PLAYTEST_PROTOCOL.md` and has not been run.

**What was played to its end:** all three chapters (the clicked traces in `tests/e2e/redbank.spec.ts`, `scenarios.spec.ts`: Redbank twice and a loss, Harvest twice, Ashwood twice), and generated villages `x1.1` (victory) and `x1.3` (defeat) through the expedition flow (`tests/e2e/expedition-win.spec.ts`). Screens reviewed: `docs/screens/` and an expedition briefing and first day.

## Where it worked
* A clicked win reads as cause and effect: the debrief for Redbank names who was told, who saw the demonstration, the law becoming LAW on day 5 and "Result: the bridge held", and now also the rival's hand ("Old Harl campaigns ... Your challenge blunted it").
* The expedition briefing is clear: the surge chart, twists with their trade-offs ("Proof is king. Mass-telling is weak."), a "Verified winnable" chip.
* The end-of-run scene tells the truth at a glance (lit and fallen houses, the bridge, a dot per villager).

## Where it is confusing, thin or slow (observed; the first three were fixed in phase 15, see `docs/FUN_REVIEW.md`)
* **Opening-story cards look inconsistent in a generated village.** On `x1.1` day 1 the card "River fears fire [1]" is dimmed (it unlocks later) while the two cards the player can use have the pulsing gold tutorial outline, and the digit shortcut `1` still labels the dimmed one. A new player will read dimmed as "broken" or as "worse".
* **The first-day tip card sits over the left of the map** and covers a villager and the start of the story hand on a 1366x768 window; "Skip tips" removes it but the default is to cover content.
* **Hints are generic.** A generated village shows the same four hint lines as Redbank, including one about "the east bank walking out" that is only true where there is a bridge and an east bank.
* **Idle Influence once a law is live.** Bots that win the bridge route spend about 15 of 23 Influence and pass 29% of their days. A human aiming only to win may feel the last two days have nothing to do; a human aiming for the gold medal does (13+ alive, heroic).
* **No late recovery in Harvest.** Losses there are decided by about day 6 of 9 (`docs/BALANCE_REPORT.md`, rescue test); the debrief says why but the player has no chance to act on it.
* **The bridge route's real cost is easy to miss:** food. A win can end on exactly the 4 food the objective asks for.
* **Grind:** a full Redbank day by the book is 3-5 clicks per action (claim, select, button); keyboard shortcuts exist for stories but not for "tell the selected villager".

## Not observed
Confusion, rage-clicks, dead controls and appetite for a second run from real people; any frame-rate on a real phone; how the audio feels.

---

## Round 7: the 3D build played to its end through the real UI (AI-driven, not a human session)

**Who played:** the same automated agent, driving the production build in Chromium through Playwright one real click (desktop window,
1440×900) or tap (phone emulation, 390×844 with touch) at a time, deciding each move from the screenshot it had just looked at and the
text of the panels. The browser drew with SwiftShader (software GL) at `?quality=medium`, about 2.5 s a frame on this machine, so these
notes say nothing about frame rate, input latency or feel on real hardware; a panel that slid in slowly here is not evidence of anything.
No person has played the 3D build. `?debug=1` was on (it exposes the test hooks), so the debrief said the run "earns nothing".

**What was played:** Flood at Redbank, seed 1, Normal, from the title screen to the debrief, without tips skipped. Day 1: chose "River
fears fire", told Mara (as the coach asked), Tilly and Ivo. Day 2: followed the law ledger's "Win over next" (Old Harl, Bram, Nell); the
Tonight tab said the river was rising, so no fire. Day 3 (ebbing, a good omen): lit the Bridge-road beacon as proof, told Dunn: 3 new
believers that night. Day 4: challenged the miller's counter-story with Ivo ("Your challenge blunted it") and sent Ivo to Dunn; the flood
took two wheat fields. Day 5 (ebbing): lit the South Beacon as proof; support 63% → 71%, the law began to wake. Day 6: the forecast said
8 homes would be touched and the bridge would take 33 of its last 26; lit three more beacons by the threatened cottages. The law woke that
night and kept 7 homes dry, the bridge fell, and the law-bold sparks set two houses alight. Day 7, the Great Surge: nothing left within
reach (no bridge), ended the day. **Victory: 14 of 14 alive, 13 homes, 6 food, score 771, bronze.** The phone was played through day 1:
title, chooser, briefing, coach, Mara, the law sheet, the morning report.

Contact sheets of the screens the decisions were made from: `docs/3d-rebuild/screenshots/playthrough/desktop-run.jpg` and
`phone-run.jpg` (some frames are from before the fixes below, and are labelled so).

### Where it worked
* **The loop explains itself.** Every number a decision needed was on screen where it was needed: the Tell preview ("Mara 0→13"), the
  messenger previews ("Ivo tells Dunn: 32→64"), the omens in the Tonight tab ("the river is ebbing tonight. It will look like the fire
  turned it"), and the forecast "If nothing else changes: 8 homes will be touched by water". The proof preview even showed a drop
  ("Ivo 78→59") on a bad-omen night, which is what stopped a mistake on day 6.
* **The morning reports read as cause and effect:** "Nell Carter warms to it because someone who saw it told them — Mara", "Thatcher's
  House stayed dry: the flood would have reached 3 deep, but 'River fears fire' was active (77% support, 4 lit beacons)".
* **The world shows what the engine did.** Rain and a darkening sky as the days get worse, the flood spreading over the east-bank fields
  on night 4, gold rings round every lit beacon once the law woke, the bridge gone after night 6, the flooded aftermath with the rings
  still holding the water off the east-bank homes.
* **The law ledger's "Win over next" chips were the best guide in the game**: following them was enough to reach the law by day 6.
* On the phone the law sheet opens at half height with the whole village visible above it, and a selected villager's card docks at the
  bottom with the village reframed above it.

### What was wrong, and what was done about it (all fixed in this round, with tests where a test can see it)
| Found | Fix |
|---|---|
| The title screen showed the old flat 2D map behind the menu. | The title shows the 3D village (Redbank) wherever the game itself will be 3D; the classic map stays the fallback. |
| The chooser and the briefing were flat dark pages between a 3D title and a 3D game. | The living village stays up behind every menu (built once, held still behind pages of text), and the briefing shows the village the player is about to play (the Ashwood briefing shows Ashwood). |
| The briefing had two buttons, "Skip briefing" and "Begin the first day", that did the same thing. | One button. |
| "Tap Mara Wells, the bridgekeeper": the hint was a ring about 14 px across and 1 px thick from the overview. | A gold call-out bobs above the named person's head, drawn the same size on screen at any distance; the ring at their feet grows with the distance. Unit test. |
| The coach names one person, but both hinted people got the same mark. | Only the named person gets the call-out; the other keeps the ring. Unit test (fails against the old behaviour). |
| Action costs said "1 AP" while the coach and the bar say "Influence". | The cost is the number with the same gold pip as the Influence bar; screen readers hear "1 Influence". |
| The coach says "try a ritual at a landmark", but a cold beacon is a small grey cairn from the overview, and nothing pointed at one. | The places where the chosen story's proof can be staged (cold beacons for the fire, the bridge for the watch, the bell tower for the bells) carry a gold ring marker from afar; a beacon already burning well loses it; while the coach is pointing at a person the markers wait. Unit test. |
| On day 6 the North Beacon could not be clicked from the overview: a cottage stands in front of it, and the click opened the cottage. | A click on a proof marker picks its place, even behind a roof. |
| The morning report opened scrolled down: the auto-focused button pulled the headline ("1 law activated, 7 homes spared, the bridge fell") out of view. | The button is focused without scrolling, and the button row is pinned to the bottom of the report so a long night is read from its headline down. The keyboard test that checks the focus still passes. |
| The pinned row let the text under it show through faintly. | Opaque. |
| The aftermath caption read "The village endures. The village endures." (the engine's ending line repeats its reason). | The ending is left out of the captions (the headline under the picture states it); the engine's own text is untouched to keep replays and hashes identical. Unit test. |
| "14 home(s) and 5 life/lives spared", "1 home(s) in the water's reach". | Proper plurals. |

### Still true, not changed
* **Continue switches the tips off** (by design: a returning player is not coached again). A player who quits on day 1 and comes back
  loses the coach.
* **After a night the camera is often close in on where the night's main event happened** (the flood at the bridge, the last person
  selected), so the morning report sits over a close-up rather than the whole village. Deliberate; noted because it surprised once.
* **With the bridge gone the keeper cannot reach the east bank**, so the last day had little to do. That is the rules working, but a
  player who did not read "If it fails, the east bank is cut off" on day 4 will not see it coming.
* **The day-7 report is long** (13 lines); it scrolls, now from the top.

### Not observed
How a person reads any of this; frame rate, touch latency and heat on a real phone; Safari itself (Playwright's WebKit ran the 3D smoke
test in round 6, which is the same engine but not the same browser); how the audio feels.
