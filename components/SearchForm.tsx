import React, { useState } from "react";

interface SearchFormProps {
  onAddTicker: (symbol: string) => Promise<void>;
  loading: boolean;
  error: string | null;
}

const SearchForm = ({ onAddTicker, loading, error }: SearchFormProps) => {
  const [tickerInput, setTickerInput] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSymbol = tickerInput.trim().toUpperCase();
    if (!cleanSymbol) return;

    await onAddTicker(cleanSymbol);
    setTickerInput(""); // Wipe input clear on success/completion
  };

  return (
    <form onSubmit={handleSubmit} className="mb-8">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value)}
            placeholder="Enter stock ticker (e.g., AAPL, MSFT, NVDA)"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 shadow-lg shadow-blue-900/20 disabled:cursor-not-allowed min-w-32.5"
        >
          {loading ? "Searching..." : "Add Ticker"}
        </button>
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-400 bg-red-950/30 border border-red-900/50 px-4 py-2 rounded-lg">
          ⚠️ {error}
        </p>
      )}
    </form>
  );
};

export default SearchForm;
