import Link from "next/link";
import StockChart from "@/components/StockChart"; // Make sure to adjust path if needed

interface PageProps {
  params: Promise<{ symbol: string }>;
}

export default async function StockDetailPage({ params }: PageProps) {
  const { symbol } = await params;
  const upperSymbol = symbol.toUpperCase();

  if (!upperSymbol) {
    return <div>Not Found</div>;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb back to Watchlist */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors flex items-center gap-1"
          >
            ← Back to Watchlist
          </Link>
          <span className="px-2.5 py-1 text-xs font-mono font-semibold bg-slate-900 border border-slate-800 text-slate-400 rounded-md">
            Live Feed: IEX
          </span>
        </div>

        {/* Dynamic Chart Widget Wrapper */}
        <div className="border border-slate-900 bg-slate-950 rounded-2xl shadow-xl">
          <StockChart symbol={upperSymbol} />
        </div>
      </div>
    </main>
  );
}
