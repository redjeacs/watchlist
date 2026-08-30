// @/utils/financialParser.ts

interface SECConceptUnit {
  end: string;
  val: number;
  form: string;
  start?: string;
  fy: number;
  fp: string;
}

export interface ConceptPayload {
  label: string;
  units: {
    [unitKey: string]: SECConceptUnit[];
  };
}

interface FiscalMilestone {
  year: number;
  period: string;
  headerLabel: string;
}

const TWD_EXCHANGE_RATE = 32.5;

/**
 * 1. AUTOMATIC TIMELINE GENERATOR: Steps backward from today to find the last 4 quarters
 */
export function generateDynamicTimeline(): FiscalMilestone[] {
  const now = new Date();
  const currentCalendarYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0 = Jan, 11 = Dec

  // Standard Calendar Mapping: Q1 (Jan-Mar), Q2 (Apr-Jun), Q3 (Jul-Sep), Q4 (Oct-Dec)
  let currentQuarter = 1;
  if (currentMonth >= 3 && currentMonth <= 5) currentQuarter = 2;
  if (currentMonth >= 6 && currentMonth <= 8) currentQuarter = 3;
  if (currentMonth >= 9 && currentMonth <= 11) currentQuarter = 4;

  const milestones: FiscalMilestone[] = [];

  // SEC historical reporting loop: Offset by -1 quarter since current ongoing quarter is unfiled
  let targetQuarter = currentQuarter - 1;
  let targetYear = currentCalendarYear;

  if (targetQuarter === 0) {
    targetQuarter = 4;
    targetYear -= 1;
  }

  // Step back precisely 4 sequential quarters
  for (let i = 0; i < 4; i++) {
    // The SEC files Q4 metrics under the identifier "FY"
    const secPeriodCode = targetQuarter === 4 ? "FY" : `Q${targetQuarter}`;
    const cleanLabel = `Q${targetQuarter} ${targetYear}`;

    milestones.unshift({
      // unshift ensures ascending chronological order (oldest to newest)
      year: targetYear,
      period: secPeriodCode,
      headerLabel: cleanLabel,
    });

    targetQuarter -= 1;
    if (targetQuarter === 0) {
      targetQuarter = 4;
      targetYear -= 1;
    }
  }

  return milestones;
}

/**
 * Extracts true 3-month quarterly data points from a standalone concept response
 */
export function extractConceptPeriodData(
  payload: any,
  timeline: FiscalMilestone[],
): Record<string, number> {
  const periodMap: Record<string, number> = {};
  if (!payload || !payload.units) return periodMap;

  const unitKey =
    Object.keys(payload.units).find((k) => k !== "shares") ||
    Object.keys(payload.units)[0];
  if (!unitKey) return periodMap;

  const entries: SECConceptUnit[] = payload.units[unitKey] || [];

  entries.forEach((entry) => {
    const validForm = ["10-Q", "10-K", "6-K", "20-F"].includes(entry.form);
    if (!validForm) return;

    // FIX: Check if this entry matches our targeted structural fiscal milestones
    const matchesTimeline = timeline.some(
      (target) => entry.fy === target.year && entry.fp === target.period,
    );

    if (matchesTimeline) {
      // Isolate true 3-month slices for income/expense concepts
      if (entry.start && entry.end) {
        const start = new Date(entry.start);
        const end = new Date(entry.end);
        const days = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);

        // If it's a full year (FY) filing tag, it might contain the 365-day cumulative value.
        // We only bypass this if it's a Q1/Q2/Q3 window (around 90 days)
        if (entry.fp !== "FY" && days > 105) return;
      }

      let value = entry.val;

      // Map using the explicit fiscal identifier (e.g., "2025-FY" or "2026-Q1")
      // instead of the volatile, shifting calendar date strings
      const mapKey = `${entry.fy}-${entry.fp}`;
      periodMap[mapKey] = value;
    }
  });

  return periodMap;
}

/**
 * Computes margins on the fly from baseline map states
 */
export function computePercentageRow(
  label: string,
  numeratorMap: Record<string, number>,
  denominatorMap: Record<string, number>,
  timeline: FiscalMilestone[],
) {
  const values = timeline.map((target) => {
    const mapKey = `${target.year}-${target.period}`;
    const num = numeratorMap[mapKey];
    const den = denominatorMap[mapKey];
    if (num && den && den !== 0) {
      return formatFinancialNumber((num / den) * 100, true);
    }
    return "-";
  });
  return { title: label, values };
}

/**
 * Maps standard chronological arrays out of extracted period records
 */
export function buildFinancialRow(
  label: string,
  periodMap: Record<string, number>,
  timeline: FiscalMilestone[],
) {
  const values = timeline.map((target) => {
    const mapKey = `${target.year}-${target.period}`;
    const val = periodMap[mapKey];
    return val !== undefined ? formatFinancialNumber(val) : "-";
  });
  return { title: label, values };
}

function formatFinancialNumber(
  value: number | null | undefined,
  isPercentage = false,
): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  if (isPercentage) return `${value.toFixed(2)}%`;

  const absVal = Math.abs(value);
  if (absVal >= 1_000_000_000_000)
    return `${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (absVal >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (absVal >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  return value.toFixed(2);
}
