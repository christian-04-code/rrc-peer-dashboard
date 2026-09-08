const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { normalizeRawArticle } = load("lib/news/normalize/normalize.ts");
const { scoreRelevance } = load("lib/news/relevance/score.ts");

function article(overrides) {
  return normalizeRawArticle(
    {
      sourceId: "test-source",
      sourceTier: "tier3_discovery",
      headline: "A headline",
      url: `https://example.com/${Math.random().toString(36).slice(2)}`,
      publisher: "Example Wire",
      publishedAt: "2026-08-15T09:00:00.000Z",
      excerpt: null,
      ...overrides
    },
    "2026-08-15T10:00:00.000Z"
  );
}

// --- Section 9: reject -- the two real Phase 2 false positives ---------------

test("REJECT: Beetaloo shale headline with Marcellus only as a body/excerpt comparison, no US signal", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier3_discovery",
      headline: "Australia's Beetaloo Shale Basin Is About to Start Pumping Gas",
      excerpt: "Analysts have compared the play's potential scale to the Marcellus, though development timelines remain uncertain."
    })
  );
  assert.equal(result.retained, false, `expected rejection; got score ${result.score}, reason: ${result.rejectionReason}`);
});

test("REJECT: battery-boom headline with LNG export used only as a passing body statistic", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier3_discovery",
      headline: "The Battery Boom Is Becoming Impossible to Ignore",
      excerpt: "For context, the U.S. supplied the majority of global LNG export growth last year, but the story here is batteries."
    })
  );
  assert.equal(result.retained, false, `expected rejection; got score ${result.score}, reason: ${result.rejectionReason}`);
});

// --- Section 9: adversarial variants -----------------------------------------

test("REJECT: broad oil article mentioning natural gas prices once, in passing, from a non-Tier-1 source", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier3_discovery",
      headline: "Oil Prices Head for Second Straight Weekly Gain as Iran Risks Mount",
      excerpt: "Meanwhile, natural gas prices were little changed as traders focused on the crude market."
    })
  );
  assert.equal(result.retained, false);
});

test("REJECT: renewable-energy article mentioning an LNG export statistic once, from a non-Tier-1 source", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier2_major_news",
      headline: "Solar and Wind Additions Set a New Annual Record",
      excerpt: "By comparison, LNG export capacity grew at a slower pace over the same period."
    })
  );
  assert.equal(result.retained, false);
});

test("REJECT: global shale article referencing Marcellus purely as a size benchmark", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier2_major_news",
      headline: "Argentina's Vaca Muerta Formation Draws New International Investment",
      excerpt: "Some geologists have likened its scale to the Marcellus, though the comparison is imperfect."
    })
  );
  assert.equal(result.retained, false);
});

test("REJECT: stock-market article using the letters RRC in an unrelated context, no financial markup", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier3_discovery",
      headline: "Regional Retail Council (RRC) Reports Holiday Shopping Trends",
      excerpt: "The RRC surveyed member businesses about foot traffic during the holiday season."
    })
  );
  assert.equal(result.retained, false, "a bare 'RRC' abbreviation with no ticker markup and no oil/gas context must not match Range Resources");
});

test("REJECT: 'range' used in financial/trading terminology elsewhere in an article that also discusses gas", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier3_discovery",
      headline: "Commodities Roundup: Metals Trade in a Tight Range",
      excerpt: "Natural gas held steady while industrial metals traded in a narrow price range for a second session."
    })
  );
  assert.equal(result.retained, false);
});

// --- Section 10: preserve true positives -------------------------------------

const TRUE_POSITIVES = [
  ["Henry Hub price shock", "Henry Hub Prices Surge as Cold Snap Grips the Midwest", null, "tier2_major_news"],
  ["EIA gas storage surprise", "EIA Reports Surprise Natural Gas Storage Draw", null, "tier1_primary"],
  ["Marcellus pipeline expansion", "Marcellus Pipeline Expansion Eases Appalachian Takeaway Constraints", null, "tier2_major_news"],
  ["PJM data-center gas demand", "PJM Warns of Rising Data Center Power Demand", null, "tier2_major_news"],
  ["LNG project startup", "Gulf Coast LNG Terminal Begins Commercial Operations", null, "tier2_major_news"],
  ["propane export terminal expansion", "Propane Export Terminal Expansion Announced at Mont Belvieu", null, "tier3_discovery"],
  ["Appalachian basis deterioration", "Appalachian Basis Differentials Widen Amid Pipeline Constraints", null, "tier2_major_news"],
  ["gas-directed rig activity change", "Gas-Directed Rig Count Falls for Third Straight Week", null, "tier2_major_news"]
];

for (const [label, headline, excerpt, sourceTier] of TRUE_POSITIVES) {
  test(`PRESERVE: "${label}" is still retained under the tightened engine`, () => {
    const result = scoreRelevance(article({ headline, excerpt, sourceTier }));
    assert.equal(result.retained, true, `expected retention for "${label}"; reason: ${result.rejectionReason}`);
    assert.ok(result.signals.headlineTopicMatches.length > 0, `expected a headline-level topic match for "${label}"`);
  });
}

test("PRESERVE: Range Resources SEC 8-K headline (entity-driven, no topic keywords needed)", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier1_primary",
      headline: "Range Resources Corporation files Form 8-K",
      excerpt: "Range Resources Corporation (RRC) filed Form 8-K with the SEC."
    })
  );
  assert.equal(result.retained, true);
  assert.ok(result.signals.entityMatches.some((e) => e.ticker === "RRC"));
});

test("PRESERVE: a peer-company operational announcement (entity-driven)", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier2_major_news",
      headline: "EQT Corporation Announces New Pipeline Agreement",
      excerpt: "EQT Corporation said the agreement expands its Appalachian takeaway capacity."
    })
  );
  assert.equal(result.retained, true);
  assert.ok(result.signals.entityMatches.some((e) => e.ticker === "EQT"));
});

// --- Section 5/7: explicit rule-path coverage --------------------------------

test("Tier-1-source + single body-only topic corroboration is sufficient (rule c)", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier1_primary",
      headline: "Weekly Energy Market Notes",
      excerpt: "Natural gas storage levels remain below the five-year average heading into peak season."
    })
  );
  assert.equal(result.retained, true, "one topic + a Tier 1 (primary/authoritative) source should corroborate retention");
});

test("a non-Tier-1 source with a single body-only topic and no geography does NOT retain (rule c requires corroboration)", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier3_discovery",
      headline: "Weekly Energy Market Notes",
      excerpt: "Natural gas storage levels remain below the five-year average heading into peak season."
    })
  );
  assert.equal(result.retained, false);
});

test("two distinct body-only topic signals together are sufficient (rule b), even from a non-Tier-1 source", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier3_discovery",
      headline: "Weekly Energy Market Notes",
      excerpt: "Natural gas storage fell while LNG feedgas demand climbed to a fresh record."
    })
  );
  assert.equal(result.retained, true);
  assert.ok(result.signals.distinctTopicsMatched >= 2);
});

test("source tier bonus alone, with zero entity/topic signal, never creates relevance", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier1_primary",
      headline: "Weather forecast for the weekend",
      excerpt: null
    })
  );
  assert.equal(result.score, 0);
  assert.equal(result.retained, false);
});

test("diagnostics: signals breakdown distinguishes headline vs. excerpt topic matches", () => {
  const result = scoreRelevance(
    article({
      sourceTier: "tier2_major_news",
      headline: "Henry Hub prices rise on colder forecasts",
      excerpt: "Natural gas storage fell below the 5-year average."
    })
  );
  assert.ok(result.signals.headlineTopicMatches.some((m) => m.topic === "natural_gas"));
  assert.ok(result.signals.excerptTopicMatches.some((m) => m.topic === "natural_gas"));
  assert.ok(result.retentionReason && result.retentionReason.length > 0);
});
