import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 7D branding lookup -- Section 6 of the brief: prefer an existing
 * approved Range Resources asset over inventing one. `assets/logos/RRC.png`
 * is that asset (already the approved source config/company-logos.json
 * points every dashboard company-logo usage at); this reuses the identical
 * file rather than a copy. Never reads or references the proprietary
 * reference DOCX. Returns null (never throws, never fabricates a
 * placeholder image) if the file is ever missing -- html-template.ts falls
 * back to a plain text wordmark in that case, per Section 6's "do not block
 * the renderer" instruction, and the gap is documented rather than silently
 * swallowed (see this module's caller).
 */

const RRC_LOGO_PATH = join(process.cwd(), "assets", "logos", "RRC.png");

let cached: string | null | undefined;

export function loadRrcLogoDataUri(): string | null {
  if (cached !== undefined) return cached;
  try {
    const bytes = readFileSync(RRC_LOGO_PATH);
    cached = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    cached = null;
  }
  return cached;
}
