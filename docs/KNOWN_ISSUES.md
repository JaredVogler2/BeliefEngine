# Known issues and limits

* **Two of the five planned story chapters exist** (Redbank, Harvest, Ashwood ship; "The Town Where Nothing Burns" and "The Last Bell of Greyhaven" are not built). Generated expeditions provide the variety instead.
* **Solvability of generated villages is evidence, not proof**: about 85% are won by at least one scripted planner and about half by two or more; the rest are not hidden but are unverified (docs/BALANCE_REPORT.md). Planners are deliberately simple; a human may do better.
* **Laws almost never collapse once active.** In 300+ bot runs laws wavered or collapsed essentially never; public failures now cost conviction (phase 10) but rarely enough to break a law. Whether that makes belief too sticky is a question for the fun review.
* **Difficulty is measured on bots, never on people** (phase 11, `docs/BALANCE_REPORT.md`). Redbank's best plan (staged proof at the bridge, then messengers) still wins 998 of 1 000 seeds; the same route is far harder without the demonstration (bridge-builder 81.5%, greedy 65%, a social-only plan 0-8%). That is an upper bound for people, not a promise, and the bridge route's real cost (food: it ends with exactly the 4 food the objective asks for) is easy to miss.
* **Generic strategy variety is thin in Ashwood and Harvest**: only fire-lighting plans win Ashwood and only the moonlight law wins Harvest for the generic bots. The grain caravan and the decoy fire are won by the scripted planners, so those routes exist but no generic policy finds them.
* **The tournament's decision-density and rescue figures are proxies** (value by exact preview; rescue = another bot taking over with 1-3 days left), not measures of how a person feels.
* Not implemented from the phase 10 brief: faction compromise pacts that tax another resource, and factions blocking access to landmarks.
* Browsers verified (Playwright builds on Linux): Chromium 153 (whole E2E suite), Firefox 155 and WebKit 26.6 plus an iPhone-14 emulation (smoke spec only). Real Safari and every real device are untested; a screen-reader pass is owed (`docs/ACCESSIBILITY.md`).
* **Not deployed:** no URL exists and no live smoke test has been run (`docs/RELEASE_CHECKLIST.md`).
* From the AI-driven exploratory pass (`docs/PLAYTHROUGH_NOTES.md`): dimmed opening-story cards and the first-day tip card covering the map are confusing; hints are generic in generated villages.
* Art and audio are procedural placeholders of decent quality but not final.
* Human playtests have not been run. No claim about fun beyond automated evidence is made.
* **No late recovery.** In the tournament's rescue test no lost Harvest run was recoverable with three days left, and no lost run in any scenario was recoverable on the final day (`docs/BALANCE_REPORT.md`, deep sample). Players are warned a day or two ahead, but a mistake made before about day 6 of 9 is final.
