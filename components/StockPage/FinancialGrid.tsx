import React from "react";

interface RowData {
  title: string;
  values: string[];
}

interface FinancialGridProps {
  financialData: {
    headers: string[];
    currency: string;
    rows: RowData[];
  };
}

const FinancialGrid: React.FC<FinancialGridProps> = ({ financialData }) => {
  return (
    <div className="w-full max-w-4xl mx-auto my-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      {/* Table Head Segment Header */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-mono">
          {financialData.currency}
        </span>
        <div className="flex gap-12 text-sm font-bold text-slate-700 font-mono">
          {financialData.headers.map((head, i) => (
            <span key={i} className="w-20 text-right">
              {head}
            </span>
          ))}
        </div>
      </div>

      {/* Grid Elements Stack Row Array */}
      <div className="divide-y divide-slate-100">
        {financialData.rows.map((row, index) => (
          <div
            key={index}
            className="px-6 py-3.5 flex justify-between items-center hover:bg-slate-50/60 transition-colors"
          >
            <span className="text-sm font-medium text-slate-900">
              {row.title}
            </span>
            <div className="flex gap-12 text-sm font-bold text-slate-800 font-mono">
              {row.values.map((val, idx) => (
                <span key={idx} className="w-20 text-right whitespace-nowrap">
                  {val}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FinancialGrid;
