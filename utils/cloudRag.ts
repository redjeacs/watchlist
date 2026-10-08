import { Pinecone, RecordMetadata } from "@pinecone-database/pinecone";
import { GoogleGenAI } from "@google/genai";
import * as cheerio from "cheerio";
import TurndownService from "turndown";

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
const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

/**
 * Helper function to scrape a URL, extract core readable text, and convert to Markdown.
 */
async function fetchAndParseFullText(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(5000), // Timeout after 5 seconds to prevent hung requests
    });

    if (!response.ok) return "";
    const html = await response.text();
    const content = cheerio.load(html);

    // Remove boilerplate elements that pollute vector space
    content(
      "script, style, nav, footer, header, ads, .sidebar, .comments",
    ).remove();

    // Target common body article wrappers used by major financial outlets
    const articleContainer = content(
      "article, .article-body, .story-content, .main-content, body",
    );

    // Fall back to body text if targeted structures are missing
    const rawHtml =
      articleContainer.length > 0
        ? articleContainer.html()
        : content("body").html();
    if (!rawHtml) return "";

    // Convert into clean Markdown
    const markdown = turndownService.turndown(rawHtml);

    // Standardize whitespace gaps
    return markdown.replace(/\n\s*\n/g, "\n\n").trim();
  } catch (err) {
    console.warn(
      `⚠️ Failed to parse full text from ${url}:`,
      err instanceof Error ? err.message : err,
    );
    return "";
  }
}

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
  // 📡 STEP 1: INSTANT FINNHUB REAL-TIME NEWS & FULL TEXT FETCH
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
  let parsedArticles: Array<{
    id: number;
    headline: string;
    summary: string;
    fullText: string;
  }> = [];

  try {
    const newsResponse = await fetch(url, { method: "GET" });
    const newsData = await newsResponse.json();

    if (newsResponse.ok && Array.isArray(newsData) && newsData.length > 0) {
      // Pick top 3 instead of 5, as full-text payloads are significantly larger
      const rawArticles = newsData.slice(0, 3);

      // Concurrent scraping execution for speed optimization
      const scrapePromises = rawArticles.map(async (art: any) => {
        let fullText = "";
        if (art.url) {
          fullText = await fetchAndParseFullText(art.url);
        }
        return {
          id: art.id,
          headline: art.headline,
          summary: art.summary || "No summary provided.",
          fullText: fullText || art.summary || "No body content resolved.",
        };
      });

      const settledScrapes = await Promise.allSettled(scrapePromises);

      parsedArticles = settledScrapes
        .filter(
          (result): result is PromiseFulfilledResult<any> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value);

      if (parsedArticles.length > 0) {
        liveNewsContext = parsedArticles
          .map(
            (art) =>
              `### Headline: ${art.headline}\nSummary: ${art.summary}\nFull Document Content:\n${art.fullText}`,
          )
          .join("\n\n---\n\n");
      }
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
      // Note: `inputs: { text: ... }` implies a custom Pinecone setup (e.g. Pinecone Inference / Canopy).
      // Ensure your index model supports embedded strings directly.
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
  if (index && parsedArticles.length > 0) {
    const recordsToUpsert = parsedArticles.map((art, i: number) => {
      // Chunking warning: If art.fullText exceeds Pinecone's payload limit per vector (usually 40KB)
      // or your model's maximum input token length, you will need to slice this text before upserting.
      const textToStore = `Headline: ${art.headline}. Content: ${art.fullText}`;

      return {
        id: `cloud-${tickerSymbol}-${art.id || Date.now()}-${i}`,
        text: textToStore.slice(0, 8000), // Safety cap limit to avoid hitting payload sizing breaks
        ticker: tickerSymbol,
      };
    });

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
      systemInstruction: `You are a professional financial research analyst. 
Your task is to answer the user's question using ONLY the provided expert context snippets. 
Structure your response cleanly using Markdown format:
- Use bold headings for key insights
- Use brief bullet points for catalysts or headwinds
- Do NOT hallucinate. If the context does not provide the answer, say 'Insufficient local data.'

=========================================
CONTEXT SNIPPETS AVAILABLE:

1. LIVE REAL-TIME RECENT NEWS FEEDS (WITH FULL TEXT):
${liveNewsContext}

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
