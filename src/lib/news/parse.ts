// Turns each feed's own format into one article shape. Parsers are lenient: a field that's
// missing is left out, and an item without a title or link is dropped.
import { tagTeams } from "./teams";

export interface NewsItem {
  id: string; // the article URL
  source: string; // feed id, e.g. "espn"
  title: string;
  summary?: string;
  url: string;
  image?: string;
  publishedAt: number; // epoch ms; 0 when the feed didn't say
  teams: string[]; // team abbrevs mentioned
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Plain text from an HTML fragment, whitespace collapsed, cut to `max` characters. */
export function plainText(html: string | undefined, max = 280): string | undefined {
  if (!html) return undefined;
  const text = decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > max ? text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…" : text;
}

const toMs = (s: unknown): number => {
  const t = typeof s === "string" || typeof s === "number" ? new Date(s).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

const httpUrl = (s: unknown): string | undefined => (typeof s === "string" && /^https?:\/\//i.test(s.trim()) ? s.trim() : undefined);

function item(source: string, f: { title?: string; url?: string; summary?: string; image?: string; published?: unknown }): NewsItem | null {
  const title = plainText(f.title, 300);
  const url = httpUrl(f.url);
  if (!title || !url) return null;
  const summary = plainText(f.summary);
  return {
    id: url,
    source,
    title,
    summary: summary && summary !== title ? summary : undefined,
    url,
    image: httpUrl(f.image),
    publishedAt: toMs(f.published),
    teams: tagTeams(title, summary),
  };
}

const compact = (xs: (NewsItem | null)[]) => xs.filter((x): x is NewsItem => x !== null);

// ---- RSS 2.0 / Atom ----

function tag(xml: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  if (!m) return undefined;
  const cdata = m[1].match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  return cdata ? cdata[1] : decodeEntities(m[1]);
}

function attr(xml: string, name: string, attribute: string, where?: RegExp): string | undefined {
  for (const m of xml.matchAll(new RegExp(`<${name}\\b([^>]*)/?>`, "gi"))) {
    if (where && !where.test(m[1])) continue;
    const a = m[1].match(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
    if (a) return decodeEntities(a[1]);
  }
  return undefined;
}

export function parseRss(source: string, xml: string): NewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]);
  return compact(
    blocks.map((b) => {
      const description = tag(b, "description") ?? tag(b, "summary") ?? tag(b, "content:encoded") ?? tag(b, "content");
      const image =
        attr(b, "media:content", "url", /medium\s*=\s*["']image|type\s*=\s*["']image|\.(jpe?g|png|webp)/i) ??
        attr(b, "media:thumbnail", "url") ??
        attr(b, "enclosure", "url", /type\s*=\s*["']image/i) ??
        (tag(b, "content:encoded") ?? description ?? "").match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];
      return item(source, {
        title: tag(b, "title"),
        url: tag(b, "link")?.trim() || attr(b, "link", "href", /rel\s*=\s*["']alternate|^(?![\s\S]*rel=)/i) || tag(b, "guid"),
        summary: description,
        image,
        published: tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date"),
      });
    }),
  );
}

// ---- ESPN site API: { articles: [{ headline, description, published, links.web.href, images[] }] } ----

interface EspnArticle {
  headline?: string;
  title?: string;
  description?: string;
  published?: string;
  lastModified?: string;
  links?: { web?: { href?: string } };
  images?: { url?: string; type?: string }[];
}

export function parseEspn(source: string, body: unknown): NewsItem[] {
  const articles = ((body as { articles?: EspnArticle[] })?.articles ?? []) as EspnArticle[];
  return compact(
    articles.map((a) =>
      item(source, {
        title: a.headline ?? a.title,
        url: a.links?.web?.href,
        summary: a.description,
        image: (a.images?.find((i) => i.type === "header") ?? a.images?.[0])?.url,
        published: a.published ?? a.lastModified,
      }),
    ),
  );
}

// ---- NHL.com content API (forge-dapi): { items: [{ headline|title, summary, contentDate, slug, thumbnail }] } ----

interface NhlStory {
  title?: string;
  headline?: string;
  summary?: string;
  contentDate?: string;
  date?: string;
  slug?: string;
  url?: string;
  selfUrl?: string;
  thumbnail?: { thumbnailUrl?: string; templateUrl?: string; url?: string };
  fields?: { description?: string };
}

export function parseNhl(source: string, body: unknown): NewsItem[] {
  const b = body as { items?: NhlStory[]; data?: NhlStory[] };
  const stories = b?.items ?? b?.data ?? [];
  return compact(
    stories.map((s) => {
      const template = s.thumbnail?.templateUrl?.replace("{formatInstructions}", "t_ratio16_9-size40/f_png");
      const pageUrl = httpUrl(s.url) ?? (s.slug ? `https://www.nhl.com/news/${s.slug}` : undefined);
      return item(source, {
        title: s.headline ?? s.title,
        url: pageUrl,
        summary: s.summary ?? s.fields?.description,
        image: s.thumbnail?.thumbnailUrl ?? s.thumbnail?.url ?? template,
        published: s.contentDate ?? s.date,
      });
    }),
  );
}
