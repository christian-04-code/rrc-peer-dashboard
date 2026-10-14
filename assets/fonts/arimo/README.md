# Arimo (weekly report PDF font)

- **Font:** Arimo, variable weight axis 400-700 (`Arimo-wght.ttf`, v1.341), designer Steve Matteson.
- **Source:** https://github.com/google/fonts/tree/main/ofl/arimo (`Arimo[wght].ttf`), downloaded 2026-10-14.
- **SHA-256:** `e43898b143ec826ac8cb4034816458a7047fbe0836558de2a1f8c6223ae3e0ca`
- **License:** SIL Open Font License 1.1 -- see `OFL.txt` (must ship with the font).
- **Why:** metric-compatible with Arial (identical advance widths for all printable ASCII and common
  punctuation, regular and bold, verified with fontTools against macOS Arial). Embedded in the
  weekly report HTML (`lib/reports/render/report-font.ts`) so serverless Chromium on Vercel -- which
  has no Arial -- lays text out exactly like a local render.
