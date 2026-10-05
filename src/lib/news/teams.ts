// Tags articles with the NHL teams they mention, by full name or nickname.

const TEAMS: [abbrev: string, place: string, nickname: string][] = [
  ["ANA", "Anaheim", "Ducks"],
  ["BOS", "Boston", "Bruins"],
  ["BUF", "Buffalo", "Sabres"],
  ["CAR", "Carolina", "Hurricanes"],
  ["CBJ", "Columbus", "Blue Jackets"],
  ["CGY", "Calgary", "Flames"],
  ["CHI", "Chicago", "Blackhawks"],
  ["COL", "Colorado", "Avalanche"],
  ["DAL", "Dallas", "Stars"],
  ["DET", "Detroit", "Red Wings"],
  ["EDM", "Edmonton", "Oilers"],
  ["FLA", "Florida", "Panthers"],
  ["LAK", "Los Angeles", "Kings"],
  ["MIN", "Minnesota", "Wild"],
  ["MTL", "Montreal", "Canadiens"],
  ["NJD", "New Jersey", "Devils"],
  ["NSH", "Nashville", "Predators"],
  ["NYI", "New York", "Islanders"],
  ["NYR", "New York", "Rangers"],
  ["OTT", "Ottawa", "Senators"],
  ["PHI", "Philadelphia", "Flyers"],
  ["PIT", "Pittsburgh", "Penguins"],
  ["SEA", "Seattle", "Kraken"],
  ["SJS", "San Jose", "Sharks"],
  ["STL", "St. Louis", "Blues"],
  ["TBL", "Tampa Bay", "Lightning"],
  ["TOR", "Toronto", "Maple Leafs"],
  ["UTA", "Utah", "Mammoth"],
  ["VAN", "Vancouver", "Canucks"],
  ["VGK", "Vegas", "Golden Knights"],
  ["WPG", "Winnipeg", "Jets"],
  ["WSH", "Washington", "Capitals"],
];

// Nicknames that are also everyday words or other leagues' teams ("wild card", "three stars",
// NFL Jets/Panthers, MLB Rangers) only count when the full name is used.
const AMBIGUOUS = new Set(["Wild", "Stars", "Kings", "Jets", "Blues", "Rangers", "Panthers", "Lightning", "Flames", "Devils", "Sharks", "Ducks"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

const MATCHERS = TEAMS.map(([abbrev, place, nick]) => {
  const full = `${esc(place)}\\s+${esc(nick)}`;
  // Case-sensitive so "the wild finish" or "kings of the ice" don't match.
  const re = AMBIGUOUS.has(nick) ? new RegExp(`\\b${full}\\b`) : new RegExp(`\\b(?:${full}|${esc(nick)})\\b`);
  return { abbrev, re };
});

export const TEAM_ABBREVS = TEAMS.map(([a]) => a).sort();
export const teamName = (abbrev: string) => {
  const t = TEAMS.find(([a]) => a === abbrev);
  return t ? `${t[1]} ${t[2]}` : abbrev;
};

export function tagTeams(...texts: (string | undefined)[]): string[] {
  const text = fold(texts.filter(Boolean).join(" \n "));
  return MATCHERS.filter((m) => m.re.test(text)).map((m) => m.abbrev);
}
