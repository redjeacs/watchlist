"use client";

import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Loader2 } from "lucide-react";
import StockFinancials from "./StockFinancials";

const TIMEFRAMES = ["1D", "5D", "1M", "6M", "1Y", "MAX"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

interface ChartPoint {
  date: string;
  price: number;
}

export default function StockChart({ symbol }: { symbol: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  const [data, setData] = useState<ChartPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchHistoricalData() {
      setIsLoading(true);
      try {
        // Points exactly to your unified /api/stock route using type=bars
        const res = await fetch(
          `/api/stock/bars?symbol=${symbol}&type=bars&timeframe=${timeframe}`,
        );
        if (!res.ok) throw new Error("Failed to load historical data");
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error(err);
        setData([]);
      } finally {
        setIsLoading(false);
      }
    }
    if (symbol) fetchHistoricalData();
  }, [symbol, timeframe]);

  const prices = data.map((d) => d.price);
  const minPrice = prices.length ? Math.round(Math.min(...prices) - 10) : 0;
  const maxPrice = prices.length ? Math.round(Math.max(...prices) + 10) : 100;

  const isPositive =
    data.length >= 2 ? data[data.length - 1].price >= data[0].price : true;
  const strokeColor = isPositive ? "#34d399" : "#f87171"; // emerald-400 vs rose-400
  const fillColor = isPositive
    ? "rgba(52, 211, 153, 0.05)"
    : "rgba(248, 113, 113, 0.05)";

  return (
    <div className="w-full bg-slate-900/40 border border-slate-900 rounded-2xl p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-xl font-bold text-slate-100 tracking-tight">
            {symbol} Valuation
          </h3>
          <p className="text-xs text-slate-500">
            Historical performance trends over time
          </p>
        </div>

        {/* Styled Timeframe Filter Buttons */}
        <div className="flex bg-slate-950 border border-slate-800 p-1 rounded-xl">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1.5 text-xs font-semibold font-mono rounded-lg transition-all ${
                timeframe === tf
                  ? "bg-slate-800 text-slate-100 shadow-sm"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div className="h-72 w-full flex items-center justify-center relative">
        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/70 flex items-center justify-center rounded-xl z-10">
            <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
          </div>
        )}

        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            {/* Swapped to AreaChart for microgradient filling */}
            <AreaChart
              data={data}
              margin={{ top: 5, right: 5, left: -25, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(51, 65, 85, 0.2)"
              />
              <XAxis
                dataKey="date"
                tickLine={true}
                interval={Math.floor(data.length / 6)}
                axisLine={true}
                niceTicks="auto"
                stroke="#475569"
                fontSize={10}
                dy={8}
              />
              <YAxis
                domain={[minPrice, maxPrice]}
                tickLine={true}
                tickCount={5}
                axisLine={true}
                niceTicks="auto"
                stroke="#475569"
                fontSize={10}
                dx={-5}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#020617",
                  border: "1px solid #1e293b",
                  borderRadius: "8px",
                  color: "#f8fafc",
                  fontSize: "11px",
                  fontFamily: "monospace",
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={strokeColor}
                fill={fillColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          !isLoading && (
            <p className="text-xs text-slate-500">
              No chart details recorded for this range.
            </p>
          )
        )}
      </div>
      <StockFinancials symbol={symbol} />
    </div>
  );
}
