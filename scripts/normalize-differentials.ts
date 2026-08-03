/**
 * One-off normalization pass over data/guidance.json's "Commodity Realizations / Differentials"
 * section into data/differentials_normalized.json, for the 3 peers that actually disclose
 * differentials: RRC, AR, CNX.
 *
 * CRK, EQT, and EXE have no "Commodity Realizations / Differentials" section in guidance.json
 * at all — skipped entirely, not represented in the output. GPOR discloses absolute price
 * assumptions, not differentials vs. a benchmark — structurally a different metric, so it is
 * also skipped entirely rather than forced into this schema.
 *
 * Same conventions as scripts/normalize-guidance.ts: (1) self-check that every cited bullet
 * actually exists verbatim in guidance.json — catches transcription mistakes — (2) each value
 * is a hand-verified reading of the actual source bullets, never guessed or interpolated,
 * (3) assemble the schema, (4) report confidence levels and flag every "low" extraction for
 * review.
 *
 * Every value carries a `classification`: "company_guidance" (direct quote) or
 * "model_calculation" (computed by this script). In practice every differential here is a
 * direct quote — none require summing components the way some guidance.json fields do — but
 * the classification field is kept for schema parity with guidance_normalized.json and in case
 * a future differential needs to be derived.
 *
 * Units and benchmarks are preserved exactly as disclosed, never converted or assumed:
 * RRC/AR differentials are $/Mcf or $/bbl vs. named benchmarks (NYMEX, Mont Belvieu, WTI);
 * CNX's is $/MMBtu with no benchmark stated in the source bullet. These are not interchangeable
 * units — do not convert Mcf-based and MMBtu-based differentials into one another downstream.
 *
 * Even within one commodity, disclosed scope can differ across peers: RRC discloses a blanket
 * "NGL Differential" while AR discloses "C3+ NGL Differential" (propane-plus only) — narrower
 * than RRC's. Both are mapped to the same `ngl_differential` field for schema simplicity, but
 * the AR entry's `note` flags the scope difference so the two are never treated as apples-to-apples.
 */

import fs from "node:fs";
import path from "node:path";

const GUIDANCE_PATH = path.join(process.cwd(), "data", "guidance.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "differentials_normalized.json");

type Confidence = "high" | "medium" | "low";
type Classification = "company_guidance" | "model_calculation";

interface DifferentialValue {
  low: number;
  high: number;
  unit: string;
  /** Named benchmark the differential is quoted against (e.g. "NYMEX", "Mont Belvieu", "WTI").
   *  Omitted (not guessed) when the source bullet doesn't state one — see CNX natural gas. */
  benchmark?: string;
  period: string;
  source_text: string;
  confidence: Confidence;
  classification: Classification;
  note?: string;
}

interface DifferentialFieldSpec {
  section: string;
  /** Bullet text(s) that must exist verbatim in guidance.json for this peer/section — self-check guard. */
  verbatimBullets: string[];
  compute: () => Omit<DifferentialValue, "classification">;
}

interface PeerSpec {
  natural_gas_differential: DifferentialFieldSpec | null;
  ngl_differential: DifferentialFieldSpec | null;
  oil_condensate_differential: DifferentialFieldSpec | null;
  /** Peer-specific extra (AR only). Self-flagged by AR's own source text as requiring
   *  verification — never fold into ngl_differential or drop the caveat. */
  ethaneDifferential?: DifferentialFieldSpec;
}

const SECTION = "Commodity Realizations / Differentials";

const PEER_SPECS: Record<string, PeerSpec> = {
  RRC: {
    natural_gas_differential: {
      section: SECTION,
      verbatimBullets: ["Natural Gas Differential", "($0.35)–($0.45)/Mcf vs. NYMEX"],
      compute: () => ({
        low: -0.45,
        high: -0.35,
        unit: "$/Mcf",
        benchmark: "NYMEX",
        period: "2026",
        source_text: "Natural Gas Differential | ($0.35)–($0.45)/Mcf vs. NYMEX",
        confidence: "high",
      }),
    },
    ngl_differential: {
      section: SECTION,
      verbatimBullets: [
        "NGL Differential",
        "2026 Guidance: +$1.25 to +$2.50/bbl vs. Mont Belvieu",
        "Prior Guidance: $0.00 to +$1.00/bbl",
        "Status: Raised",
      ],
      compute: () => ({
        low: 1.25,
        high: 2.5,
        unit: "$/bbl",
        benchmark: "Mont Belvieu",
        period: "2026",
        source_text:
          "NGL Differential | 2026 Guidance: +$1.25 to +$2.50/bbl vs. Mont Belvieu (Prior Guidance: $0.00 to +$1.00/bbl, Status: Raised)",
        confidence: "high",
        note: "Raised from prior guidance of $0.00 to +$1.00/bbl.",
      }),
    },
    oil_condensate_differential: {
      section: SECTION,
      verbatimBullets: ["Oil / Condensate Differential", "($10.00)–($14.00)/bbl vs. WTI"],
      compute: () => ({
        low: -14,
        high: -10,
        unit: "$/bbl",
        benchmark: "WTI",
        period: "2026",
        source_text: "Oil / Condensate Differential | ($10.00)–($14.00)/bbl vs. WTI",
        confidence: "high",
      }),
    },
  },

  AR: {
    natural_gas_differential: {
      section: SECTION,
      verbatimBullets: ["Natural Gas Differential", "+$0.10 to +$0.20/Mcf vs. NYMEX Henry Hub"],
      compute: () => ({
        low: 0.1,
        high: 0.2,
        unit: "$/Mcf",
        benchmark: "NYMEX Henry Hub",
        period: "2026",
        source_text: "Natural Gas Differential | +$0.10 to +$0.20/Mcf vs. NYMEX Henry Hub",
        confidence: "high",
      }),
    },
    ngl_differential: {
      section: SECTION,
      verbatimBullets: ["C3+ NGL Differential", "($0.50) to +$0.50/bbl vs. Mont Belvieu"],
      compute: () => ({
        low: -0.5,
        high: 0.5,
        unit: "$/bbl",
        benchmark: "Mont Belvieu",
        period: "2026",
        source_text: "C3+ NGL Differential | ($0.50) to +$0.50/bbl vs. Mont Belvieu",
        confidence: "high",
        note: "AR discloses a C3+ NGL differential (propane-plus only), not a blanket NGL differential like RRC's — narrower scope, not directly comparable to RRC's ngl_differential.",
      }),
    },
    oil_condensate_differential: {
      section: SECTION,
      verbatimBullets: ["Oil / Condensate Differential", "($12.00)–($16.00)/bbl vs. WTI"],
      compute: () => ({
        low: -16,
        high: -12,
        unit: "$/bbl",
        benchmark: "WTI",
        period: "2026",
        source_text: "Oil / Condensate Differential | ($12.00)–($16.00)/bbl vs. WTI",
        confidence: "high",
      }),
    },
    ethaneDifferential: {
      section: SECTION,
      verbatimBullets: [
        "Ethane Differential",
        "Updated indication: +$2.00 to +$3.00/bbl vs. Mont Belvieu",
        "Prior: +$1.00 to +$2.00/bbl",
        "Requires direct company-source verification before model input",
      ],
      compute: () => ({
        low: 2,
        high: 3,
        unit: "$/bbl",
        benchmark: "Mont Belvieu",
        period: "2026",
        source_text:
          "Ethane Differential | Updated indication: +$2.00 to +$3.00/bbl vs. Mont Belvieu (Prior: +$1.00 to +$2.00/bbl)",
        confidence: "low",
        note: "Requires direct company-source verification before model input — AR's own source text flags this as an indication, not confirmed guidance. Do not use for Layer 3 forecasting until independently verified.",
      }),
    },
  },

  CNX: {
    natural_gas_differential: {
      section: SECTION,
      verbatimBullets: ["Natural Gas Differential", "Updated: ~($0.64)/MMBtu", "Prior: ~($0.56)/MMBtu", "Status: Widened"],
      compute: () => ({
        low: -0.64,
        high: -0.64,
        unit: "$/MMBtu",
        period: "2026",
        source_text: "Natural Gas Differential | Updated: ~($0.64)/MMBtu (Prior: ~($0.56)/MMBtu, Status: Widened)",
        confidence: "medium",
        note: "Unit is $/MMBtu, not $/Mcf like RRC and AR — do not convert or compare directly against their natural_gas_differential without an explicit Btu-content conversion. No benchmark named in the source bullet (unlike RRC/AR's 'vs. NYMEX'), so benchmark is omitted rather than assumed. Widened from prior guidance of ~($0.56)/MMBtu.",
      }),
    },
    // CNX's only other pricing bullet in this section is "NGL Realized Price" — an absolute
    // realized price, not a differential vs. a benchmark. Structurally the same situation as
    // GPOR being skipped entirely: don't force an absolute price into a differential schema.
    ngl_differential: null,
    oil_condensate_differential: null,
  },
};

function assertVerbatim(guidance: unknown, peer: string, section: string, bullets: string[]): void {
  const companies = (guidance as { companies: Record<string, { sections: Record<string, { text: string }[]> }> }).companies;
  const sectionBullets = companies[peer]?.sections?.[section];
  if (!sectionBullets) {
    throw new Error(`${peer}: section "${section}" not found in guidance.json`);
  }
  const texts = new Set(sectionBullets.map((b) => b.text));
  for (const bullet of bullets) {
    if (!texts.has(bullet)) {
      throw new Error(`${peer}/${section}: cited bullet not found verbatim in guidance.json: "${bullet}"`);
    }
  }
}

function resolveField(spec: DifferentialFieldSpec | null | undefined, guidance: unknown, peer: string): DifferentialValue | null {
  if (!spec) return null;
  assertVerbatim(guidance, peer, spec.section, spec.verbatimBullets);
  return { ...spec.compute(), classification: "company_guidance" };
}

interface NormalizedPeer {
  natural_gas_differential: DifferentialValue | null;
  ngl_differential: DifferentialValue | null;
  oil_condensate_differential: DifferentialValue | null;
  /** Peer-specific extra (currently AR only) — never fold into ngl_differential. */
  ethane_differential?: DifferentialValue;
}

function main() {
  const guidance = JSON.parse(fs.readFileSync(GUIDANCE_PATH, "utf-8"));

  const report: { peer: string; field: string; confidence: Confidence | "null"; classification: Classification | "n/a" }[] = [];
  const output: Record<string, NormalizedPeer> = {};

  for (const [peer, spec] of Object.entries(PEER_SPECS)) {
    const naturalGas = resolveField(spec.natural_gas_differential, guidance, peer);
    const ngl = resolveField(spec.ngl_differential, guidance, peer);
    const oilCondensate = resolveField(spec.oil_condensate_differential, guidance, peer);
    const ethane = resolveField(spec.ethaneDifferential, guidance, peer);

    output[peer] = {
      natural_gas_differential: naturalGas,
      ngl_differential: ngl,
      oil_condensate_differential: oilCondensate,
      ...(ethane ? { ethane_differential: ethane } : {}),
    };

    const fields: [string, DifferentialValue | null][] = [
      ["natural_gas_differential", naturalGas],
      ["ngl_differential", ngl],
      ["oil_condensate_differential", oilCondensate],
      ...(ethane ? ([["ethane_differential", ethane]] as [string, DifferentialValue | null][]) : []),
    ];
    for (const [field, value] of fields) {
      report.push({
        peer,
        field,
        confidence: value?.confidence ?? "null",
        classification: value?.classification ?? "n/a",
      });
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log(`Wrote ${OUTPUT_PATH}\n`);

  console.log("=== Confidence counts per peer ===");
  for (const peer of Object.keys(PEER_SPECS)) {
    const rows = report.filter((r) => r.peer === peer);
    const counts = { high: 0, medium: 0, low: 0, null: 0 };
    for (const r of rows) counts[r.confidence]++;
    console.log(
      `${peer}: high=${counts.high} medium=${counts.medium} low=${counts.low} null(no defensible value)=${counts.null}`,
    );
  }

  console.log('\n=== ALL "low"-confidence extractions (review before Layer 3 uses them) ===');
  const lows = report.filter((r) => r.confidence === "low");
  console.log(lows.length === 0 ? "(none)" : lows.map((r) => `${r.peer} / ${r.field}`).join("\n"));

  console.log("\n=== Fields with no defensible value (left null, not estimated) ===");
  const nulls = report.filter((r) => r.confidence === "null");
  for (const r of nulls) {
    console.log(`${r.peer} / ${r.field}`);
  }

  console.log("\n=== Peers skipped entirely (no usable differential data in this schema) ===");
  console.log("CRK, EQT, EXE (no 'Commodity Realizations / Differentials' section in guidance.json)");
  console.log("GPOR (discloses absolute price assumptions, not differentials vs. a benchmark)");
}

main();
