# Known issues and limits

* **Two of the five planned story chapters exist** (Redbank, Harvest, Ashwood ship; "The Town Where Nothing Burns" and "The Last Bell of Greyhaven" are not built). Generated expeditions provide the variety instead.
* **Solvability of generated villages is evidence, not proof**: about 85% are won by at least one scripted planner and about half by two or more; the rest are not hidden but are unverified (docs/BALANCE_REPORT.md). Planners are deliberately simple; a human may do better.
* **Laws almost never collapse once active.** In 300+ bot runs laws wavered or collapsed essentially never; public failures now cost conviction (phase 10) but rarely enough to break a law. Whether that makes belief too sticky is a question for the fun review.
* Difficulty is untuned for humans: greedy bots with exact previews win most Redbank seeds on both routes (an upper bound for humans). Tournament-driven tuning is phase 11.
* Not implemented from the phase 10 brief: faction compromise pacts that tax another resource, and factions blocking access to landmarks.
* Browsers verified: Chromium (Playwright build 1.63). Firefox and WebKit are not installed in this environment, so they are unverified.
* No real-device testing has been done.
* Art and audio are procedural placeholders of decent quality but not final.
* Human playtests have not been run. No claim about fun beyond automated evidence is made.
