// Set at build time by `npm run build:static` (see scripts/static-site.ts). Inlined into both
// server and browser code, so static-only branches drop out of the normal build.
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
