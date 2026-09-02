export const dynamic = "force-dynamic";
import {
  extractConceptPeriodData,
  buildFinancialRow,
  computePercentageRow,
  ConceptPayload,
  detectActualTimeline,
} from "@/utils/financialParser";
import { NextRequest, NextResponse } from "next/server";

interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

const DIRECT_SEC_HEADERS = {
  "User-Agent": "MyFinancialApp/1.0 (jerryc19112235@gmail.com)",
  Accept: "application/json",
  "Accept-Encoding": "gzip, deflate",
};

let tickerToCikCache: Map<string, string> | null = null;

async function initializeTickerMap(): Promise<Map<string, string> | null> {
  if (tickerToCikCache) return tickerToCikCache;

  try {
    const response = await fetch(
      "https://www.sec.gov/files/company_tickers.json",
      {
        method: "GET",
        headers: DIRECT_SEC_HEADERS,
        next: { revalidate: 86400 }, // Cache data on Next.js server side for 24 hours
      },
    );

    if (!response.ok) throw new Error("Failed to pull corporate directory");

    const data: Record<string, SecTickerEntry> = await response.json();
    const tempMap = new Map<string, string>();

    // Single pass-through to flip structural keys
    const entries = Object.values(data);
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      // Store uppercase ticker as key and zero-padded 10-digit CIK as value
      tempMap.set(
        entry.ticker.toUpperCase(),
        String(entry.cik_str).padStart(10, "0"),
      );
    }

    tickerToCikCache = tempMap;
    return tickerToCikCache;
  } catch (error) {
    console.error("SEC Index initialization error:", error);
    return null;
  }
}

export async function getCikFromTicker(ticker: string): Promise<string | null> {
  const map = await initializeTickerMap();
  if (!map) return null;

  return map.get(ticker.toUpperCase()) || null;
}

async function fetchCompanyFacts(cik: string) {
  const res = await fetch(
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    {
      headers: DIRECT_SEC_HEADERS,
      cache: "no-store",
    },
  );

  if (!res.ok)
    throw new Error(`SEC companyfacts request failed for CIK ${cik}`);

  const data = await res.json();
  return data;
}

function getFactByTag(payload: any, tagNames: string[]) {
  const roots = [payload?.facts?.["us-gaap"], payload?.facts?.["ifrs-full"]];

  for (const root of roots) {
    if (!root) continue;

    for (const tag of tagNames) {
      const fact = root[tag];
      if (fact) return fact;
    }
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol parameter required" },
        { status: 400 },
      );
    }

    const rawCik = await getCikFromTicker(symbol);
    if (!rawCik) {
      return NextResponse.json(
        { error: `CIK lookup failed for ${symbol}` },
        { status: 404 },
      );
    }
    const cik = rawCik.padStart(10, "0");
    const companyFacts = await fetchCompanyFacts(cik);

    const targetRowConfigs = [
      {
        id: "revenue",
        tags: [
          "RevenueFromContractWithCustomerExcludingAssessedTax",
          "Revenue",
          "Revenues",
          "SalesRevenueNet",
        ],
        label: "Revenue",
      },
      {
        id: "cogs",
        tags: ["CostOfGoodsAndServicesSold", "CostOfSales", "CostOfGoodsSold"],
        label: "Cost of goods sold",
      },
      {
        id: "rnd",
        tags: [
          "ResearchAndDevelopmentExpense",
          "ResearchAndDevelopmentExpenseTotal",
        ],
        label: "Research and development expenses",
      },
      {
        id: "sga",
        tags: [
          "SellingGeneralAndAdministrativeExpense",
          "AdministrativeExpense",
        ],
        label: "Selling, general, and admin expenses",
      },
      {
        id: "operating",
        tags: ["OperatingIncomeLoss", "ProfitLossFromOperatingActivities"],
        label: "Operating income",
      },
      {
        id: "tax",
        tags: [
          "IncomeTaxExpenseBenefit",
          "IncomeTaxExpenseContinuingOperations",
        ],
        label: "Income tax expense",
      },
      {
        id: "netIncome",
        tags: ["NetIncomeLoss", "ProfitLoss"],
        label: "Net income",
      },
    ];

    // Fire all network endpoints in parallel
    const resolvedPayloads = targetRowConfigs.map((config) =>
      getFactByTag(companyFacts, config.tags),
    );

    console.log(resolvedPayloads);

    const dynamicTimeline = detectActualTimeline(resolvedPayloads);

    // Map raw payloads to timeline map structures
    const dataMaps: Record<string, Record<string, number>> = {};
    targetRowConfigs.forEach((config, index) => {
      dataMaps[config.id] = extractConceptPeriodData(
        resolvedPayloads[index],
        dynamicTimeline,
      );
    });

    // Build finalized table data rows
    const rows = targetRowConfigs.map((config) =>
      buildFinancialRow(config.label, dataMaps[config.id], dynamicTimeline),
    );

    // Append custom computed profit margins row
    const marginRow = computePercentageRow(
      "Net profit margin",
      dataMaps["netIncome"],
      dataMaps["revenue"],
      dynamicTimeline,
    );
    rows.push(marginRow);

    return NextResponse.json({
      headers: ["Sep 2025", "Dec 2025", "Mar 2026", "Jun 2026"],
      currency: "All values in TWD",
      rows: rows,
    });
  } catch (error: any) {
    console.error("Concept API route crashed:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  }
}
