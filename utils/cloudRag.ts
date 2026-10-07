import { Pinecone, RecordMetadata } from "@pinecone-database/pinecone";
import { GoogleGenAI } from "@google/genai";

interface FinancialMetadata extends RecordMetadata {
  text: string;
  ticker: string;
}

const getPineconeIndex = () => {
  if (!process.env.PINECONE_API_KEY || !process.env.PINECONE_INDEX) return null;
  const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  return pc.index<FinancialMetadata>({ name: process.env.PINECONE_INDEX! });
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

/**
 * Executes a high-speed Hybrid RAG query.
 * Combines real-time memory injections from Finnhub with historical database records.
 */
export async function queryCloudFinancialRag(
  tickerSymbol: string,
  question: string,
) {
  const index = getPineconeIndex();

  // ==========================================
  // 📡 STEP 1: INSTANT FINNHUB REAL-TIME NEWS FETCH
  // ==========================================
  const today = new Date();
  const pastDate = new Date();
  pastDate.setDate(today.getDate() - 7); // Grab news from the past 7 days

  const formatDate = (date: Date) => date.toISOString().split("T")[0];
  const fromStr = formatDate(pastDate);
  const toStr = formatDate(today);

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey)
    throw new Error("FINNHUB_API_KEY environment variable is missing");

  const url = `https://finnhub.io/api/v1/company-news?symbol=${tickerSymbol}&from=${fromStr}&to=${toStr}&token=${apiKey}`;

  let liveNewsContext =
    "No real-time market articles could be retrieved at this moment.";
  let rawArticles: any[] = [];

  try {
    const newsResponse = await fetch(url, { method: "GET" });
    const newsData = await newsResponse.json();

    if (newsResponse.ok && Array.isArray(newsData) && newsData.length > 0) {
      rawArticles = newsData.slice(0, 5);
      liveNewsContext = rawArticles
        .map(
          (art) =>
            `Headline: ${art.headline}\nSummary: ${art.summary || "No summary provided."}`,
        )
        .join("\n\n");
    }
  } catch (err) {
    console.error(
      "⚠️ Failed to fetch fresh context directly from Finnhub:",
      err,
    );
  }

  // ==========================================
  // 🧠 STEP 2: CONCURRENT HISTORICAL VECTOR DATABASE QUERY
  // ==========================================
  let historicalContext =
    "No deeper archival records matched the input query coordinates.";

  if (index) {
    try {
      const queryResponse = await index.searchRecords({
        query: {
          topK: 3,
          inputs: { text: question },
          filter: { ticker: { $eq: tickerSymbol } },
        },
        fields: ["text"],
      });

      if (queryResponse.result?.hits && queryResponse.result.hits.length > 0) {
        historicalContext = queryResponse.result.hits
          .map((hit) => {
            const fields = hit.fields as Record<string, any>;
            return fields?.text as string;
          })
          .filter(Boolean)
          .join("\n\n");
      }
    } catch (err) {
      console.error("⚠️ Pinecone historical query failed:", err);
    }
  }

  // ==========================================
  // ⚡ STEP 3: ASYNCHRONOUS BACKGROUND RECORD UPSERT
  // ==========================================
  // This is a non-blocking "fire-and-forget" promise. The client does NOT wait for this.
  if (index && rawArticles.length > 0) {
    // Format records explicitly matching the Inference API parameter contracts
    const recordsToUpsert = rawArticles.map((art: any, i: number) => ({
      id: `cloud-${tickerSymbol}-${Date.now()}-${i}`,
      text: `${art.headline}. ${art.summary || ""}`,
      ticker: tickerSymbol,
    }));

    index.upsertRecords({ records: recordsToUpsert as any }).catch((err) => {
      console.error("❌ Background vector storage update failed:", err);
    });
  }

  // ==========================================
  // 🤖 STEP 4: GENERATE SYNTHESIZED INSIGHTS VIA GEMINI
  // ==========================================
  const aiResponse = await ai.models.generateContent({
    model: "gemini-3.6-flash",
    config: {
      systemInstruction: `You are an elite institutional financial core analyst for the stock ticker: ${tickerSymbol}.
      Your job is to answer the user's inquiry using a hybrid mix of real-time market data and underlying historical memory archives.
      
      Always prioritize current facts listed under the LIVE REAL-TIME RECENT NEWS segment for contemporary events.
      Cross-reference information using the HISTORICAL MEMORY DATABASE context.
      If neither context source contains relevant structural indicators to answer the query safely, explicitly flag the data gap.
      
      =========================================
      1. LIVE REAL-TIME RECENT NEWS FEEDS:
      ${liveNewsContext}
      
      =========================================
      2. HISTORICAL MEMORY DATABASE RECORDS:
      ${historicalContext}
      =========================================`,
    },
    contents: question,
  });

  return {
    answer:
      aiResponse.text ||
      "The analysis processing module yielded an empty text output representation.",
  };
}
