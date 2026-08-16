"use client";

import { useState, useEffect } from "react";
import { StockDataResponse } from "@/types/stock"; // Adjust path if you didn't move the folder
import Header from "@/components/Header";
import SearchForm from "@/components/SearchForm";
import StockCard from "@/components/StockCard";

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<StockDataResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Add a stock card to the tracking list state
  const handleAddTicker = async (symbol: string) => {
    if (watchlist.some((stock) => stock.symbol === symbol)) {
      setError(`${symbol} is already on your watchlist.`);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/stock?symbol=${symbol}`);

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch stock data");
      }

      const data: StockDataResponse = await response.json();
      setWatchlist((prev) => [data, ...prev]);
    } catch (err: any) {
      setError(err.message || "Stock symbol not found.");
    } finally {
      setLoading(false);
    }
  };

  // Remove a stock card from the tracking list state
  const handleRemoveStock = (symbolToRemove: string) => {
    setWatchlist((prev) =>
      prev.filter((stock) => stock.symbol !== symbolToRemove),
    );
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <Header />
        {/* Search Form Input */}
        <SearchForm
          onAddTicker={handleAddTicker}
          loading={loading}
          error={error}
        />
        {/* Watchlist Grid View Render */}
        {watchlist.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-2xl bg-slate-900/20">
            <p className="text-slate-500 font-medium">
              Your watchlist is empty.
            </p>
            <p className="text-slate-600 text-sm mt-1">
              Type an equity symbol above to get real-time trends.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {watchlist.map((stock) => (
              <StockCard
                key={stock.symbol}
                stock={stock}
                onRemove={handleRemoveStock}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
