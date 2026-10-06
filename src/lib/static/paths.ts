// URLs of the static (GitHub Pages) build.
//
// GitHub Pages serves files and ignores query strings, so every view the app reaches with a query
// (`/standings?view=league`) is saved as its own folder (`/standings/_q/view=league/`), and French
// pages live under `/fr/`. The functions below map app links to those folders. `toStaticHref` and
// `staticBoot` are also inlined into each page as a script (see `bootScript`), so they must stay
// self-contained: no imports, no references to anything outside their own body.

/** Pages that read their query in the browser (the bet tracker's prefill) keep it as a real query. */
export function toStaticHref(href: string, base: string, fr: boolean): string {
  let hash = "";
  const h = href.indexOf("#");
  if (h >= 0) {
    hash = href.slice(h);
    href = href.slice(0, h);
  }
  const q = href.indexOf("?");
  let path = q >= 0 ? href.slice(0, q) : href;
  const search = q >= 0 ? href.slice(q + 1) : "";
  if (path.length > 1 && path.charAt(path.length - 1) === "/") path = path.slice(0, -1);
  if (!path) path = "/";
  const dir = (fr ? base + "/fr" : base) + (path === "/" ? "/" : path + "/");
  if (path === "/bets") return dir + (search ? "?" + search : "") + hash;
  const pairs: string[][] = [];
  new URLSearchParams(search).forEach((v, k) => {
    if (v !== "" && k !== "_rsc") pairs.push([k, v]);
  });
  if (!pairs.length) return dir + hash;
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return dir + "_q/" + pairs.map((p) => encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1])).join("/") + "/" + hash;
}

/** Splits a static page's pathname into its language and the app route it shows (`/standings`). */
export function appPathOf(pathname: string, base: string): { fr: boolean; path: string } {
  let p = base && pathname.indexOf(base) === 0 ? pathname.slice(base.length) : pathname;
  const fr = p === "/fr" || p.indexOf("/fr/") === 0;
  if (fr) p = p.slice(3);
  const qi = p.indexOf("/_q/");
  if (qi >= 0) p = p.slice(0, qi);
  if (p.length > 1 && p.charAt(p.length - 1) === "/") p = p.slice(0, -1);
  return { fr, path: p || "/" };
}

export const LANG_KEY = "puck-edge:lang";

/**
 * Runs first on every static page: sends the visitor to their language (saved choice, else the
 * browser's), turns `?query` URLs into their saved folder, and routes app links and GET forms there.
 */
export function staticBoot(map: typeof toStaticHref, base: string, langKey: string, is404: boolean) {
  const loc = window.location;
  let rel = loc.pathname.indexOf(base) === 0 ? loc.pathname.slice(base.length) : loc.pathname;
  if (!rel) rel = "/";
  const onFr = rel === "/fr" || rel.indexOf("/fr/") === 0;
  const appRel = onFr ? rel.slice(3) || "/" : rel;
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(langKey);
  } catch {}
  const fr = saved ? saved === "fr" : onFr || /^fr/i.test(navigator.language || "");
  (window as unknown as { __pe: unknown }).__pe = { fr };
  if (is404) {
    // 404.html is the English page; French visitors get the French one.
    if (fr && !onFr) {
      loc.replace(base + "/fr/404/");
      return;
    }
  } else {
    let target: string | null = null;
    const isBets = appRel === "/bets" || appRel === "/bets/";
    if (loc.search && appRel.indexOf("/_q/") < 0 && !isBets) target = map(appRel + loc.search + loc.hash, base, fr);
    else if (fr !== onFr) target = base + (fr ? "/fr" : "") + appRel + loc.search + loc.hash;
    if (target && target !== loc.pathname + loc.search + loc.hash) {
      loc.replace(target);
      return;
    }
  }
  const isApp = (h: string | null) => !!h && h.charAt(0) === "/" && h.charAt(1) !== "/" && h !== base && h.indexOf(base + "/") !== 0;
  // Bubble-phase listeners on window run after React's, so forms and links the app handles itself
  // (the bet form, buttons) have already called preventDefault and are left alone.
  window.addEventListener(
    "click",
    (e) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = e.target instanceof Element ? e.target.closest("a[href]") : null;
      const h = a && a.getAttribute("href");
      if (!a || !isApp(h)) return;
      e.preventDefault();
      const url = map(h as string, base, fr);
      if (e.metaKey || e.ctrlKey || e.shiftKey || a.getAttribute("target") === "_blank") window.open(url);
      else loc.href = url;
    },
  );
  window.addEventListener(
    "submit",
    (e) => {
      const f = e.target as HTMLFormElement;
      if (e.defaultPrevented) return;
      if (!(f instanceof HTMLFormElement) || (f.getAttribute("method") || "get").toLowerCase() !== "get") return;
      let action = f.getAttribute("action");
      if (!action) {
        // A form with no action submits to the page it's on.
        action = onFr ? rel.slice(3) || "/" : rel;
        const qi = action.indexOf("/_q/");
        if (qi >= 0) action = action.slice(0, qi);
      }
      if (!isApp(action)) return;
      e.preventDefault();
      const params = new URLSearchParams();
      new FormData(f).forEach((v, k) => {
        if (typeof v === "string") params.append(k, v);
      });
      loc.href = map(action + "?" + params.toString(), base, fr);
    },
  );
}

/** The inline script that runs `staticBoot` before the page renders. */
export function bootScript(base: string, is404 = false): string {
  return `(${staticBoot.toString()})(${toStaticHref.toString()},${JSON.stringify(base)},${JSON.stringify(LANG_KEY)},${is404 ? "true" : "window.__pe404===1"});`;
}

/** URL of the current static page in the other language. */
export function otherLanguageHref(base: string, toFr: boolean): string {
  const loc = window.location;
  const rel = loc.pathname.indexOf(base) === 0 ? loc.pathname.slice(base.length) || "/" : loc.pathname;
  const onFr = rel === "/fr" || rel.indexOf("/fr/") === 0;
  const appRel = onFr ? rel.slice(3) || "/" : rel;
  return base + (toFr ? "/fr" : "") + appRel + loc.search + loc.hash;
}
