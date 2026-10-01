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
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [analysisReport, setAnalysisReport] = useState("");
  const [sources, setSources] = useState<SourceMaterial[]>([]);
  const [question, setQuestion] = useState(
    "What are the major headwinds or expansion catalysts mentioned by experts?",
  );

  // Helper utility to pause execution between status pings
  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const executePipelineWorkflow = async () => {
    setLoading(true);
    setAnalysisReport("");
    setSources([]);

    try {
      // -----------------------------------------------------------------
      // PHASE 1: Trigger background scraping & parsing via Python FastAPI
      // -----------------------------------------------------------------
      setStatusMessage(
        "📡 Step 1/3: Spin-up async scraping workers inside FastAPI...",
      );
      const ingestRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: activeTicker, action: "ingest" }),
      });

      const ingestData = await ingestRes.json();
      console.log(ingestData);
      if (!ingestRes.ok)
        throw new Error(
          ingestData.error || "Ingestion loop initialization dropped.",
        );

      // -----------------------------------------------------------------
      // PHASE 2: Safe Async Loop Polling (Bypasses Next.js Timeout Triggers)
      // -----------------------------------------------------------------
      let isProcessing = true;
      let durationSeconds = 0;

      while (isProcessing) {
        durationSeconds += 2;
        // Safety valve: Throw error if database ingestion hangs past 60s
        if (durationSeconds > 60) {
          throw new Error(
            "Ingestion workload exceeded safety execution limits (60s).",
          );
        }

        await delay(2000); // Hold for 2 seconds before requesting status validation

        setStatusMessage(
          `⏳ Step 2/3: Python background worker parsing articles... (${durationSeconds}s)`,
        );

        const statusRes = await fetch("/api/ai", {
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

      // -----------------------------------------------------------------
      // PHASE 3: Query stored chunks & let Qwen2.5-Coder process report
      // -----------------------------------------------------------------
      setStatusMessage(
        "🤖 Step 3/3: Mapping vectors & computing report via Qwen2.5-Coder-14B...",
      );
      const queryRes = await fetch("/api/ai", {
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

      // Bind properties cleanly back into state arrays
      setAnalysisReport(queryData.analysis);
      setSources(queryData.sources || []);
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
      <h3 className="text-md font-bold mb-1 flex items-center gap-2">
        <span>🐍</span> Python RAG Research Engine — {activeTicker}
      </h3>
      <p className="text-xs text-gray-400 mb-4">
        Extracts unstructured financial nodes and passes data arrays through
        your local Python microservice.
      </p>

      <div className="space-y-3">
        <label className="text-xs font-semibold text-gray-300">
          Ask your Local AI Workspace:
        </label>
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={loading}
          className="w-full p-2.5 bg-gray-800 border border-gray-700 rounded-lg text-sm outline-none focus:border-emerald-500 text-gray-100 disabled:opacity-50"
        />

        <button
          onClick={executePipelineWorkflow}
          disabled={loading || !activeTicker}
          className="w-full py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 rounded-lg text-sm font-semibold hover:from-emerald-500 hover:to-teal-500 disabled:opacity-30 transition-all shadow-md"
        >
          {loading ? "Processing System Array..." : "Run Pipeline Computation"}
        </button>
      </div>

      {/* Dynamic Status Progress Box */}
      {statusMessage && (
        <div className="mt-4 p-3 bg-gray-800/50 border border-dashed border-gray-700 rounded-lg text-xs font-mono text-emerald-400 animate-pulse">
          {statusMessage}
        </div>
      )}

      {/* AI Analysis Final Generated Text Area */}
      {analysisReport && (
        <div className="mt-4 space-y-3">
          <div className="p-4 bg-black rounded-lg text-xs leading-relaxed max-h-72 overflow-y-auto border border-gray-800 font-mono text-gray-200 whitespace-pre-wrap">
            {analysisReport}
          </div>

          {/* Render Clickable Citations cleanly below content block */}
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
