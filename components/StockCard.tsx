import { StockDataResponse } from "@/types/stock";

interface StockCardProps {
  stock: StockDataResponse;
  onRemove: (symbol: string) => void;
}

const StockCard = ({ stock, onRemove }: StockCardProps) => {
  const isPositive = stock.dailyChange >= 0;

  return (
    <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200 relative group shadow-xl">
      <button
        onClick={() => onRemove(stock.symbol)}
        className="absolute top-3 right-3 text-slate-500 hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-xs"
        title={`Remove ${stock.symbol}`}
      >
        ✕
      </button>

      <div className="flex justify-between items-start mb-2">
        <span className="text-lg font-bold tracking-wide text-slate-200">
          {stock.symbol}
        </span>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded ${
            isPositive
              ? "bg-green-950/60 text-green-400 border border-green-900/50"
              : "bg-red-950/60 text-red-400 border border-red-900/50"
          }`}
        >
          {isPositive ? "+" : ""}
          {stock.dailyChangePercent.toFixed(2)}%
        </span>
      </div>

      <div className="mt-4 flex items-baseline justify-between">
        <span className="text-2xl font-black text-white">
          ${stock.price.toFixed(2)}
        </span>
        <span
          className={`text-sm font-medium ${isPositive ? "text-green-400" : "text-red-400"}`}
        >
          {isPositive ? "▲" : "▼"} ${Math.abs(stock.dailyChange).toFixed(2)}
        </span>
      </div>
    </div>
  );
};

export default StockCard;
