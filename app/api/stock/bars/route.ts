export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const timeframe = searchParams.get("timeframe") || "1D";

  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }

  const keyId = process.env.ALPACA_API_KEY;
  const secretKey = process.env.ALPACA_API_SECRET;

  if (!keyId || !secretKey) {
    return NextResponse.json({ error: "Server config error" }, { status: 500 });
  }

  // Calculate timeframe requirements precisely
  const now = new Date();
  let start = new Date();
  let alpacaTimeframe = "1Day";

  switch (timeframe) {
    case "1D":
      start.setDate(now.getDate() - 1);
      alpacaTimeframe = "5Min";
      break;
    case "5D":
      start.setDate(now.getDate() - 5);
      alpacaTimeframe = "1Hour";
      break;
    case "1M":
      start.setMonth(now.getMonth() - 1);
      alpacaTimeframe = "1Day";
      break;
    case "6M":
      start.setMonth(now.getMonth() - 6);
      alpacaTimeframe = "1Day";
      break;
    case "1Y":
      start.setFullYear(now.getFullYear() - 1);
      alpacaTimeframe = "1Day";
      break;
    case "MAX":
      start.setFullYear(now.getFullYear() - 5); // 5-year free tier limit
      alpacaTimeframe = "1Week";
      break;
  }

  const url = `https://alpaca.markets{symbol}/bars?start=${start.toISOString()}&end=${now.toISOString()}&timeframe=${alpacaTimeframe}&currency=USD&feed=sip`;

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
      return NextResponse.json(
        { error: "Alpaca bars failed" },
        { status: response.status },
      );
    }

    const data = await response.json();
    const bars = data.bars || [];

    // Map raw data points safely for client line graph execution
    const chartData = bars.map((bar: any) => ({
      date: new Date(bar.t).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: timeframe === "1D" || timeframe === "5D" ? "2-digit" : undefined,
      }),
      price: Math.round(bar.c * 100) / 100,
    }));

    return NextResponse.json(chartData);
  } catch (error) {
    console.error("Bars API Route Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
