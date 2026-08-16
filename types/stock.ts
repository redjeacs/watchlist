export interface StockDataResponse {
  symbol: string;
  price: number;
  dailyChange: number;
  dailyChangePercent: number;
}

export interface AlpacaSnapshot {
  latestTrade?: {
    p: number;
  };
  dailyBar?: {
    c: number;
  };
}

export interface AlpacaApiResponse {
  [symbol: string]: AlpacaSnapshot | any;
}
