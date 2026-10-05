# API fixtures

Sample responses from `https://api-web.nhle.com/v1/`, captured on 2026-10-05.
The TypeScript types in `src/lib/nhl/types.ts` are written from these files.

**How these were captured.** The cloud machine this app was first built on could not reach
`api-web.nhle.com` directly, so these samples were read through a web-fetch tool. That means:

- Arrays are truncated to a couple of elements to keep the files small.
- A few long URL/clip fields were dropped. All other field names are copied from the real responses.
- In `schedule_2026-10-05.json`, games 2–4 were reconstructed from a per-game summary
  (ids, teams, start times, venues and odds are real; team ids for OTT/BOS/PIT/SJS/DAL were filled in).
- `play-by-play` is not saved: the fetch tool returned an unreliable copy, and the app doesn't depend on it
  (box score + gamecenter `landing` summary carry goals, scorers and three stars).

**Replace them with full raw responses** on any machine with access to the API:

```bash
npm run fixtures
```

This overwrites every file here with the complete, untruncated response for today's date.

Observations from the real data:
- `schedule/{date}` already carries moneyline odds per team (`odds: [{providerId, value}]`), mixing
  American (`"-225"`) and decimal (`"1.37"`) formats. Provider ids map to `oddsPartners` in `score/{date}`.
  Some providers quote 3-way (regulation) prices, so the app keeps only providers whose two prices
  form a plausible 2-way market (overround 0–12%).
- `partner-game/{country}/now` works but only returns `MONEY_LINE_2_WAY` / `MONEY_LINE_3_WAY`
  for one partner, and its `currentOddsDate` can lag a day behind. No totals or puck line,
  so The Odds API adapter is used for those when `ODDS_API_KEY` is set.
- Probable goalies are not in `schedule`; `gamecenter/{id}/landing` → `matchup.goalieComparison`
  lists each team's goalies (the first leader is treated as the probable starter).
- Three stars live in `gamecenter/{id}/landing` → `summary.threeStars` once a game is final.
