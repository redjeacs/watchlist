import React from "react";

const Header: React.FC = () => {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-extrabold tracking-tight text-white mb-2">
        📈 Market Watchlist
      </h1>
      <p className="text-slate-400 text-sm">
        Powered by Next.js, TypeScript, and Alpaca Markets Free Data API.
      </p>
    </header>
  );
};

export default Header;
