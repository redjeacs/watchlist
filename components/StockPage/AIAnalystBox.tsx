"use client";
import { useState } from "react";

interface SourceMaterial {
  title: string;
  url: string;
}

export default function AIAnalystBox({
  activeTicker,
}: {
  activeTicker: string;
}) {
  // 🎛️ 1. Processing Engine State Toggle ("gemini" or "local")
  const [aiEngine, setAiEngine] = useState<"gemini" | "local" | string>(
    "gemini",
  );

  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [analysisReport, setAnalysisReport] = useState("");
  const [sources, setSources] = useState<SourceMaterial[]>([]);
  const [question, setQuestion] = useState(
    "What are the major headwinds or expansion catalysts mentioned by experts?",
  );
  const inProduction = process.env.NODE_ENV === "production";

  const isWarningBox = inProduction && aiEngine === "local";
  const showStatusBox = statusMessage || isWarningBox;

  const statusBoxClasses = isWarningBox
    ? "border-amber-800 text-amber-400 bg-amber-950/20"
    : aiEngine === "local"
      ? "border-emerald-800 text-emerald-400 animate-pulse"
      : "border-blue-800 text-blue-400 animate-pulse";

  // Helper utility to pause execution between status pings
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const executePipelineWorkflow = async () => {
    setLoading(true);
    setAnalysisReport("");
    setSources([]);

    try {
      // -----------------------------------------------------------------
      // PHASE 1: Trigger background scraping & parsing via API Gateway route
      // -----------------------------------------------------------------
      setStatusMessage(
        aiEngine === "local"
          ? "📡 Step 1/3: Spin-up async scraping workers inside FastAPI..."
          : "📡 Step 1/2: Preparing Cloud Ingestion and parsing triggers...",
      );

      // Points dynamically to /api/ai/local or /api/ai/gemini based on current state
      const ingestRes = await fetch(`/api/ai/${aiEngine}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: activeTicker, action: "ingest" }),
      });

      const ingestData = await ingestRes.json();
      if (!ingestRes.ok)
        throw new Error(
          ingestData.error || "Ingestion loop initialization dropped.",
        );

      // -----------------------------------------------------------------
      // PHASE 2: Safe Async Loop Polling (ONLY EXECUTES FOR LOCAL PYTHON)
      // -----------------------------------------------------------------
      if (aiEngine === "local") {
        let isProcessing = true;
        let durationSeconds = 0;

        while (isProcessing) {
          durationSeconds += 2;
          if (durationSeconds > 60) {
            throw new Error(
              "Ingestion workload exceeded safety execution limits (60s).",
            );
          }

          await delay(2000);

          setStatusMessage(
            `⏳ Step 2/3: Python background worker parsing articles... (${durationSeconds}s)`,
          );

          const statusRes = await fetch(`/api/ai/${aiEngine}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticker: activeTicker, action: "status" }),
          });

          const statusData = await statusRes.json();

          if (statusData.status === "completed") {
            isProcessing = false;
          } else if (statusData.status === "failed") {
            throw new Error(
              "Python financial data ingestion worker failed to extract document chunks.",
            );
          }
        }
      }

      // -----------------------------------------------------------------
      // PHASE 3: Query stored chunks & calculate financial analyst report
      // -----------------------------------------------------------------
      setStatusMessage(
        aiEngine === "local"
          ? "🤖 Step 3/3: Mapping vectors & computing report via Local Model..."
          : "🤖 Step 2/2: Mapping vectors & performing inference via Gemini 3.6 Flash...",
      );

      const queryRes = await fetch(`/api/ai/${aiEngine}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: activeTicker,
          question,
          action: "query",
        }),
      });

      const queryData = await queryRes.json();
      if (!queryRes.ok)
        throw new Error(
          queryData.error || "Analytical model generation failed.",
        );

      // -----------------------------------------------------------------
      // PHASE 4: Handle conditional object properties depending on active runtime engine
      // -----------------------------------------------------------------
      if (aiEngine === "gemini") {
        // Cloud payload maps response directly to data.answer
        setAnalysisReport(queryData.answer);
        setSources([]); // Cloud RAG fetches from global index metadata
      } else {
        // Local Python server payload maps response directly to data.analysis
        setAnalysisReport(queryData.analysis);
        setSources(queryData.sources || []);
      }

      setStatusMessage("");
    } catch (error: any) {
      setAnalysisReport(
        `❌ Execution Blocked: ${error.message || "Check terminal windows for exceptions."}`,
      );
      setStatusMessage("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-5 bg-gray-900 border border-gray-800 rounded-xl text-white shadow-xl mt-6">
      {/* 🎛️ ENGINE INTERFACE HEADER SELECTOR TOGGLE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-800 pb-4 mb-4 gap-3">
        <div>
          <h3 className="text-md font-bold mb-0.5 flex items-center gap-2">
            <span>{aiEngine === "local" ? "🐍" : "✨"}</span> Financial RAG
            Research Engine — {activeTicker}
          </h3>
          <p className="text-xs text-gray-400">
            {aiEngine === "local"
              ? "Passing data arrays through your local Python microservice backend."
              : "Querying native cloud vector embeddings via Pinecone Serverless and Gemini."}
          </p>
        </div>

        {/* Binary Engine Toggle Buttons */}
        <div className="flex bg-gray-950 p-1 rounded-lg border border-gray-800 w-full sm:w-auto self-start">
          <button
            type="button"
            onClick={() => setAiEngine("gemini")}
            disabled={loading}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all ${
              aiEngine === "gemini"
                ? "bg-blue-600 text-white shadow-md"
                : "text-gray-400 hover:text-white disabled:opacity-50"
            }`}
          >
            ☁️ Cloud Gemini
          </button>
          <button
            type="button"
            onClick={() => setAiEngine("local")}
            disabled={loading}
            className={`py-1.5 px-3 text-xs font-semibold rounded-md transition-all ${
              aiEngine === "local"
                ? "bg-emerald-600 text-white shadow-md"
                : "text-gray-400 hover:text-white disabled:opacity-50"
            }`}
          >
            Local
          </button>
        </div>
      </div>

      {/* Main Input Form Block */}
      <div className="space-y-3">
        <label className="text-xs font-semibold text-gray-300">
          Ask your Active{" "}
          {aiEngine === "local"
            ? "Local Model Workstation"
            : "Gemini Core Assistant"}
          :
        </label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
          className={`w-full p-2.5 bg-gray-800 border rounded-lg text-sm outline-none transition text-gray-100 disabled:opacity-50 ${
            aiEngine === "local"
              ? "focus:border-emerald-500 border-gray-700"
              : "focus:border-blue-500 border-gray-700"
          }`}
        />

        <button
          onClick={executePipelineWorkflow}
          disabled={isWarningBox || loading || !activeTicker}
          className={`w-full py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md disabled:opacity-30 ${
            aiEngine === "local"
              ? "bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500"
              : "bg-linear-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500"
          }`}
        >
          {loading ? "Processing System Array..." : "Run Pipeline Computation"}
        </button>
      </div>

      {/* Dynamic Status Progress Alert Box */}
      {showStatusBox && (
        <div
          className={`mt-4 p-3 bg-gray-800/50 border border-dashed rounded-lg text-xs font-mono ${statusBoxClasses}`}
        >
          {isWarningBox ? (
            <div className="space-y-1">
              <p className="font-semibold">
                ⚠️ Local RAG pipeline is disabled in production.
              </p>
              <p className="text-gray-400 font-sans leading-normal">
                Want to run this workload locally? Check out my{" "}
                <a
                  href="https://github.com/redjeacs/watchlist" // Replace with your actual GitHub link
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-300 underline underline-offset-2 hover:text-amber-200 transition"
                >
                  GitHub repository
                </a>{" "}
                to spin up a self-hosted model on your own hardware!
              </p>
            </div>
          ) : (
            statusMessage
          )}
        </div>
      )}

      {/* AI Generated Text Display Output Panel */}
      {analysisReport && (
        <div className="mt-4 space-y-3">
          <div className="p-4 bg-black rounded-lg text-xs leading-relaxed max-h-72 overflow-y-auto border border-gray-800 font-mono text-gray-200 whitespace-pre-wrap">
            {analysisReport}
          </div>

          {/* Render Clickable Citations (Only shown for Local Engine if arrays exist) */}
          {sources.length > 0 && (
            <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
              <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider block mb-1.5">
                📁 Audited Source Citations:
              </span>
              <ul className="space-y-1">
                {sources.map((src, i) => (
                  <li key={i} className="text-xs truncate">
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline hover:text-emerald-300 transition-colors"
                    >
                      [{i + 1}] {src.title || "Market Document Link"}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
