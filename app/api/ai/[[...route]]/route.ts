import { NextRequest, NextResponse } from "next/server";
import { Pinecone, RecordMetadata } from "@pinecone-database/pinecone";
import { GoogleGenAI } from "@google/genai"; // Native Official Google SDK
import { queryCloudFinancialRag } from "@/utils/cloudRag";

const FASTAPI_BASE_URL = "http://127.0.0.1:8000";

// Interface for type safety inside our Pinecone query matching rows
interface FinancialMetadata extends RecordMetadata {
  text: string;
  ticker: string;
}

// Lazy-load Pinecone only if the token is present to avoid crash issues locally
const getPineconeIndex = () => {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) return null;
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return pc.index<FinancialMetadata>({ name: process.env.PINECONE_INDEX! });
};

// Initialize Native Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

interface QueryPayload {
  ticker: string;
  question: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
) {
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
    const resolvedParams = await params;
    const targetEngine = resolvedParams.route?.[0] || "gemini";

    // =========================================================================
    // 🖥️ BRANCH A: LOCAL PYTHON WORKSPACE PIPELINE (/api/ai/local)
    // =========================================================================
    if (targetEngine === "local") {
      // 📡 1. LOCAL INGESTION
      if (action === "ingest") {
        const urlParams = new URLSearchParams({ ticker: tickerSymbol });
        const response = await fetch(
          `${FASTAPI_BASE_URL}/api/ingest?${urlParams}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          },
        );
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

      // ⏳ 2. LOCAL STATUS CHECKER
      if (action === "status") {
        const response = await fetch(
          `${FASTAPI_BASE_URL}/api/ingest/status/${tickerSymbol}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          },
        );
        const data = await response.json();
        if (!response.ok) {
          return NextResponse.json(
            { error: data.detail || "Failed to fetch status" },
            { status: response.status },
          );
        }
        return NextResponse.json(data);
      }

      // 🧠 3. LOCAL RAG QUERY
      if (action === "query") {
        if (!question) {
          return NextResponse.json(
            { error: "Question text is required for analysis" },
            { status: 400 },
          );
        }
        const payload: QueryPayload = { ticker: tickerSymbol, question };
        const response = await fetch(`${FASTAPI_BASE_URL}/api/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          return NextResponse.json(
            {
              error:
                data.detail ||
                "Python analytical generator dropped the request.",
            },
            { status: response.status },
          );
        }
        return NextResponse.json(data);
      }

      return NextResponse.json(
        { error: "Invalid local workspace action specified" },
        { status: 400 },
      );
    }

    // =========================================================================
    // ☁️ BRANCH B: PRODUCTION CLOUD GOOGLE GEMINI PIPELINE (/api/ai/gemini)
    // =========================================================================
    if (targetEngine === "gemini") {
      if (action === "ingest") {
        return NextResponse.json({
          status: "success",
          detail: `Cloud ingestion acknowledge for ${tickerSymbol}.`,
        });
      }

      if (action === "status") {
        return NextResponse.json({ ticker: tickerSymbol, status: "completed" });
      }

      if (action === "query") {
        if (!question)
          return NextResponse.json(
            { error: "Question text is required" },
            { status: 400 },
          );
        const data = await queryCloudFinancialRag(tickerSymbol, question);
        return NextResponse.json(data);
      }

      return NextResponse.json(
        { error: "Invalid cloud workspace action" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Invalid API environment targeted" },
      { status: 400 },
    );
  } catch (error: any) {
    console.error("❌ Gateway Execution Failure:", error);
    return NextResponse.json(
      {
        error: `Orchestration server error: ${error.message || "Execution Interrupted"}`,
      },
      { status: 500 },
    );
  }
}
