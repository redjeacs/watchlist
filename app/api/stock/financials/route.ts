export const dynamic = "force-dynamic";
import { parseSECCompanyFacts } from "@/utils/financialParser";
import { NextRequest, NextResponse } from "next/server";

const SEC_CIK_LOOKUP_KEY = process.env.SEC_CIK_LOOKUP_KEY;

interface SecTickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

interface SecTickersResponse {
  [key: string]: SecTickerEntry;
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase();

    if (!symbol) {
      return NextResponse.json(
        { error: "Symbol query parameter is required" },
        { status: 400 },
      );
    }

    const rawCik = await getCikFromTicker(symbol);

    if (!rawCik) {
      return NextResponse.json(
        { error: `CIK lookup failed for ticker symbol: ${symbol}` },
        { status: 404 },
      );
    }
    const cik = rawCik.padStart(10, "0");

    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const factsResponse = await fetch(factsUrl, {
      headers: DIRECT_SEC_HEADERS,
    });

    if (!factsResponse.ok) {
      return NextResponse.json(
        { error: `SEC API returned an error status: ${factsResponse.status}` },
        { status: factsResponse.status },
      );
    }

    const companyFacts = await factsResponse.json();

    const formattedFinancials = parseSECCompanyFacts(companyFacts);

    return NextResponse.json(formattedFinancials);
  } catch (error: any) {
    console.error("Server API handler error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  }
}
