import React, { useState, useEffect } from "react";

// Define the shape of an individual SEC quarterly filing object
interface QuarterlyFiling {
  end: string;
  filed: string;
  form: string;
  val: number;
}

// Define the backend API JSON payload response structure
interface FinancialsResponse {
  ticker: string;
  cik: string;
  companyName: string;
  latestQuarterlyRevenues: QuarterlyFiling[];
}

interface StockFinancialsProps {
  symbol: string;
}

const StockFinancials: React.FC<StockFinancialsProps> = ({ symbol }) => {
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) return;

    async function fetchStockFinancialsData() {
      setLoading(true);
      setError(null);
      setData(null);

      try {
        const response = await fetch(
          `/api/stock/financials?symbol=${encodeURIComponent(symbol)}`,
        );

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.error || "Failed to fetch financial data.");
        }

        const result: FinancialsResponse = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message || "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchStockFinancialsData();
  }, [symbol]);

  const formatCurrency = (value: number | undefined | null): string => {
    if (value === undefined || value === null) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | undefined | null): string => {
    if (!dateStr) return "N/A";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // 1. Loading State UI
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-600 font-medium animate-pulse">
        ⏳ Loading quarterly financials for {symbol}...
      </div>
    );
  }

  // 2. Error State UI
  if (error) {
    return (
      <div className="max-w-3xl mx-auto my-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 font-semibold shadow-sm">
        ⚠️ Error: {error}
      </div>
    );
  }

  // 3. Empty State UI
  if (!data) {
    return (
      <div className="text-center p-8 text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg max-w-3xl mx-auto my-6">
        Enter a stock symbol to view latest 4 quarters financial data.
      </div>
    );
  }

  // 4. Data Display UI
  return (
    <div className="max-w-3xl mx-auto my-6 p-6 bg-white border border-slate-100 rounded-xl shadow-md">
      <header className="border-b border-slate-100 pb-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          {data.companyName}{" "}
          <span className="text-indigo-600 font-mono">({data.ticker})</span>
        </h2>
        <p className="text-sm text-slate-500 mt-1 font-medium">
          Central Index Key (CIK):{" "}
          <span className="font-mono text-slate-700">{data.cik}</span>
        </p>
      </header>

      <div className="overflow-x-auto rounded-lg border border-slate-200 shadow-sm">
        <table className="w-full border-collapse text-left text-sm text-slate-700">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Reporting Period End</th>
              <th className="px-4 py-3">Filing Date</th>
              <th className="px-4 py-3">Form Type</th>
              <th className="px-4 py-3 text-right">Quarter Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {data.latestQuarterlyRevenues &&
            data.latestQuarterlyRevenues.length > 0 ? (
              [...data.latestQuarterlyRevenues]
                .reverse()
                .map((quarter: QuarterlyFiling, index: number) => (
                  <tr
                    key={index}
                    className="hover:bg-slate-50/70 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium whitespace-nowrap">
                      {formatDate(quarter.end)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDate(quarter.filed)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {quarter.form}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 whitespace-nowrap font-mono">
                      {formatCurrency(quarter.val)}
                    </td>
                  </tr>
                ))
            ) : (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-slate-400 font-medium bg-slate-50/50"
                >
                  No quarterly revenue records returned from SEC logs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StockFinancials;
