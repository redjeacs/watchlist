"use client";

import React, { useState, useEffect } from "react";
import FinancialGrid from "@/components/StockPage/FinancialGrid"; // Path to your Tailwind grid component

// Define the shape expected by the UI grid
interface ParsedFinancials {
  headers: string[];
  currency: string;
  rows: Array<{
    title: string;
    values: string[];
  }>;
}

export default function PerformanceDashboard({ symbol }: { symbol: string }) {
  const [financialData, setFinancialData] = useState<ParsedFinancials | null>(
    null,
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStockData() {
      try {
        setLoading(true);
        // Calls the route handler we configured in Step 1
        const res = await fetch(`/api/stock/financials?symbol=${symbol}`);

        if (!res.ok) throw new Error("Failed to load spreadsheet metrics");

        const data: ParsedFinancials = await res.json();
        setFinancialData(data);
        console.log(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadStockData();
  }, []);

  if (loading)
    return (
      <div className="text-center p-12 text-slate-500">
        Loading formatted sheets...
      </div>
    );
  if (error)
    return <div className="text-center p-12 text-red-500">Error: {error}</div>;

  return (
    <div className="bg-slate-50 min-h-screen p-8">
      <div className="max-w-4xl mx-auto mb-6">
        <h1 className="text-3xl font-extrabold text-slate-900">
          Corporate Income Statement
        </h1>
        <p className="text-slate-500">
          Quarterly financial overview formatted directly from EDGAR logs
        </p>
      </div>

      {/* Renders the custom columns effortlessly */}
      {financialData && <FinancialGrid financialData={financialData} />}
    </div>
  );
}
