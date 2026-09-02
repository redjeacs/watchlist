// @/utils/financialParser.ts

interface SECConceptUnit {
  end: string;
  val: number;
  form: string;
  start?: string;
  fy: number;
  fp: string;
}

function isQuarterlyEntry(entry: any): boolean {
  if (!entry || !entry.form || !entry.end) return false;

  const validForm = ["10-Q", "10-K", "6-K", "20-F"].includes(entry.form);
  if (!validForm) return false;

  if (entry.fp) {
    const fp = String(entry.fp).toUpperCase();
    if (fp === "FY") return false;
    if (fp.startsWith("Q")) return true;
  }

  if (!entry.start) return false;

  const start = new Date(entry.start);
  const end = new Date(entry.end);
  const days = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);

  return Number.isFinite(days) && days <= 200;
}

function isRealQuarterWindow(entry: any): boolean {
  if (!entry || !entry.form || !entry.end) return false;

  const validForms = ["10-Q", "6-K", "20-F"];
  if (!validForms.includes(entry.form)) return false;

  const fp = String(entry.fp || "").toUpperCase();
  if (!/^Q[1-4]$/.test(fp)) return false;

  if (!entry.start) return false;

  const start = new Date(entry.start);
  const end = new Date(entry.end);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
    return false;

  const days = (end.getTime() - start.getTime()) / (1000 * 3600 * 24);

  // Filter out mislabeled fiscal-year-start rows that are not true quarter windows
  return days >= 70 && days <= 140;
}

/**
 * 1. AUTOMATIC TIMELINE GENERATOR: Steps backward from today to find the last 4 quarters
 */
export function detectActualTimeline(payloads: any[]): string[] {
  const dateSet = new Set<string>();

  payloads.forEach((payload) => {
    if (!payload || !payload.units) return;
    const unitKey =
      Object.keys(payload.units).find((k) => k == "USD") ||
      Object.keys(payload.units)[0];
    if (!unitKey) return;

    const entries: SECConceptUnit[] = payload.units[unitKey] || [];

    entries.forEach((entry) => {
      isQuarterlyEntry(entry);
      dateSet.add(entry.end);
    });
  });

  // Sort chronologically (oldest to newest) and take the last 4 available reporting dates
  return Array.from(dateSet).sort().slice(-4);
}

/**
 * Extracts true 3-month quarterly data points from a standalone concept response
 */
export function extractConceptPeriodData(
  payload: any,
  targetTimeline: string[],
): Record<string, number> {
  const periodMap: Record<string, number> = {};
  if (!payload || !payload.units) return periodMap;

  const unitKey =
    Object.keys(payload.units).find((k) => k !== "shares") ||
    Object.keys(payload.units)[0];

  if (!unitKey) return periodMap;

  const entries = payload.units[unitKey] || [];

  const actualQuarterEntries = entries.filter((entry: any) => {
    return isRealQuarterWindow(entry) && targetTimeline.includes(entry.end);
  });

  for (const entry of actualQuarterEntries) {
    periodMap[entry.end] = entry.val;
  }

  const estimatedQ4 = estimateQ4FromAnnual(entries, targetTimeline);
  Object.assign(periodMap, estimatedQ4);

  return periodMap;
}

/**
 * Computes margins on the fly from baseline map states
 */
export function computePercentageRow(
  label: string,
  numeratorMap: Record<string, number>,
  denominatorMap: Record<string, number>,
  targetTimeline: string[],
) {
  const values = targetTimeline.map((dateStr) => {
    const num = numeratorMap[dateStr];
    const den = denominatorMap[dateStr];
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
  targetTimeline: string[],
) {
  const values = targetTimeline.map((dateStr) => {
    const val = periodMap[dateStr];
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

function estimateQ4FromAnnual(
  entries: any[],
  targetTimeline: string[],
): Record<string, number> {
  const annual = entries
    .filter(
      (entry) =>
        entry?.form === "10-K" &&
        String(entry?.fp || "").toUpperCase() === "FY",
    )
    .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];

  if (!annual) return {};

  const fiscalYear = annual.fy;
  const annualStart = new Date(annual.start);
  console.log(annualStart);
  const q1q3 = entries.filter(
    (entry) =>
      entry?.fy === fiscalYear &&
      ["10-Q", "10-K"].includes(entry?.form) &&
      /^Q[1-3]$/i.test(String(entry?.fp || "")) &&
      isRealQuarterWindow(entry) &&
      new Date(entry.start) >= annualStart,
  );

  if (q1q3.length < 3) return {};

  const q1 = q1q3.find((e) => /^Q1$/i.test(String(e.fp || "")))?.val ?? 0;
  const q2 = q1q3.find((e) => /^Q2$/i.test(String(e.fp || "")))?.val ?? 0;
  const q3 = q1q3.find((e) => /^Q3$/i.test(String(e.fp || "")))?.val ?? 0;

  const q4Value = annual.val - q1 - q2 - q3;

  const q4Date = annual.end;
  if (!targetTimeline.includes(q4Date)) return {};

  return { [q4Date]: q4Value };
}
