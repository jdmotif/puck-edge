import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";

// Raw API responses with the time they were fetched. Lets pages fall back to the last good copy.
export const apiCache = sqliteTable("api_cache", {
  key: text("key").primaryKey(),
  body: text("body").notNull(),
  fetchedAt: integer("fetched_at").notNull(), // epoch ms
  expiresAt: integer("expires_at"), // epoch ms; null = never expires (finished games)
});

// One row per completed game (regular season + playoffs), filled by the backfill.
export const games = sqliteTable(
  "games",
  {
    id: integer("id").primaryKey(),
    season: integer("season").notNull(),
    gameType: integer("game_type").notNull(),
    date: text("date").notNull(), // YYYY-MM-DD (local to the venue)
    startUtc: text("start_utc").notNull(),
    away: text("away").notNull(),
    home: text("home").notNull(),
    awayScore: integer("away_score").notNull(),
    homeScore: integer("home_score").notNull(),
    awaySog: integer("away_sog").notNull(),
    homeSog: integer("home_sog").notNull(),
    lastPeriodType: text("last_period_type").notNull(), // REG | OT | SO
    awayGoalieId: integer("away_goalie_id"),
    homeGoalieId: integer("home_goalie_id"),
    venue: text("venue"),
  },
  (t) => [index("games_date_idx").on(t.date), index("games_season_idx").on(t.season)],
);

// Per-player box score lines, from the same backfill. Powers game logs, hot/cold and props.
export const playerGames = sqliteTable(
  "player_games",
  {
    gameId: integer("game_id").notNull(),
    playerId: integer("player_id").notNull(),
    name: text("name").notNull(),
    team: text("team").notNull(),
    opponent: text("opponent").notNull(),
    isHome: integer("is_home", { mode: "boolean" }).notNull(),
    date: text("date").notNull(),
    season: integer("season").notNull(),
    position: text("position").notNull(),
    goals: integer("goals").notNull().default(0),
    assists: integer("assists").notNull().default(0),
    points: integer("points").notNull().default(0),
    shots: integer("shots").notNull().default(0),
    ppGoals: integer("pp_goals").notNull().default(0),
    toiSec: integer("toi_sec").notNull().default(0),
    // goalies
    shotsAgainst: integer("shots_against"),
    saves: integer("saves"),
    goalsAgainst: integer("goals_against"),
    starter: integer("starter", { mode: "boolean" }),
  },
  (t) => [
    primaryKey({ columns: [t.gameId, t.playerId] }),
    index("pg_player_idx").on(t.playerId, t.date),
    index("pg_team_idx").on(t.team, t.date),
  ],
);

// Every pick the model publishes before puck drop, graded afterwards.
export const picks = sqliteTable(
  "picks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    gameId: integer("game_id").notNull(),
    gameDate: text("game_date").notNull(),
    startUtc: text("start_utc").notNull(),
    market: text("market").notNull(), // moneyline | total | puckline | prop_goal | prop_point1 | prop_point2
    selection: text("selection").notNull(), // team abbrev, "over"/"under", or player id
    selectionLabel: text("selection_label").notNull(),
    line: real("line"),
    modelProb: real("model_prob").notNull(),
    marketProb: real("market_prob"),
    oddsDecimal: real("odds_decimal"),
    edge: real("edge"),
    confidence: text("confidence").notNull(),
    isValue: integer("is_value", { mode: "boolean" }).notNull().default(false),
    isBest: integer("is_best", { mode: "boolean" }).notNull().default(false),
    reasons: text("reasons").notNull(), // JSON string[]
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    result: text("result"), // win | loss | push | void
    gradedAt: integer("graded_at"),
  },
  (t) => [index("picks_game_idx").on(t.gameId)],
);

// Walk-forward predictions on past games (no odds) so calibration exists from day one.
export const backtest = sqliteTable("backtest", {
  gameId: integer("game_id").primaryKey(),
  season: integer("season").notNull(),
  date: text("date").notNull(),
  homeWinProb: real("home_win_prob").notNull(),
  homeWon: integer("home_won", { mode: "boolean" }).notNull(),
  expTotal: real("exp_total").notNull(),
  actualTotal: integer("actual_total").notNull(),
  over55Prob: real("over55_prob").notNull(),
  homeCover15Prob: real("home_cover15_prob").notNull(),
});

// Goal scorers and three stars for the results page (from gamecenter landing).
export const gameDetails = sqliteTable("game_details", {
  gameId: integer("game_id").primaryKey(),
  goals: text("goals").notNull(), // JSON GoalSummary[]
  stars: text("stars").notNull(), // JSON StarSummary[]
});

export const bets = sqliteTable("bets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull(),
  gameId: integer("game_id").notNull(),
  gameDate: text("game_date").notNull(),
  gameLabel: text("game_label").notNull(),
  market: text("market").notNull(), // moneyline | total | puckline | prop_goal | prop_point1 | prop_point2
  selection: text("selection").notNull(),
  selectionLabel: text("selection_label").notNull(),
  line: real("line"),
  oddsDecimal: real("odds_decimal").notNull(),
  stake: real("stake").notNull(),
  status: text("status").notNull().default("open"), // open | won | lost | push | void
  profit: real("profit"),
  settledAt: integer("settled_at"),
  notes: text("notes"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
});

export const modelParams = sqliteTable("model_params", {
  key: text("key").primaryKey(),
  value: text("value").notNull(), // JSON
  fittedAt: integer("fitted_at").notNull(),
});

export const syncLog = sqliteTable("sync_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  gamesAdded: integer("games_added").notNull().default(0),
  message: text("message"),
});
