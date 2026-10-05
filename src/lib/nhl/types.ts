// Types for api-web.nhle.com/v1, written from the samples in /fixtures.
// Fields seen only on some records (e.g. goalie stats before a game is played) are optional.

export type Localized = { default: string } & Record<string, string>;

export type GameState = "FUT" | "PRE" | "LIVE" | "CRIT" | "FINAL" | "OFF" | (string & {});
export type PeriodType = "REG" | "OT" | "SO";

export interface PeriodDescriptor {
  number: number;
  periodType: PeriodType;
  maxRegulationPeriods: number;
}

export interface TvBroadcast {
  id: number;
  market: string;
  countryCode: string;
  network: string;
  sequenceNumber: number;
}

export interface TeamOdds {
  providerId: number;
  value: string; // "+184" (American) or "3.10" (decimal)
}

// ---------- schedule/{date} ----------
export interface ScheduleTeam {
  id: number;
  commonName: Localized;
  placeName: Localized;
  placeNameWithPreposition?: Localized;
  abbrev: string;
  logo: string;
  darkLogo: string;
  awaySplitSquad?: boolean;
  homeSplitSquad?: boolean;
  radioLink?: string;
  odds?: TeamOdds[];
  score?: number;
}

export interface ScheduleGame {
  id: number;
  season: number;
  gameType: number; // 1 preseason, 2 regular, 3 playoffs
  gameDate?: string;
  venue: Localized;
  neutralSite: boolean;
  startTimeUTC: string;
  easternUTCOffset: string;
  venueUTCOffset: string;
  venueTimezone: string;
  gameState: GameState;
  gameScheduleState: string;
  tvBroadcasts: TvBroadcast[];
  awayTeam: ScheduleTeam;
  homeTeam: ScheduleTeam;
  periodDescriptor?: PeriodDescriptor;
  gameOutcome?: { lastPeriodType: PeriodType };
  winningGoalie?: { playerId: number; firstInitial: Localized; lastName: Localized };
  winningGoalScorer?: { playerId: number; firstInitial: Localized; lastName: Localized };
  ticketsLink?: string;
  gameCenterLink: string;
}

export interface ScheduleDay {
  date: string;
  dayAbbrev: string;
  numberOfGames: number;
  games: ScheduleGame[];
}

export interface ScheduleResponse {
  nextStartDate: string;
  previousStartDate: string;
  gameWeek: ScheduleDay[];
}

// ---------- score/{date} ----------
export interface ScoreTeam {
  id: number;
  name: Localized;
  abbrev: string;
  score?: number;
  sog?: number;
  logo: string;
}

export interface ScoreAssist {
  playerId: number;
  name: Localized;
  assistsToDate: number;
}

export interface ScoreGoal {
  period: number;
  periodDescriptor: PeriodDescriptor;
  timeInPeriod: string;
  playerId: number;
  name: Localized;
  firstName: Localized;
  lastName: Localized;
  goalModifier: string;
  assists: ScoreAssist[];
  mugshot: string;
  teamAbbrev: string;
  goalsToDate: number;
  awayScore: number;
  homeScore: number;
  strength: string; // "ev" | "pp" | "sh"
  highlightClip?: number;
}

export interface OddsPartner {
  partnerId: number;
  country: string;
  name: string;
  imageUrl: string;
  siteUrl: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
}

export interface ScoreGame {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  venue: Localized;
  startTimeUTC: string;
  easternUTCOffset: string;
  venueUTCOffset: string;
  tvBroadcasts: TvBroadcast[];
  gameState: GameState;
  gameScheduleState: string;
  awayTeam: ScoreTeam;
  homeTeam: ScoreTeam;
  gameCenterLink: string;
  threeMinRecap?: string;
  condensedGame?: string;
  clock?: { timeRemaining: string; secondsRemaining: number; running: boolean; inIntermission: boolean };
  neutralSite: boolean;
  venueTimezone: string;
  period?: number;
  periodDescriptor?: PeriodDescriptor;
  gameOutcome?: { lastPeriodType: PeriodType };
  goals?: ScoreGoal[];
}

export interface ScoreResponse {
  prevDate: string;
  currentDate: string;
  nextDate: string;
  gameWeek: { date: string; dayAbbrev: string; numberOfGames: number }[];
  oddsPartners?: OddsPartner[];
  games: ScoreGame[];
}

// ---------- standings ----------
export interface StandingRow {
  conferenceAbbrev: string;
  conferenceName: string;
  conferenceSequence: number;
  date: string;
  divisionAbbrev: string;
  divisionName: string;
  divisionSequence: number;
  gameTypeId: number;
  gamesPlayed: number;
  goalDifferential: number;
  goalDifferentialPctg: number;
  goalAgainst: number;
  goalFor: number;
  goalsForPctg: number;
  homeGamesPlayed: number;
  homeGoalDifferential: number;
  homeGoalsAgainst: number;
  homeGoalsFor: number;
  homeLosses: number;
  homeOtLosses: number;
  homePoints: number;
  homeWins: number;
  l10GamesPlayed: number;
  l10GoalDifferential: number;
  l10GoalsAgainst: number;
  l10GoalsFor: number;
  l10Losses: number;
  l10OtLosses: number;
  l10Points: number;
  l10Wins: number;
  leagueSequence: number;
  losses: number;
  otLosses: number;
  placeName: Localized;
  pointPctg: number;
  points: number;
  regulationPlusOtWins: number;
  regulationWins: number;
  roadGamesPlayed: number;
  roadGoalDifferential: number;
  roadGoalsAgainst: number;
  roadGoalsFor: number;
  roadLosses: number;
  roadOtLosses: number;
  roadPoints: number;
  roadWins: number;
  seasonId: number;
  shootoutLosses: number;
  shootoutWins: number;
  streakCode?: string; // "W" | "L" | "OT"
  streakCount?: number;
  teamName: Localized;
  teamCommonName: Localized;
  teamAbbrev: Localized;
  teamLogo: string;
  teamLogoDark?: string;
  wildcardSequence: number;
  winPctg: number;
  wins: number;
}

export interface StandingsResponse {
  wildCardIndicator: boolean;
  standingsDateTimeUtc: string;
  standings: StandingRow[];
}

// ---------- stats leaders ----------
export interface LeaderEntry {
  id: number;
  firstName: Localized;
  lastName: Localized;
  sweaterNumber: number;
  headshot: string;
  teamAbbrev: string;
  teamName: Localized;
  teamLogo: string;
  position: string;
  value: number;
}
export type LeadersResponse = Record<string, LeaderEntry[]>;

// ---------- club-stats/{TEAM}/now ----------
export interface ClubSkaterStats {
  playerId: number;
  headshot: string;
  firstName: Localized;
  lastName: Localized;
  positionCode: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  penaltyMinutes: number;
  powerPlayGoals: number;
  shorthandedGoals: number;
  gameWinningGoals: number;
  overtimeGoals: number;
  shots: number;
  shootingPctg: number;
  avgTimeOnIcePerGame: number; // seconds
  avgShiftsPerGame: number;
  faceoffWinPctg: number;
}

export interface ClubGoalieStats {
  playerId: number;
  headshot: string;
  firstName: Localized;
  lastName: Localized;
  gamesPlayed: number;
  gamesStarted: number;
  wins: number;
  losses: number;
  overtimeLosses: number;
  goalsAgainstAverage: number;
  savePercentage: number;
  shotsAgainst: number;
  saves: number;
  goalsAgainst: number;
  shutouts: number;
  timeOnIce: number; // seconds
}

export interface ClubStatsResponse {
  season: string;
  gameType: number;
  skaters: ClubSkaterStats[];
  goalies: ClubGoalieStats[];
}

// ---------- roster/{TEAM}/current ----------
export interface RosterPlayer {
  id: number;
  headshot: string;
  firstName: Localized;
  lastName: Localized;
  sweaterNumber?: number;
  positionCode: string;
  shootsCatches: string;
  heightInInches: number;
  weightInPounds: number;
  heightInCentimeters: number;
  weightInKilograms: number;
  birthDate: string;
  birthCity: Localized;
  birthCountry: string;
  birthStateProvince?: Localized;
}

export interface RosterResponse {
  forwards: RosterPlayer[];
  defensemen: RosterPlayer[];
  goalies: RosterPlayer[];
}

// ---------- club-schedule-season/{TEAM}/{season|now} ----------
export interface ClubScheduleResponse {
  previousSeason: number;
  currentSeason: number;
  clubTimezone: string;
  clubUTCOffset: string;
  games: ScheduleGame[];
}

// ---------- player/{id}/landing ----------
export interface PlayerSeasonLine {
  assists: number;
  gamesPlayed: number;
  goals: number;
  points: number;
  plusMinus: number;
  pim: number;
  powerPlayGoals: number;
  powerPlayPoints: number;
  shorthandedGoals: number;
  shots: number;
  shootingPctg: number;
  gameWinningGoals: number;
  otGoals: number;
  avgToi?: string;
  faceoffWinningPctg?: number;
}

export interface PlayerLast5Game {
  assists: number;
  gameDate: string;
  gameId: number;
  gameTypeId: number;
  goals: number;
  homeRoadFlag: "H" | "R";
  opponentAbbrev: string;
  pim: number;
  plusMinus: number;
  points: number;
  powerPlayGoals: number;
  shifts: number;
  shorthandedGoals: number;
  shots: number;
  teamAbbrev: string;
  toi: string;
}

export interface PlayerLanding {
  playerId: number;
  isActive: boolean;
  currentTeamId?: number;
  currentTeamAbbrev?: string;
  fullTeamName?: Localized;
  firstName: Localized;
  lastName: Localized;
  teamLogo?: string;
  sweaterNumber?: number;
  position: string;
  headshot: string;
  heroImage?: string;
  heightInInches: number;
  weightInPounds: number;
  birthDate: string;
  birthCity: Localized;
  birthCountry: string;
  shootsCatches: string;
  draftDetails?: { year: number; teamAbbrev: string; round: number; pickInRound: number; overallPick: number };
  featuredStats?: {
    season: number;
    regularSeason?: { subSeason?: Partial<PlayerSeasonLine>; career?: Partial<PlayerSeasonLine> };
  };
  careerTotals?: { regularSeason?: Partial<PlayerSeasonLine>; playoffs?: Partial<PlayerSeasonLine> };
  last5Games?: PlayerLast5Game[];
  seasonTotals?: (Partial<PlayerSeasonLine> & {
    season: number;
    gameTypeId: number;
    leagueAbbrev: string;
    sequence: number;
    teamName: Localized;
  })[];
}

// ---------- player/{id}/game-log/{season}/{gameType} ----------
export interface PlayerGameLogEntry {
  gameId: number;
  teamAbbrev: string;
  homeRoadFlag: "H" | "R";
  gameDate: string;
  goals: number;
  assists: number;
  commonName: Localized;
  opponentCommonName: Localized;
  points: number;
  plusMinus: number;
  powerPlayGoals: number;
  powerPlayPoints: number;
  gameWinningGoals: number;
  otGoals: number;
  shots: number;
  shifts: number;
  shorthandedGoals: number;
  shorthandedPoints: number;
  pim: number;
  toi: string;
  opponentAbbrev: string;
}

export interface PlayerGameLogResponse {
  seasonId: number;
  gameTypeId: number;
  playerStatsSeasons: { season: number; gameTypes: number[] }[];
  gameLog: PlayerGameLogEntry[];
}

// ---------- gamecenter/{id}/boxscore ----------
export interface BoxSkater {
  playerId: number;
  sweaterNumber: number;
  name: Localized;
  position: string;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  pim: number;
  hits: number;
  powerPlayGoals: number;
  sog: number;
  faceoffWinningPctg: number;
  toi: string;
  blockedShots: number;
  shifts: number;
  giveaways: number;
  takeaways: number;
}

export interface BoxGoalie {
  playerId: number;
  sweaterNumber: number;
  name: Localized;
  position: string;
  evenStrengthShotsAgainst: string;
  powerPlayShotsAgainst: string;
  shorthandedShotsAgainst: string;
  saveShotsAgainst: string;
  savePctg?: number;
  evenStrengthGoalsAgainst: number;
  powerPlayGoalsAgainst: number;
  shorthandedGoalsAgainst: number;
  pim: number;
  goalsAgainst: number;
  toi: string;
  starter: boolean;
  decision?: "W" | "L" | "O";
  shotsAgainst: number;
  saves: number;
}

export interface BoxTeamStats {
  forwards: BoxSkater[];
  defense: BoxSkater[];
  goalies: BoxGoalie[];
}

export interface BoxTeam {
  id: number;
  commonName: Localized;
  abbrev: string;
  score: number;
  sog: number;
  logo: string;
  darkLogo: string;
  placeName: Localized;
}

export interface BoxscoreResponse {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  venue: Localized;
  venueLocation?: Localized;
  startTimeUTC: string;
  gameState: GameState;
  gameScheduleState: string;
  periodDescriptor?: PeriodDescriptor;
  regPeriods: number;
  awayTeam: BoxTeam;
  homeTeam: BoxTeam;
  clock?: { timeRemaining: string; secondsRemaining: number; running: boolean; inIntermission: boolean };
  playerByGameStats?: { awayTeam: BoxTeamStats; homeTeam: BoxTeamStats };
  gameOutcome?: { lastPeriodType: PeriodType };
}

// ---------- gamecenter/{id}/landing ----------
export interface MatchupGoalieLeader {
  playerId: number;
  name: Localized;
  firstName: Localized;
  lastName: Localized;
  sweaterNumber: number;
  headshot: string;
  positionCode: string;
  gamesPlayed?: number;
  seasonPoints?: number;
  record?: string;
  gaa?: number;
  savePctg?: number;
  shutouts?: number;
}

export interface MatchupGoalieSide {
  teamTotals: { record: string; gaa: number; savePctg: number; shutouts: number; gamesPlayed: number };
  leaders: MatchupGoalieLeader[];
}

export interface LandingGoal {
  situationCode: string;
  eventId: number;
  strength: string;
  playerId: number;
  firstName: Localized;
  lastName: Localized;
  name: Localized;
  teamAbbrev: Localized;
  headshot: string;
  goalsToDate: number;
  awayScore: number;
  homeScore: number;
  leadingTeamAbbrev?: Localized;
  timeInPeriod: string;
  shotType: string;
  goalModifier: string;
  assists: { playerId: number; firstName: Localized; lastName: Localized; name: Localized; assistsToDate: number; sweaterNumber: number }[];
  isHome: boolean;
}

export interface ThreeStar {
  star: number;
  playerId: number;
  teamAbbrev: string;
  headshot: string;
  name: Localized;
  sweaterNo: number;
  position: string;
  goals?: number;
  assists?: number;
  points?: number;
  // goalies
  goalsAgainstAverage?: number;
  savePctg?: number;
}

export interface GameLandingResponse {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  venue: Localized;
  venueLocation?: Localized;
  startTimeUTC: string;
  venueTimezone: string;
  gameState: GameState;
  gameScheduleState: string;
  periodDescriptor?: PeriodDescriptor;
  awayTeam: BoxTeam & { record?: string };
  homeTeam: BoxTeam & { record?: string };
  matchup?: {
    season: number;
    gameType: number;
    goalieComparison?: { contextLabel: string; contextSeason: number; homeTeam: MatchupGoalieSide; awayTeam: MatchupGoalieSide };
    skaterComparison?: {
      contextLabel: string;
      leaders: { category: string; awayLeader: { playerId: number; name: Localized; value: number }; homeLeader: { playerId: number; name: Localized; value: number } }[];
    };
  };
  summary?: {
    scoring: { periodDescriptor: PeriodDescriptor; goals: LandingGoal[] }[];
    threeStars: ThreeStar[];
    penalties?: unknown[];
  };
  clock?: { timeRemaining: string; secondsRemaining: number; running: boolean; inIntermission: boolean };
}

// ---------- partner-game/{country}/now ----------
export interface PartnerGameResponse {
  currentOddsDate: string;
  lastUpdatedUTC: string;
  bettingPartner: OddsPartner;
  games: {
    gameId: number;
    gameType: number;
    startTimeUTC: string;
    homeTeam: { id: number; name: Localized; abbrev: string; logo: string; odds: { description: string; value: number; qualifier: string }[] };
    awayTeam: { id: number; name: Localized; abbrev: string; logo: string; odds: { description: string; value: number; qualifier: string }[] };
  }[];
}
