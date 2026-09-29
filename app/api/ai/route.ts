import { NextRequest, NextResponse } from "next/server";

interface IngestPayload {
  ticker: string;
}

interface QueryPayload {
  ticker: string;
  question: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ticker, question, action } = body;

    if (!ticker) {
      return NextResponse.json(
        { error: "Ticker symbol is required" },
        { status: 400 },
      );
    }

    const tickerSymbol = ticker.toUpperCase();

    // ==========================================
    // 📡 1. INGESTION BLOCK
    // ==========================================
    if (action === "ingest") {
      const payload: IngestPayload = { ticker: tickerSymbol };

      const response = await fetch("http://127.0.0.1:8000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          {
            error:
              data.detail || "Python ingestion engine encountered an issue.",
          },
          { status: response.status },
        );
      }

      return NextResponse.json(data);
    }

    // ==========================================
    // ⏳ 2. STATUS CHECKER BLOCK
    // ==========================================
    if (action === "status") {
      const response = await fetch(
        `http://127.0.0.1:8000/status/${tickerSymbol}`,
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );

      const data = await response.json();
      if (!response.ok)
        return NextResponse.json(
          { error: data.detail || "Failed to fetch status" },
          { status: response.status },
        );
      return NextResponse.json(data);
    }

    // ==========================================
    // 🧠 3. RAG QUERY BLOCK
    // ==========================================
    if (action === "query") {
      if (!question) {
        return NextResponse.json(
          { error: "Question text is required for analysis" },
          { status: 400 },
        );
      }

      const payload: QueryPayload = { ticker: tickerSymbol, question };

      const response = await fetch("http://127.0.0.1:8000", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          {
            error:
              data.detail || "Python analytical generator dropped the request.",
          },
          { status: response.status },
        );
      }

      return NextResponse.json(data);
    }

    return NextResponse.json(
      { error: "Invalid workspace pipeline action specified" },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("❌ Failed to route traffic to Python server:", error);
    return NextResponse.json(
      {
        error: `Could not reach Python backend: ${error.message || "Server Offline"}`,
      },
      { status: 500 },
    );
  }
}
