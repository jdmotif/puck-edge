// Builds everything the Tonight dashboard and game previews show: predictions, market odds,
// picks with edge, confidence and plain-language reasons (English or French). Also logs picks for model tracking.
import { sqlite } from "@/db";
import { api, seasonFor, type Fetched } from "@/lib/nhl/client";
import type { GameLandingResponse, MatchupGoalieLeader, ScheduleGame, StandingRow } from "@/lib/nhl/types";
import { leagueAsOf, predictGame, expectedGoals, type GamePrediction } from "@/lib/model/engine";
import { kellyFraction, expectedValue } from "@/lib/model/math";
import { projectProps, type PropProjection } from "@/lib/model/props";
import { fetchOddsApi, marketFor, type MarketOdds, type SidePrice } from "@/lib/odds";
import { getSettings, type Settings } from "@/lib/settings";
import { bankrollNow } from "@/lib/data/bankroll";
import type { Market } from "@/lib/grading";
import { i18n, type Locale, type Messages } from "@/lib/i18n";

export type Confidence = "High" | "Medium" | "Low";

export interface Pick {
  market: Market;
  selection: string; // team abbrev | "over" | "under" | player id
  label: string; // display label in the slate's language: "TBL moneyline", "Over 6.5", "PHI +1.5", "McDavid anytime goal"
  logLabel: string; // the same in English, which is what gets stored with logged picks and bets
  line: number | null;
  modelProb: number;
  marketProb: number | null;
  odds: number | null; // best decimal price
  book: string | null;
  edge: number | null;
  ev: number | null;
  isValue: boolean;
  confidence: Confidence;
  reasons: string[];
  stake: number | null; // suggested stake (fractional Kelly), in bankroll currency
}

export interface GoalieInfo {
  id: number | null;
  name: string;
  savePct: number | null;
  gaa: number | null;
  record: string | null;
  status: "confirmed" | "projected" | "unknown";
}

export interface TeamSide {
  abbrev: string;
  name: string;
  record: string;
  l10: string;
  streak: string;
  restDays: number | null;
  backToBack: boolean;
  goalie: GoalieInfo;
  winProb: number;
  expGoals: number;
}

export interface GameCard {
  game: ScheduleGame;
  away: TeamSide;
  home: TeamSide;
  prediction: GamePrediction;
  market: MarketOdds;
  picks: Pick[];
  best: Pick | null;
  props: PropProjection[];
  propPicks: Pick[];
  uncertainty: string[];
  locked: boolean; // game started: picks frozen
  live: { away: number; home: number; status: string } | null;
}

export interface Slate {
  date: string;
  cards: GameCard[];
  sources: Fetched<unknown>[];
  oddsNote: string;
  modelFitted: boolean;
  modelGames: number;
  hasHistory: boolean; // any stored games to judge teams by
}

const DONE = new Set(["OFF", "FINAL"]);
const STARTED = new Set(["LIVE", "CRIT", "OFF", "FINAL"]);
const DEFAULT_TOTAL_LINE = 6.5;

function standingFor(rows: StandingRow[] | undefined, abbrev: string) {
  return rows?.find((r) => r.teamAbbrev.default === abbrev);
}

function goalieFrom(landing: GameLandingResponse | null, side: "homeTeam" | "awayTeam", projectedId: number | null, confirmedId: number | null, tbd: string): GoalieInfo {
  const leaders: MatchupGoalieLeader[] = landing?.matchup?.goalieComparison?.[side]?.leaders ?? [];
  const id = confirmedId ?? (projectedId && leaders.some((l) => l.playerId === projectedId) ? projectedId : leaders[0]?.playerId ?? projectedId);
  const l = leaders.find((x) => x.playerId === id);
  return {
    id: id ?? null,
    name: l ? `${l.firstName.default} ${l.lastName.default}` : id ? storedName(id) : tbd,
    savePct: l?.savePctg ?? null,
    gaa: l?.gaa ?? null,
    record: l?.record ?? null,
    status: confirmedId ? "confirmed" : id ? "projected" : "unknown",
  };
}

function storedName(id: number) {
  const r = sqlite.prepare("SELECT name FROM player_games WHERE player_id = ? ORDER BY date DESC LIMIT 1").get(id) as { name: string } | undefined;
  return r?.name ?? `#${id}`;
}

function confidenceFor(edge: number | null, prob: number, threshold: number, uncertainty: number): Confidence {
  if (edge !== null) {
    if (edge >= 2 * threshold && uncertainty <= 1) return "High";
    if (edge >= threshold && uncertainty <= 2) return "Medium";
    return "Low";
  }
  const lean = Math.abs(prob - 0.5);
  if (lean >= 0.15 && uncertainty === 0) return "High";
  if (lean >= 0.08 && uncertainty <= 1) return "Medium";
  return "Low";
}

function priced(modelProb: number, side: SidePrice | undefined, settings: Settings, bankroll: number) {
  if (!side) return { marketProb: null, odds: null, book: null, edge: null, ev: null, stake: null };
  const edge = modelProb - side.fair;
  const k = kellyFraction(modelProb, side.best, settings.kellyFraction, settings.maxStakePct);
  return {
    marketProb: side.fair,
    odds: side.best,
    book: side.bestBook,
    edge,
    ev: expectedValue(modelProb, side.best),
    stake: k > 0 ? Math.round(k * bankroll * 100) / 100 : 0,
  };
}

/** Reasons for a team-side pick, strongest first, from the model's own feature contributions. */
function teamReasons(
  sideIsHome: boolean,
  p: GamePrediction,
  card: { home: TeamSide; away: TeamSide },
  hot: Map<string, PropProjection | undefined>,
  marketProb: number | null,
  M: Messages,
): string[] {
  const us = sideIsHome ? card.home : card.away;
  const them = sideIsHome ? card.away : card.home;
  const usP = sideIsHome ? p.home : p.away;
  const themP = sideIsHome ? p.away : p.home;
  const sign = sideIsHome ? 1 : -1;
  const W = M.why;
  const scored: { w: number; text: string }[] = [];
  for (const c of p.contributions) {
    const w = c.value * sign;
    if (w <= 0.01) continue;
    switch (c.feature) {
      case "homeIce":
        scored.push({ w, text: W.homeIce(us.abbrev) });
        break;
      case "form":
        scored.push({ w, text: W.form(us.abbrev, us.l10, them.abbrev, them.l10) });
        break;
      case "shotShare":
        scored.push({ w, text: W.shotShare(us.abbrev, usP.shotShare, them.abbrev, themP.shotShare) });
        break;
      case "goalDiff":
        scored.push({ w, text: W.goalDiff(usP.gdpg, themP.gdpg) });
        break;
      case "backToBack":
        scored.push({ w: w + 0.05, text: them.backToBack ? W.themB2B(them.abbrev) : W.rested(us.abbrev, them.abbrev) });
        break;
      case "rest":
        if (us.restDays !== null && them.restDays !== null) scored.push({ w, text: W.rest(us.abbrev, us.restDays, them.restDays) });
        break;
      case "goalie":
        scored.push({ w, text: W.goalieEdge(W.goalieName(us.goalie.name, us.goalie.savePct), W.goalieName(them.goalie.name, them.goalie.savePct)) });
        break;
    }
  }
  const h = hot.get(us.abbrev);
  if (h && h.last5Gp >= 3 && h.last5Points >= h.last5Gp * 1.2) scored.push({ w: 0.02, text: W.hotPlayer(h.name.split(" ").slice(-1)[0], h.last5Points, h.last5Gp) });
  if (us.streak.startsWith("W") && Number(us.streak.slice(1)) >= 3) scored.push({ w: 0.015, text: W.winStreak(us.abbrev, Number(us.streak.slice(1))) });
  // An underdog value pick can have few factors in its favour: the reason is the price itself.
  const modelProb = sideIsHome ? p.homeWin : p.awayWin;
  if (scored.length < 3 && marketProb !== null && modelProb > marketProb) scored.push({ w: 0.001, text: W.price(us.abbrev, marketProb, modelProb) });
  if (scored.length < 3) scored.push({ w: 0, text: W.inNet(W.goalieName(us.goalie.name, us.goalie.savePct), W.goalieName(them.goalie.name, them.goalie.savePct)) });
  return scored.sort((a, b) => b.w - a.w).slice(0, 5).map((s) => s.text);
}

export async function buildSlate(date: string, locale: Locale = "en"): Promise<Slate> {
  const M = i18n(locale).t;
  const EN = i18n("en").t;
  const settings = getSettings();
  const bankroll = bankrollNow();
  const season = seasonFor(date);
  const yesterday = new Date(Date.parse(date + "T12:00:00Z") - 86_400_000).toISOString().slice(0, 10);

  const [schedule, score, standings, prevSchedule, oddsApi, partnerOdds] = await Promise.all([
    api.schedule(date),
    api.score(date),
    api.standings("now"),
    api.schedule(yesterday),
    fetchOddsApi(),
    api.partnerOdds(settings.oddsCountry),
  ]);
  const games = (schedule.data?.gameWeek.find((d) => d.date === date)?.games ?? []).filter((g) => g.gameType === 2 || g.gameType === 3 || g.gameType === 1);
  const playedYesterday = new Set(
    (prevSchedule.data?.gameWeek.find((d) => d.date === yesterday)?.games ?? []).flatMap((g) => [g.homeTeam.abbrev, g.awayTeam.abbrev]),
  );
  const partners = score.data?.oddsPartners ?? [];
  const partnerBook = partnerOdds.data?.bettingPartner.name ?? "";
  const partnerGames = new Map((partnerOdds.data?.games ?? []).map((pg) => [pg.gameId, pg]));
  const scoreById = new Map((score.data?.games ?? []).map((g) => [g.id, g]));

  const league = leagueAsOf(date, season);
  const teams = [...new Set(games.flatMap((g) => [g.homeTeam.abbrev, g.awayTeam.abbrev]))];
  const [landings, boxes, clubStats] = await Promise.all([
    Promise.all(games.map((g) => api.landing(g.id))),
    Promise.all(games.map((g) => (STARTED.has(g.gameState) ? api.boxscore(g.id) : Promise.resolve(null)))),
    Promise.all(teams.map((t) => api.clubStats(t))),
  ]);
  const statsByTeam = new Map(teams.map((t, i) => [t, clubStats[i].data?.skaters ?? []]));
  const lgGoals = league.leagueGoalsPerTeamGame();
  // Without stored games every team looks average, so edges are just the market's own spread.
  const hasHistory = league.totals.games > 0 || league.prevTeams.size > 0;
  const lgSv = league.leagueSavePct();

  const cards: GameCard[] = games.map((g, i) => {
    const landing = landings[i].data;
    const box = boxes[i]?.data ?? null;
    const starter = (side: "homeTeam" | "awayTeam") => box?.playerByGameStats?.[side].goalies.find((x) => x.starter)?.playerId ?? null;
    const hProj = league.projectedStarter(g.homeTeam.abbrev, date);
    const aProj = league.projectedStarter(g.awayTeam.abbrev, date);
    const homeGoalie = goalieFrom(landing, "homeTeam", hProj, starter("homeTeam"), M.common.tbd);
    const awayGoalie = goalieFrom(landing, "awayTeam", aProj, starter("awayTeam"), M.common.tbd);

    // The NHL schedule is the source of truth for back-to-backs even before the backfill has run.
    const pred = predictGame(
      {
        home: g.homeTeam.abbrev,
        away: g.awayTeam.abbrev,
        date,
        homeGoalieId: homeGoalie.id,
        awayGoalieId: awayGoalie.id,
        homeB2B: playedYesterday.has(g.homeTeam.abbrev),
        awayB2B: playedYesterday.has(g.awayTeam.abbrev),
      },
      league,
    );
    // Fall back to the landing page's numbers when the goalie isn't in our stored games yet.
    if (homeGoalie.savePct === null && pred.homeGoalie.shots > 0) homeGoalie.savePct = pred.homeGoalie.savePct;
    if (awayGoalie.savePct === null && pred.awayGoalie.shots > 0) awayGoalie.savePct = pred.awayGoalie.savePct;

    const xg = expectedGoals(pred.home, pred.away, pred.homeGoalie, pred.awayGoalie, league);
    const side = (abbrev: string, isHome: boolean, goalie: GoalieInfo): TeamSide => {
      const st = standingFor(standings.data?.standings, abbrev);
      const prof = isHome ? pred.home : pred.away;
      return {
        abbrev,
        name: (isHome ? g.homeTeam : g.awayTeam).commonName.default,
        record: st ? `${st.wins}-${st.losses}-${st.otLosses}` : `${prof.record.w}-${prof.record.l}-${prof.record.otl}`,
        l10: st ? `${st.l10Wins}-${st.l10Losses}-${st.l10OtLosses}` : `${prof.l10.w}-${prof.l10.l}-${prof.l10.otl}`,
        streak: st?.streakCode ? `${st.streakCode}${st.streakCount}` : prof.streak ? `${prof.streak.code}${prof.streak.count}` : "–",
        restDays: prof.gp ? prof.restDays : null,
        backToBack: prof.backToBack,
        goalie,
        winProb: isHome ? pred.homeWin : pred.awayWin,
        expGoals: isHome ? pred.lambdaHome : pred.lambdaAway,
      };
    };
    const home = side(g.homeTeam.abbrev, true, homeGoalie);
    const away = side(g.awayTeam.abbrev, false, awayGoalie);
    const pg = partnerGames.get(g.id);
    const market = marketFor(g, partners, oddsApi.events, pg && { game: pg, book: partnerBook }, settings.oddsCountry);

    // Uncertainty flags feed the confidence tier.
    const uncertainty: string[] = [];
    if (!hasHistory) uncertainty.push(M.uncertainty.noHistory);
    else if (Math.min(pred.home.gp, pred.away.gp) < 10) uncertainty.push(M.uncertainty.smallSample);
    if (homeGoalie.status !== "confirmed" || awayGoalie.status !== "confirmed") uncertainty.push(M.uncertainty.goalies);
    if (market.moneyline && Math.abs(pred.homeWin - market.moneyline.home.fair) > 0.12) uncertainty.push(M.uncertainty.disagree);

    const ctx = (isHome: boolean) => ({
      season,
      isHome,
      opponent: isHome ? pred.away : pred.home,
      opponentGoalie: { ...(isHome ? pred.awayGoalie : pred.homeGoalie), name: (isHome ? awayGoalie : homeGoalie).name },
      teamExpectedGoals: isHome ? xg.home : xg.away,
      teamAvgGoals: (isHome ? pred.home : pred.away).gfpg,
      leagueGoals: lgGoals,
      leagueSavePct: lgSv,
    });
    const props = [
      ...projectProps(statsByTeam.get(home.abbrev) ?? [], home.abbrev, ctx(true), M.why).slice(0, 8),
      ...projectProps(statsByTeam.get(away.abbrev) ?? [], away.abbrev, ctx(false), M.why).slice(0, 8),
    ];
    const hot = new Map([home.abbrev, away.abbrev].map((t) => [t, props.filter((p) => p.team === t).sort((a, b) => b.last5Points - a.last5Points)[0]]));

    const u = uncertainty.length;
    const picks: Pick[] = [];
    const cardSides = { home, away };

    // Moneyline: the side with more value (or the model's favourite when there are no odds).
    {
      const hp = priced(pred.homeWin, market.moneyline?.home, settings, bankroll);
      const ap = priced(pred.awayWin, market.moneyline?.away, settings, bankroll);
      const homeSide = market.moneyline ? (hp.edge ?? 0) >= (ap.edge ?? 0) : pred.homeWin >= 0.5;
      const s = homeSide ? hp : ap;
      const prob = homeSide ? pred.homeWin : pred.awayWin;
      const abbrev = homeSide ? home.abbrev : away.abbrev;
      picks.push({
        market: "moneyline",
        selection: abbrev,
        label: M.label.moneyline(abbrev),
        logLabel: EN.label.moneyline(abbrev),
        line: null,
        modelProb: prob,
        ...s,
        isValue: hasHistory && s.edge !== null && s.edge >= settings.edgeThreshold,
        confidence: confidenceFor(s.edge, prob, settings.edgeThreshold, u),
        reasons: teamReasons(homeSide, pred, cardSides, hot, s.marketProb ?? null, M),
      });
    }

    // Totals at the market line (or 6.5 when we have no line).
    {
      const line = market.total?.line ?? DEFAULT_TOTAL_LINE;
      const t = pred.totals(line);
      const op = priced(t.over / (1 - t.push), market.total?.over, settings, bankroll);
      const up = priced(t.under / (1 - t.push), market.total?.under, settings, bankroll);
      const over = market.total ? (op.edge ?? 0) >= (up.edge ?? 0) : t.over >= t.under;
      const s = over ? op : up;
      const prob = (over ? t.over : t.under) / (1 - t.push);
      const W = M.why;
      const reasons = [
        W.projected(pred.expTotal, home.abbrev, pred.lambdaHome, away.abbrev, pred.lambdaAway),
        W.gfga(home.abbrev, pred.home.gfpg, pred.home.gapg, away.abbrev, pred.away.gfpg, pred.away.gapg),
        W.leagueAvg(2 * lgGoals),
      ];
      const goalies = [homeGoalie, awayGoalie].filter((gl) => gl.savePct).map((gl) => W.goalieSv(gl.name, gl.savePct!));
      if (goalies.length) reasons.push(W.inNetList(goalies));
      if (home.backToBack || away.backToBack) reasons.push(W.totalB2B([home, away].filter((x) => x.backToBack).map((x) => x.abbrev)));
      if (!market.total) reasons.push(W.noMarketTotal(DEFAULT_TOTAL_LINE));
      picks.push({
        market: "total",
        selection: over ? "over" : "under",
        label: M.label.total(over, line),
        logLabel: EN.label.total(over, line),
        line,
        modelProb: prob,
        ...s,
        isValue: hasHistory && s.edge !== null && s.edge >= settings.edgeThreshold,
        confidence: confidenceFor(s.edge, prob, settings.edgeThreshold, u),
        reasons: reasons.slice(0, 5),
      });
    }

    // Puck line: favourite −1.5 or underdog +1.5.
    {
      const pl = pred.puckLine;
      const homeFav = pred.homeWin >= 0.5;
      const homeLine = market.puckline?.homeLine ?? (homeFav ? -1.5 : 1.5);
      const homeProb = homeLine < 0 ? pl.homeMinus15 : pl.homePlus15;
      const awayProb = 1 - homeProb;
      const hp = priced(homeProb, market.puckline?.home, settings, bankroll);
      const ap = priced(awayProb, market.puckline?.away, settings, bankroll);
      const homeSide = market.puckline ? (hp.edge ?? 0) >= (ap.edge ?? 0) : homeProb >= 0.5;
      const s = homeSide ? hp : ap;
      const prob = homeSide ? homeProb : awayProb;
      const t = homeSide ? home : away;
      const line = homeSide ? homeLine : -homeLine;
      const fav = homeFav ? home : away;
      picks.push({
        market: "puckline",
        selection: t.abbrev,
        label: M.label.puckline(t.abbrev, line),
        logLabel: EN.label.puckline(t.abbrev, line),
        line,
        modelProb: prob,
        ...s,
        isValue: hasHistory && s.edge !== null && s.edge >= settings.edgeThreshold,
        confidence: confidenceFor(s.edge, prob, settings.edgeThreshold, u),
        reasons: [
          M.why.winBy2(fav.abbrev, homeFav ? pl.homeMinus15 : pl.awayMinus15),
          M.why.otChance(pred.regTie),
          M.why.emptyNet,
          ...teamReasons(homeSide, pred, cardSides, hot, null, M).slice(0, 2),
        ],
      });
    }

    // Props: model-only (no prop odds in the free feeds). Top two per market per game.
    const propPicks: Pick[] = [];
    const propPick = (p: PropProjection, market: "prop_goal" | "prop_point1" | "prop_point2", prob: number): Pick => ({
      market,
      selection: String(p.playerId),
      label: M.label[market](p.name),
      logLabel: EN.label[market](p.name),
      line: null,
      modelProb: prob,
      marketProb: null,
      odds: null,
      book: null,
      edge: null,
      ev: null,
      isValue: false,
      confidence: confidenceFor(null, prob, settings.edgeThreshold, u + (p.gp < 10 ? 1 : 0)),
      reasons: p.reasons.slice(0, 5),
      stake: null,
    });
    for (const p of [...props].sort((a, b) => b.pGoal - a.pGoal).slice(0, 2)) propPicks.push(propPick(p, "prop_goal", p.pGoal));
    for (const p of [...props].sort((a, b) => b.pPoint1 - a.pPoint1).slice(0, 2)) propPicks.push(propPick(p, "prop_point1", p.pPoint1));
    for (const p of [...props].sort((a, b) => b.pPoint2 - a.pPoint2).slice(0, 1)) propPicks.push(propPick(p, "prop_point2", p.pPoint2));

    // Best pick: biggest value edge; otherwise best EV; otherwise the strongest lean.
    const values = picks.filter((p) => p.isValue).sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
    const withOdds = picks.filter((p) => p.ev !== null).sort((a, b) => (b.ev ?? 0) - (a.ev ?? 0));
    const best = values[0] ?? (withOdds[0] && (withOdds[0].ev ?? 0) > 0 ? withOdds[0] : null) ?? [...picks].sort((a, b) => Math.abs(b.modelProb - 0.5) - Math.abs(a.modelProb - 0.5))[0];

    return {
      game: { ...g, gameState: scoreById.get(g.id)?.gameState ?? g.gameState },
      away,
      home,
      prediction: pred,
      market,
      picks,
      best: best ?? null,
      props,
      propPicks,
      uncertainty,
      locked: STARTED.has(scoreById.get(g.id)?.gameState ?? g.gameState) || Date.parse(g.startTimeUTC) <= Date.now(),
      live: liveOf(scoreById.get(g.id), M),
    };
  });

  const params = pred0(cards);
  return {
    date,
    cards,
    sources: [schedule, score, standings, ...landings, ...clubStats] as Fetched<unknown>[],
    oddsNote: process.env.ODDS_API_KEY
      ? oddsApi.error
        ? M.odds.apiError(oddsApi.error)
        : M.odds.api
      : partnerGames.size
        ? M.odds.partner(partnerBook, settings.oddsCountry)
        : M.odds.none,
    modelFitted: params.fitted,
    modelGames: params.n,
    hasHistory: cards.length ? hasHistory : true,
  };
}

function liveOf(s: import("@/lib/nhl/types").ScoreGame | undefined, M: Messages): GameCard["live"] {
  if (!s || !STARTED.has(s.gameState) || s.awayTeam.score === undefined || s.homeTeam.score === undefined) return null;
  const done = DONE.has(s.gameState);
  const pd = s.periodDescriptor;
  const period = pd ? M.status.period(pd.number, pd.periodType) : "";
  const status = done
    ? M.status.final(s.gameOutcome?.lastPeriodType)
    : s.clock?.inIntermission
      ? M.status.intermission(period)
      : `${period} ${s.clock?.timeRemaining ?? ""}`.trim();
  return { away: s.awayTeam.score, home: s.homeTeam.score, status };
}

function pred0(cards: GameCard[]) {
  return cards[0]?.prediction.params ?? { fitted: false, n: 0 };
}

/** Save the current pre-game picks so they can be graded later. Frozen once the game starts. */
export function logPicks(slate: Slate) {
  const now = Date.now();
  const firstSeen = sqlite.prepare("SELECT MIN(created_at) AS c FROM picks WHERE game_id = ? AND market = ?");
  const del = sqlite.prepare("DELETE FROM picks WHERE game_id = ? AND result IS NULL");
  const ins = sqlite.prepare(`INSERT INTO picks
    (game_id, game_date, start_utc, market, selection, selection_label, line, model_prob, market_prob, odds_decimal, edge, confidence, is_value, is_best, reasons, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = sqlite.transaction(() => {
    for (const c of slate.cards) {
      if (c.locked || DONE.has(c.game.gameState)) continue;
      if (c.game.gameType !== 2 && c.game.gameType !== 3) continue; // don't track preseason
      const created = new Map<string, number>();
      for (const p of [...c.picks, ...c.propPicks]) {
        const r = firstSeen.get(c.game.id, p.market) as { c: number | null };
        created.set(p.market, r.c ?? now);
      }
      del.run(c.game.id);
      for (const p of [...c.picks, ...c.propPicks]) {
        ins.run(
          c.game.id,
          slate.date,
          c.game.startTimeUTC,
          p.market,
          p.selection,
          p.logLabel,
          p.line,
          p.modelProb,
          p.marketProb,
          p.odds,
          p.edge,
          p.confidence,
          p.isValue ? 1 : 0,
          c.best === p ? 1 : 0,
          JSON.stringify(p.reasons),
          created.get(p.market) ?? now,
          now,
        );
      }
    }
  });
  tx();
}
