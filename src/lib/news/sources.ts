export interface NewsSource {
  id: string;
  name: string;
  url: string;
  format: "rss" | "espn" | "nhl";
}

// Free public feeds, no key needed.
export const SOURCES: NewsSource[] = [
  { id: "nhl", name: "NHL.com", url: "https://forge-dapi.d3.nhle.com/v2/content/en-us/stories?$limit=30", format: "nhl" },
  { id: "espn", name: "ESPN", url: "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news?limit=30", format: "espn" },
  { id: "sportsnet", name: "Sportsnet", url: "https://www.sportsnet.ca/hockey/nhl/feed/", format: "rss" },
];
