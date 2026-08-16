import { NextRequest, NextResponse } from "next/server";
import { AlpacaApiResponse, StockDataResponse } from "@/types/stock";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();

  if (!symbol) {
    return NextResponse.json(
      { error: "Symbol parameter is required" },
      { status: 400 },
    );
  }

  const keyId = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_API_SECRET;

  if (!keyId || !secretKey) {
    console.error("Missing Alpaca API Environment Keys");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 },
    );
  }

  const url = `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbol}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "APCA-API-KEY-ID": keyId,
        "APCA-API-SECRET-KEY": secretKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Alpaca failed with status ${response.status}. Raw Response: ${errorText}`,
      );

      return NextResponse.json(
        { error: `Alpaca error status ${response.status}` },
        { status: response.status },
      );
    }

    const data: AlpacaApiResponse = await response.json();
    const snapshot = data[symbol];

    if (!snapshot) {
      return NextResponse.json(
        { error: "Stock symbol not found" },
        { status: 404 },
      );
    }

    // Extract raw metrics with strict fallbacks to avoid unexpected NaN or undefined errors
    const currentPrice = snapshot.latestTrade?.p || 0;
    const previousClose = snapshot.dailyBar?.c || 0;

    const dailyChange = previousClose ? currentPrice - previousClose : 0;
    const dailyChangePercent = previousClose
      ? (dailyChange / previousClose) * 100
      : 0;

    // Construct the structured response matching interface type declaration
    const responseData: StockDataResponse = {
      symbol,
      price: currentPrice,
      dailyChange: parseFloat(dailyChange.toFixed(2)),
      dailyChangePercent: parseFloat(dailyChangePercent.toFixed(2)),
    };

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Backend TypeScript API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
