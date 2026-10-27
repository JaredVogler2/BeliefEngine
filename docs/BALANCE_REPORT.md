# Balance report

Numbers in this file come from commands that were run in this repository; each section says which. Scripted planners are
heuristics that use exact action previews, so they are *evidence about the simulation*, not predictions of human win rates.

## Procedural generation (phase 08)

Reproduce: `npm run gen:verify` (about two minutes on four workers), then `npx tsx scripts/report-expeditions.ts`.

Seeds 1–1000 (1000 villages) were generated, checked and played by scripted planners on this machine in 130 s of wall time (0.13 s per village on 4 workers, each village played up to four times). Raw data: `docs/data/expeditions.json`.

| Check | Result |
| --- | --- |
| Hard crashes | 0 |
| Villages that passed every structural invariant | 998 of 1000 |
| Needed a derived seed (first draw rejected) | 213 of 1000 (21.3%) |
| Still failed after eight derived seeds | 2 (reported, not hidden) |
| "Do nothing" wins the village | 0 |
| Won by at least one planner (verified) | 855 (85.5%) |
| Won by two or more different planners | 516 (51.6%) |
| Median generation time (incl. do-nothing check) | 7 ms |

| Biome | Villages | Verified | Rate | Two+ planners win |
| --- | --- | --- | --- | --- |
| river | 332 | 277 | 83.4% | 117 |
| drought | 334 | 328 | 98.2% | 269 |
| wolves | 332 | 250 | 75.3% | 130 |

| Planner | Villages won |
| --- | --- |
| caravans | 322 |
| moonlight | 275 |
| witness-bridge | 234 |
| smoke-ring | 203 |
| decoy | 177 |
| bell-ringer | 93 |
| fire-wall | 90 |

| Run modifier | Villages | Verified | Rate |
| --- | --- | --- | --- |
| busy_harvest | 126 | 121 | 96.0% |
| clear_night_skies | 72 | 72 | 100.0% |
| cross_bank_mistrust | 162 | 114 | 70.4% |
| divided_council | 183 | 149 | 81.4% |
| doubting_scholars | 181 | 169 | 93.4% |
| early_frost | 70 | 69 | 98.6% |
| low_fuel | 169 | 141 | 83.4% |
| overcrowded_refuge | 46 | 43 | 93.5% |
| restless_wolves | 89 | 61 | 68.5% |
| river_of_reeds | 55 | 40 | 72.7% |
| silent_bells | 123 | 112 | 91.1% |
| soot_season | 47 | 38 | 80.9% |
| stubborn_elders | 194 | 157 | 80.9% |
| travelling_circus | 224 | 198 | 88.4% |

**Variety.** 640 distinct gameplay signatures in 1000 villages (signature = biome, size class, choke topology, headline crisis number, starting stories, run modifiers). In every aligned window of 12 successive seeds there were at least 11 distinct signatures. The biome shuffle bag guarantees each biome appears twice in every aligned run of six seeds.

**Known false negatives.** 143 villages (14.3%) were not won by any of the scripted planners (three per biome, deliberately simple). That is not proof that they cannot be won: a human who reads the omens and the social graph plays better than a greedy planner. These seeds are excluded from the verified catalog (daily villages and "another village" never choose them) and are labelled "Unverified seed" if a player types one in. Guaranteed solvability is **not** claimed.

