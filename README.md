# Puck Edge

A personal NHL betting analytics app: tonight's games with model win probabilities, projected totals,
puck-line and player-prop probabilities, edge against the market, full schedules and results, standings,
leaders, model tracking and a bet tracker with bankroll management.

Built with Next.js (App Router) + TypeScript + Tailwind, SQLite via Drizzle, and the free public NHL API
(`https://api-web.nhle.com/v1/`, no key needed).

> Picks are probabilities, not guarantees. Bet only what you can afford to lose.

## Setup

Requires Node.js 22.13 or newer (Node 24 LTS recommended). The database uses Node's built-in SQLite,
so `npm install` doesn't compile anything: no Python or Visual Studio build tools needed on Windows.
Node prints a one-line `ExperimentalWarning: SQLite is an experimental feature` at startup; it's harmless.

```bash
git clone https://github.com/jdmotif/puck-edge
cd puck-edge
npm install
npm run sync      # first run: backfills this season and last (a few thousand box scores, ~5–15 min)
npm run dev       # http://localhost:3000
```

The app works before `sync` has run, but every team looks league-average until games are stored,
so the model won't label any Value picks until then.

The database lives in `data/puck-edge.db` (override with `DATABASE_PATH`). Tables are created automatically.

### Nightly sync

`npm run sync` is incremental: it only fetches box scores it doesn't have yet, then grades the model's picks,
settles your bets and refits the model. Schedule it once a day, e.g. at 5 am:

- **macOS / Linux (cron):** `0 5 * * * cd /path/to/puck-edge && npm run sync >> data/sync.log 2>&1`
- **Windows (Task Scheduler):** create a daily task running `cmd /c "cd /d C:\path\to\puck-edge && npm run sync"`

While the app is open it also pulls in games from the last two days in the background (at most every
10 minutes), so results and grading stay current between syncs.

### Odds (optional)

The NHL schedule feed already includes moneyline prices from several books, and the NHL's `partner-game/{country}/now`
feed adds **totals and puck-line prices** from that country's betting partner (FanDuel in Canada, DraftKings in the US),
so all three game markets have edges with no setup. Pick your country under Settings → "Where you bet"; best prices are
limited to that country's books, while the margin-free market probability still averages every book.

For more books (and a fallback if the partner feed has no line for a game), add a free key from [The Odds API](https://the-odds-api.com):

```bash
cp .env.example .env
# then edit .env:
ODDS_API_KEY=your_key_here
ODDS_API_REGION=us     # us, us2, uk, eu or au
```

Responses are cached for 15 minutes to save quota (one request covers every game).
When no feed prices a market, its pick is shown as **model-only** (probability, no edge).
Player props are always model-only: neither free feed carries prop prices.

## Pages

| Page | What's there |
|---|---|
| **Tonight** (`/`) | Every game: local start time, venue, records, L10, streak, rest / back-to-back, probable goalies with SV% and GAA, win probabilities, projected total and a **Best Pick** card. Expand for every pick, props and reasons. `←/→` to browse other days. |
| **Game** (`/game/[id]`) | Preview before puck drop (all picks + player projections), full box score afterwards (scoring, three stars, skaters, goalies, and how the model's picks graded). |
| **Schedule** | Month and week calendar, filterable by team. |
| **Results** | Every completed game of the season with final score, OT/SO marker, goal scorers and three stars. Filter by team, date range and result type. |
| **Standings** | Wild card, division, conference and league views. Team pages have stats, roster, schedule, home/road splits and head-to-head history. |
| **Leaders** | Sortable skater (points, goals, assists, PP goals, shots, TOI) and goalie tables, plus a **Hot & Cold** list. Player pages have a game-log chart and home/away/opponent splits. |
| **Model** | Hit rate, ROI at flat 1-unit stakes and calibration charts per market, the backtest, and the model's current weights. Markets where the model is losing are flagged in red. |
| **Bets** | Log bets (prefilled from any pick), automatic settlement, P&L, ROI, bankroll chart and a fractional-Kelly stake suggestion. |
| **Settings** | Value threshold (default 3%), Kelly fraction (default ¼), max stake cap, starting bankroll, daily/weekly loss limits and a session reminder. |

## How the model works

Everything is built from stored box scores and is explainable: each pick lists the 3–5 factors that pushed it.

### Team and goalie ratings (`src/lib/model/features.ts`)

For each team, as of the morning of the game: goals for/against per game, **shot share** (shots for ÷ all shots,
the xG proxy), goal differential per game, and **recent form** (points % over the last 10, weighted 1…10 toward
the most recent game). Early in a season these are shrunk toward last season's numbers (regressed a third of the
way to league average) with about 12 games of prior weight, so three hot games don't make a team elite.

Goalies get a save % regressed toward league average with ~600 shots of prior weight (last season counts half).
Quality = goals saved above average per 30 shots. The probable starter is whoever has the most recent starts,
switching to the backup when the starter played yesterday. Once a game starts, the confirmed starter from the
box score is used.

### Moneyline: logistic regression (`engine.ts`, `fit.ts`)

`P(home win) = sigmoid(home_ice + w·features)` with features = home − away differences in shot share, goal
differential, form, rest days, back-to-back and goalie quality. It is fitted nightly on every stored game
(walk-forward: each game's features only use games before it), with light L2 regularisation. Until 300 games
are stored it uses sensible prior weights. The fitted weights are shown on the Model page.

### Totals: Poisson

Expected goals for each side = league goals per team-game × team attack × opponent defence × goalie factor
× venue (home +3.5%) × rest (back-to-back −3.5% scoring, +3.5% conceded). The goalie factor compares tonight's
goalie with the team's overall save %. A tie after regulation adds one goal (OT goal or shootout winner),
which is how books settle totals.

### Puck line (±1.5)

The two Poisson rates are re-split so the score distribution reproduces the moneyline probability at the projected
total, so moneyline, total and puck line never contradict each other. P(win by 2+) also gets an empty-net
adjustment: 18% of one-goal regulation wins are assumed to become two-goal wins (`EMPTY_NET_SHIFT` in `math.ts`).

### Player props

Goals and points per game, blended 65% season (shrunk toward last season / position average) and 35% last 10
games, then scaled by tonight's matchup (team's projected goals vs its normal rate), ice-time trend (last 5 vs
season), venue and the opposing goalie. `P(anytime goal) = 1 − e^−λ`, `P(2+ points) = 1 − e^−λ(1 + λ)`.

### Edge, value and confidence

Market odds are converted to implied probabilities and the bookmaker margin is removed (multiplicative method;
the power method is also available in `math.ts`). Prices from several books are averaged; obvious 3-way prices and
outlier books are dropped. **Edge = model − fair market probability.** A pick is a **Value Pick** only when the edge
is at least your threshold (default 3%). Confidence:

- **High:** edge ≥ 2 × threshold with at most one uncertainty flag
- **Medium:** edge ≥ threshold with at most two flags
- **Low:** everything else

Uncertainty flags: fewer than 10 games stored for a team, unconfirmed goalies, and model vs market disagreeing by
more than 12 points (often injury or lineup news the model can't see). Without odds, confidence comes from how far
the probability is from 50%.

**Best Pick** per game = the largest Value edge; otherwise the best positive-EV price; otherwise the strongest lean.
Stake suggestions use fractional Kelly: `f = (b·p − q) / b × fraction`, capped at your max stake.

### Honesty layer

Every pick shown for an upcoming game is logged and frozen at puck drop, then graded from the final score
(props are void if the player didn't dress). The Model page shows hit rate vs what the model predicted, ROI at flat
stakes, and calibration in 10% buckets for live picks and for the walk-forward backtest (refit at the start of each
month on earlier games only).

### Known limitations

- No injury, lineup or line-combination data: the model can't see a star scratched an hour before the game.
- Starting goalies are projected until the box score confirms them; the NHL API has no "confirmed starter" feed.
- Shots are a rough xG proxy; there's no shot-quality data in the free API.
- The empty-net factor and home/rest goal factors are fixed constants, not fitted.

## Data and caching

All API calls go through `src/lib/nhl/client.ts`, which follows redirects (the `/now` endpoints answer with a 307)
and caches responses in SQLite: schedules, standings and stats for 15 minutes, live games for 30 seconds, finished
games forever. If the API is down, pages show the last good copy with a "data stale since …" banner instead of failing.

`/fixtures` holds sample responses that the TypeScript types (`src/lib/nhl/types.ts`) were written from; see
`fixtures/README.md` for how they were captured. Run `npm run fixtures` to replace them with full raw responses.
`NHL_OFFLINE=fixtures npm run dev` serves the app from those files without network access.

## Tests

```bash
npm test          # odds conversion, margin removal, Kelly, Poisson, totals/puck line, settlement
npm run typecheck
```
