/**
 * Phase 7D PDF rendering boundary -- mirrors the provider-abstraction
 * pattern already established for AI (lib/reports/ai/provider.ts) and news
 * article analysis: a small interface, a safe-default Noop implementation
 * that throws with a clear message, and one real implementation. Nothing
 * downstream of PdfRenderer (weekly-report-pdf-service.ts) ever imports
 * puppeteer-core/@sparticuz/chromium directly -- swapping the real
 * implementation later never touches the retry/budget logic that calls it,
 * and tests exercise that logic entirely against fakes, never a real browser
 * (Section 20/21 of the brief: no live PDF rendering during tests).
 *
 * Architecture choice (Section 14): headless Chromium via `puppeteer-core`
 * (no bundled browser binary -- small, ordinary npm dependency) paired with
 * `@sparticuz/chromium` (a Chromium build + launch-arg set purpose-built for
 * serverless/Lambda-style runtimes, the standard, widely-used pairing for
 * PDF generation on Vercel-style platforms). This avoids both extremes the
 * brief warns against: it is NOT the full `puppeteer` package (which bundles
 * a desktop-sized Chromium download unsuitable for a serverless function's
 * size limits), and it is NOT a paid third-party rendering API. `@sparticuz/
 * chromium`'s own package is a real, non-trivial download (~65MB unpacked)
 * -- documented here rather than hidden, and justified because it is
 * currently the standard, best-supported solution for exactly this
 * requirement (real headless Chromium inside a Vercel/AWS-Lambda-style
 * serverless function); no smaller reliable alternative accomplishes the
 * same "real HTML/CSS -> real PDF, server-side, no paid service" requirement.
 *
 * NOT LIVE-VALIDATED IN THIS SESSION: no real Chromium browser was launched
 * during Phase 7D development (no browser is available in this sandbox, and
 * Section 20/21 explicitly ask for fakes in tests). The exact puppeteer-core
 * <-> @sparticuz/chromium version pairing and the Vercel project's selected
 * Node.js runtime version (the chromium package requires Node ^22.17.0 or
 * >=24.0.0) must be confirmed with a real controlled Preview invocation
 * before Phase 7F ever calls this for real -- the same "no live call yet,
 * validate before enabling" discipline Phase 6/7C already established for
 * their own first real Anthropic calls.
 */

export type PdfRenderResult = {
  pdf: Buffer;
  pageCount: number;
};

export class PdfRendererError extends Error {}

export interface PdfRenderer {
  renderPdf(html: string): Promise<PdfRenderResult>;
}

/** Default when no real renderer is configured -- callers must construct ChromiumPdfRenderer explicitly and check availability, mirroring NoopWeeklyAnalystProvider's role for the AI layer. */
export class NoopPdfRenderer implements PdfRenderer {
  async renderPdf(): Promise<PdfRenderResult> {
    throw new PdfRendererError("NoopPdfRenderer cannot render a PDF. Construct ChromiumPdfRenderer (or a test fake) instead.");
  }
}

/**
 * Counts real PDF page objects (`/Type /Page`, explicitly excluding the
 * page-TREE node `/Type /Pages`) via a direct byte-level scan -- a
 * deliberately lightweight heuristic instead of a full PDF-parsing
 * dependency, in the same "smallest reliable architecture" spirit as the
 * renderer choice above. Reliable for Chromium-generated PDFs (one `/Type
 * /Page` object per page, uncompressed cross-reference/object dictionaries)
 * -- exactly the one PDF producer this subsystem ever uses.
 */
export function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?!s)\b/g);
  return matches ? matches.length : 0;
}

export const PDF_FOOTER_TEMPLATE = `
  <div style="width:100%; font-size:8px; font-family:Arial,Helvetica,sans-serif; color:#5b7288; text-align:center; padding:0 0.6in;">
    Weekly Range Resources AI Intelligence Report &middot; Page <span class="pageNumber"></span> of <span class="totalPages"></span>
  </div>`;

export type ChromiumPdfRendererOptions = {
  /** Overrides Chromium's own resolved executable path -- for local development against a system-installed Chrome/Chromium. Production/serverless should leave this unset so @sparticuz/chromium resolves its own bundled binary. */
  executablePath?: string;
};

/**
 * The real implementation. Deliberately lazy-imports puppeteer-core/
 * @sparticuz/chromium inside renderPdf() rather than at module load time --
 * this file is imported by weekly-report-pdf-service.ts, which tests import
 * too (to exercise the retry/budget logic against fakes); a top-level import
 * here would force the ~65MB chromium package to load even for a test run
 * that never constructs this class.
 */
export class ChromiumPdfRenderer implements PdfRenderer {
  constructor(private readonly options: ChromiumPdfRendererOptions = {}) {}

  async renderPdf(html: string): Promise<PdfRenderResult> {
    const [{ default: chromium }, { default: puppeteer }] = await Promise.all([import("@sparticuz/chromium"), import("puppeteer-core")]);

    const executablePath = this.options.executablePath ?? (await chromium.executablePath());
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath,
      headless: true
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = Buffer.from(
        await page.pdf({
          format: "Letter",
          printBackground: true,
          displayHeaderFooter: true,
          headerTemplate: "<span></span>",
          footerTemplate: PDF_FOOTER_TEMPLATE,
          margin: { top: "0.55in", bottom: "0.65in", left: "0.6in", right: "0.6in" }
        })
      );
      return { pdf, pageCount: countPdfPages(pdf) };
    } finally {
      await browser.close();
    }
  }
}
