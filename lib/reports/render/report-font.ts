import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The weekly report's embedded body font (2026-10-14). Vercel's serverless
 * Chromium (@sparticuz/chromium) ships no Arial, so it substituted a wider
 * fallback font and a report that fit 5 pages locally rendered 8 pages there.
 * Embedding Arimo -- metric-compatible with Arial (identical advance widths),
 * SIL OFL 1.1, see assets/fonts/arimo/README.md -- makes local and Vercel
 * renders lay out identically. Same never-throw convention as branding.ts:
 * returns "" if the file is ever missing, so the template falls back to
 * Arial/Helvetica rather than failing the render.
 */

export const REPORT_FONT_FAMILY = "Report Sans";

const FONT_PATH = join(process.cwd(), "assets", "fonts", "arimo", "Arimo-wght.ttf");

let cached: string | undefined;

export function loadReportFontFaceCss(): string {
  if (cached !== undefined) return cached;
  try {
    const base64 = readFileSync(FONT_PATH).toString("base64");
    cached = `@font-face { font-family: "${REPORT_FONT_FAMILY}"; src: url(data:font/ttf;base64,${base64}) format("truetype"); font-weight: 400 700; font-style: normal; }`;
  } catch {
    cached = "";
  }
  return cached;
}
