import { FORECAST_ENGINE_VERSION } from "@/lib/forecast/engine";
import type {
  AssumptionClassification,
  CapexAssumptions,
  ForecastPeriodAssumptions,
  ForecastScenario,
  SourcedValue
} from "@/lib/forecast/types";

const SOURCE_DATE = "2026-08-04";
const PRESENTATION_REFERENCE =
  "Range Resources Company Presentation, April 2026, pp. 7-10";

type Post2027Strategy = "maintenance" | "continued-growth";

type RrcScenarioSeed = {
  id: string;
  name: string;
  description: string;
  kind: ForecastScenario["kind"];
  post2027Strategy: Post2027Strategy;
};

function sourcedValue(params: {
  value: number | null;
  unit: string;
  period: string;
  classification: AssumptionClassification;
  notes: string;
  reference?: string;
}): SourcedValue {
  return {
    value: params.value,
    unit: params.unit,
    source: {
      name: "Range Resources",
      reference: params.reference ?? PRESENTATION_REFERENCE,
      period: params.period,
      retrievedAt: SOURCE_DATE,
      classification: params.classification,
      notes: params.notes
    }
  };
}

function unavailable(unit: string, period: string, notes: string): SourcedValue {
  return sourcedValue({
    value: null,
    unit,
    period,
    classification: "modeled",
    notes
  });
}

function quarterDays(period: string): number {
  const [yearText, quarterText] = period.split("Q");
  const year = Number(yearText);
  const quarter = Number(quarterText);
  if (![1, 2, 3, 4].includes(quarter)) throw new Error(`Invalid quarter: ${period}`);
  if (quarter === 1) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 91 : 90;
  }
  return quarter === 2 ? 91 : quarter === 3 ? 92 : 92;
}

function annualCapexFor(year: number, strategy: Post2027Strategy): number {
  if (year === 2026 || year === 2027) return 675;
  return strategy === "maintenance" ? 600 : 675;
}

function capexAssumptions(period: string, strategy: Post2027Strategy): CapexAssumptions {
  const year = Number(period.slice(0, 4));
  const annual = annualCapexFor(year, strategy);
  const quarterly = annual / 4;
  const isMaintenance = year >= 2028 && strategy === "maintenance";

  return {
    maintenanceDcMillion: sourcedValue({
      value: isMaintenance ? quarterly : null,
      unit: "$mm",
      period,
      classification: "modeled",
      notes: isMaintenance
        ? "Modeled as an even quarterly allocation of the approximately $600 million annual post-2027 maintenance D&C framework."
        : "The source does not separately disclose quarterly maintenance D&C for this period."
    }),
    growthDcMillion: sourcedValue({
      value: !isMaintenance ? quarterly : 0,
      unit: "$mm",
      period,
      classification: "modeled",
      notes: !isMaintenance
        ? `Modeled as an even quarterly allocation of the $${annual} million annual capital case. This is a scenario allocation, not reported quarterly guidance.`
        : "Maintenance scenario assumes no growth D&C beyond the modeled maintenance program."
    }),
    landLeaseholdMillion: unavailable(
      "$mm",
      period,
      "Quarterly land and leasehold capital is not separately supported by the source package."
    ),
    facilitiesMillion: unavailable(
      "$mm",
      period,
      "Quarterly facilities capital is not separately supported by the source package."
    ),
    environmentalMillion: unavailable(
      "$mm",
      period,
      "Quarterly environmental and pneumatic-upgrade capital is not separately supported by the source package."
    ),
    otherMillion: unavailable(
      "$mm",
      period,
      "Quarterly other capital is not separately supported by the source package."
    )
  };
}

function periodAssumptions(period: string, strategy: Post2027Strategy): ForecastPeriodAssumptions {
  const is2027 = period.startsWith("2027");
  const is2028Maintenance = period.startsWith("2028") && strategy === "maintenance";

  return {
    period,
    days: quarterDays(period),
    commodity: {
      henryHubPerMmbtu: sourcedValue({
        value: 3.75,
        unit: "$/MMBtu",
        period,
        classification: "modeled",
        notes: "Management sensitivity case uses $3.75 NYMEX natural gas. This is a benchmark scenario assumption, not Range realized pricing."
      }),
      wtiPerBbl: sourcedValue({
        value: 65,
        unit: "$/bbl",
        period,
        classification: "modeled",
        notes: "Management sensitivity case uses $65 WTI."
      }),
      nglRealizationPctOfWti: sourcedValue({
        value: 24 / 65,
        unit: "decimal",
        period,
        classification: "modeled",
        notes: "Derived exactly from the management case of $24/bbl NGL realizations and $65/bbl WTI."
      })
    },
    pricing: {
      gasBasisPerMcf: unavailable("$/Mcf", period, "A source-backed quarterly basis differential has not yet been loaded."),
      gasTransportMarketingPerMcf: unavailable("$/Mcf", period, "A source-backed quarterly transport and marketing adjustment has not yet been loaded."),
      gasHedgeImpactPerMcf: unavailable("$/Mcf", period, "Quarterly hedge impact must be loaded from the hedge book or filing disclosures."),
      nglMarketingUpliftPerBbl: sourcedValue({
        value: 0,
        unit: "$/bbl",
        period,
        classification: "modeled",
        notes: "No separate uplift is applied because the scenario already uses the management-provided $24/bbl NGL realization case."
      }),
      nglHedgeImpactPerBbl: unavailable("$/bbl", period, "Quarterly NGL hedge impact has not yet been loaded."),
      oilDifferentialPerBbl: unavailable("$/bbl", period, "Quarterly oil differential has not yet been loaded."),
      oilHedgeImpactPerBbl: unavailable("$/bbl", period, "Quarterly oil hedge impact has not yet been loaded.")
    },
    production: {
      gasMmcfPerDay: unavailable("MMcf/d", period, "Product-level gas production is not inferred from total company production guidance."),
      nglMbblPerDay: unavailable("Mbbl/d", period, "Product-level NGL production is not inferred from total company production guidance."),
      oilMbblPerDay: unavailable("Mbbl/d", period, "Product-level oil production is not inferred from total company production guidance.")
    },
    costs: {
      loePerMcfe: unavailable("$/Mcfe", period, "A source-backed unit LOE forecast has not yet been loaded."),
      gatheringTransportPerMcfe: unavailable("$/Mcfe", period, "A source-backed gathering and transportation forecast has not yet been loaded."),
      productionTaxPctRevenue: unavailable("decimal", period, "A source-backed production-tax rate has not yet been loaded."),
      cashGaMillion: unavailable("$mm", period, "A source-backed cash G&A forecast has not yet been loaded."),
      cashInterestMillion: unavailable("$mm", period, "A source-backed cash interest forecast has not yet been loaded."),
      explorationMillion: unavailable("$mm", period, "A source-backed exploration expense forecast has not yet been loaded."),
      cashTaxRate: sourcedValue({
        value: period.startsWith("2026") ? 0.02 : period.startsWith("2027") ? 0.06 : null,
        unit: "decimal",
        period,
        classification: period.startsWith("2026") || period.startsWith("2027") ? "guided" : "modeled",
        notes: period.startsWith("2026")
          ? "Management sensitivity case assumes a 2% effective cash tax rate in 2026."
          : period.startsWith("2027")
            ? "Management sensitivity case assumes a 6% effective cash tax rate in 2027."
            : "No source-backed 2028 cash tax rate is currently available."
      })
    },
    capex: capexAssumptions(period, strategy)
  };
}

function buildScenario(seed: RrcScenarioSeed): ForecastScenario {
  const periods = [2026, 2027, 2028].flatMap((year) =>
    [1, 2, 3, 4].map((quarter) => periodAssumptions(`${year}Q${quarter}`, seed.post2027Strategy))
  );

  return {
    id: seed.id,
    name: seed.name,
    description: seed.description,
    kind: seed.kind,
    createdAt: SOURCE_DATE,
    updatedAt: SOURCE_DATE,
    author: "RRC Peer Dashboard",
    engineVersion: FORECAST_ENGINE_VERSION,
    periods
  };
}

export const rrcBaseMaintenanceScenario = buildScenario({
  id: "rrc-base-maintenance-2026-2028",
  name: "RRC Base — 2028 Maintenance",
  description:
    "Management-case commodity assumptions through 2028 with the explicit post-2027 maintenance fork: approximately 2.6 Bcfe/d target context, approximately $600 million maintenance D&C, and approximately 725,000 annual lateral feet TIL. Product-level production and unsupported cost lines remain unavailable until directly sourced.",
  kind: "base",
  post2027Strategy: "maintenance"
});

export const rrcBaseGrowthScenario = buildScenario({
  id: "rrc-base-growth-2026-2028",
  name: "RRC Base — 2028 Continued Growth",
  description:
    "Management-case commodity assumptions through 2028 with the explicit continued-growth fork. The scenario retains the $675 million annual capital midpoint as a modeled assumption; production growth is intentionally not fabricated and remains unavailable pending a source-backed product-level forecast.",
  kind: "custom",
  post2027Strategy: "continued-growth"
});

export const rrcScenarioForks = {
  maintenance: rrcBaseMaintenanceScenario,
  continuedGrowth: rrcBaseGrowthScenario
} as const;
