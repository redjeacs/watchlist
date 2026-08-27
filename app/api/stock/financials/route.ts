export const dynamic = "force-dynamic";

import { cp } from "fs";
import { NextRequest, NextResponse } from "next/server";

const SEC_CIK_LOOKUP_KEY = process.env.SEC_CIK_LOOKUP_KEY;

const DIRECT_SEC_HEADERS = {
  "User-Agent": "MyFinancialApp/1.0 (contact@myfinancialapp.com)",
  "Accept-Encoding": "gzip, deflate",
};

async function getCikFromSecApiIo(symbol: string): Promise<string | null> {
  if (!SEC_CIK_LOOKUP_KEY) {
    console.error("Missing SEC_API_IO_KEY environment variable.");
    return null;
  }

  try {
    const url = `https://sec-api.io${symbol}?token=${SEC_CIK_LOOKUP_KEY}`;

    const response = await fetch(url, {
      method: "GET",
    });

    if (!response.ok) {
      console.error(
        `sec-api.io error: ${response.status} ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0 && data[0].cik) {
      return data[0].cik;
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch CIK from sec-api.io:", error);
    return null;
  }
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

    const cik = await getCikFromSecApiIo(symbol);
    if (!cik) {
      return NextResponse.json(
        { error: `CIK lookup failed for ticker symbol: ${symbol}` },
        { status: 404 },
      );
    }

    const factsUrl = `https://sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
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

    return NextResponse.json({
      ticker: symbol,
      cik: cik,
      companyName: companyFacts.entityName,
      latestQuarterlyRevenues: companyFacts,
    });
  } catch (error: any) {
    console.error("Server API handler error:", error);
    return NextResponse.json(
      { error: "Internal Server Error", details: error.message },
      { status: 500 },
    );
  }
}
