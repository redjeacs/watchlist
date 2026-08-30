// Define structured metadata for a row data array
interface FinancialRow {
  title: string;
  isPercentage?: boolean;
  values: (string | number | null)[];
}

// Target reporting period end dates matching your template requirements
const TARGET_PERIODS = ["2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"];
const TWD_EXCHANGE_RATE = 32.5; // Example conversion multiplier if SEC data loads in USD base

/**
 * Formats big numerical strings into neat financial suffix layouts (T, B, M)
 */
function formatFinancialNumber(
  value: number | null | undefined,
  isPercentage = false,
): string {
  if (value === null || value === undefined || isNaN(value)) return "-";

  if (isPercentage) {
    return `${value.toFixed(2)}%`;
  }

  const absoluteValue = Math.abs(value);
  let formattedString = "";

  if (absoluteValue >= 1_000_000_000_000) {
    formattedString = `${(value / 1_000_000_000_000).toFixed(2)}T`;
  } else if (absoluteValue >= 1_000_000_000) {
    formattedString = `${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (absoluteValue >= 1_000_000) {
    formattedString = `${(value / 1_000_000).toFixed(2)}M`;
  } else {
    formattedString = value.toFixed(2);
  }

  return formattedString;
}

/**
 * Extracts a specific metric out of the deep SEC taxonomy objects
 */
function extractMetricData(
  factsPayload: any,
  primaryTag: string,
  alternativeTag?: string,
): Record<string, number> {
  const periodDataMap: Record<string, number> = {};

  // SEC structure routes through either 'us-gaap' or 'ifrs-full' namespaces
  const taxonomyGroup =
    factsPayload.facts?.["us-gaap"] || factsPayload.facts?.["ifrs-full"] || {};
  const dataBlock =
    taxonomyGroup[primaryTag] ||
    (alternativeTag ? taxonomyGroup[alternativeTag] : null);

  if (!dataBlock || !dataBlock.units) return periodDataMap;

  // Grab the base currency array array (USD, TWD, or EUR)
  const currencyKey = Object.keys(dataBlock.units)[0];
  const filingsList = dataBlock.units[currencyKey] || [];

  filingsList.forEach((filing: any) => {
    // Isolate quarterly records (Form 10-Q or Form 6-K)
    if (
      TARGET_PERIODS.includes(filing.end) &&
      (filing.form === "10-Q" ||
        filing.form === "6-K" ||
        filing.form === "20-F")
    ) {
      // Convert standard raw numbers to TWD currency space if the source base is USD
      let convertedValue = filing.val;
      if (currencyKey === "USD") {
        convertedValue = filing.val * TWD_EXCHANGE_RATE;
      }
      periodDataMap[filing.end] = convertedValue;
    }
  });

  return periodDataMap;
}

/**
 * Main parser entry point to orchestrate row arrays
 */
export function parseSECCompanyFacts(rawSecJson: any) {
  // Define row configurations to pull sequentially
  const rowConfigurations = [
    { label: "Revenue", tag: "Revenue", alt: "Revenues" },
    { label: "Cost of goods sold", tag: "CostOfSales", alt: "CostOfGoodsSold" },
    { label: "Cost of revenue", tag: "CostOfSales", alt: "CostOfGoodsSold" },
    {
      label: "Research and development expenses",
      tag: "ResearchAndDevelopmentExpense",
    },
    {
      label: "Total research and development expenses",
      tag: "ResearchAndDevelopmentExpenseTotal",
    },
    {
      label: "Selling, general, and admin expenses",
      tag: "AdministrativeExpense",
      alt: "SellingGeneralAndAdministrativeExpense",
    },
    {
      label: "Operating income",
      tag: "ProfitLossFromOperatingActivities",
      alt: "OperatingIncomeLoss",
    },
    {
      label: "Income tax expense",
      tag: "IncomeTaxExpenseContinuingOperations",
      alt: "IncomeTaxExpenseBenefit",
    },
    { label: "Net income", tag: "ProfitLoss", alt: "NetIncomeLoss" },
  ];

  const formattedOutputTable = rowConfigurations.map((config) => {
    const rawDataValuesMap = extractMetricData(
      rawSecJson,
      config.tag,
      config.alt,
    );

    // Process matching values chronologically through the target dates array loop
    const mappedPeriodValues = TARGET_PERIODS.map((date) => {
      const numericVal = rawDataValuesMap[date];
      return numericVal !== undefined ? formatFinancialNumber(numericVal) : "-";
    });

    return {
      title: config.label,
      values: mappedPeriodValues,
    };
  });

  // Calculate dynamic derivation lines like margins on the fly
  const revenueValues = extractMetricData(rawSecJson, "Revenue", "Revenues");
  const netIncomeValues = extractMetricData(
    rawSecJson,
    "ProfitLoss",
    "NetIncomeLoss",
  );

  const computedProfitMargins = TARGET_PERIODS.map((date) => {
    const rev = revenueValues[date];
    const net = netIncomeValues[date];
    if (rev && net) {
      const marginPercentage = (net / rev) * 100;
      return formatFinancialNumber(marginPercentage, true);
    }
    return "-";
  });

  formattedOutputTable.push({
    title: "Net profit margin",
    values: computedProfitMargins,
  });

  return {
    headers: ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026"],
    currency: "All values in TWD",
    rows: formattedOutputTable,
  };
}
