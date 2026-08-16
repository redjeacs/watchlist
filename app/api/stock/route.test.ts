// app/api/stock/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

process.env.ALPACA_KEY_ID = "mock_key";
process.env.ALPACA_SECRET_KEY = "mock_secret";

describe("GET /api/stock", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully fetch and format Alpaca data for a valid ticker", async () => {
    // 2. Mock a successful raw response from the external Alpaca platform
    const mockAlpacaResponse = {
      snapshots: {
        AAPL: {
          latestTrade: { p: 150.0 },
          dailyBar: { c: 100.0 },
        },
      },
    };

    // Intercept the global fetch function
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockAlpacaResponse,
    } as Response);

    // 3. Create a simulated incoming request payload directed at our API
    const req = new NextRequest("http://localhost:3000/api/stock?symbol=AAPL");

    // 4. Fire the request directly into our backend controller function
    const res = await GET(req);
    const json = await res.json();

    // 5. Assertions: Validate calculations and network handling are accurate
    expect(res.status).toBe(200);
    expect(json).toEqual({
      symbol: "AAPL",
      price: 150,
      dailyChange: 50,
      dailyChangePercent: 50,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("should return 400 error status if symbol query parameter is missing", async () => {
    const req = new NextRequest("http://localhost:3000/api/stock"); // No query string parameter
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Symbol parameter is required");
  });

  it("should return 404 error status if stock symbol is not found by Alpaca", async () => {
    // Alpaca returns an empty snapshots map if a ticker doesn't exist
    const mockAlpacaEmptyResponse = { snapshots: {} };

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockAlpacaEmptyResponse,
    } as Response);

    const req = new NextRequest("http://localhost:3000/api/stock?symbol=FAKE");
    const res = await GET(req);
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe("Stock symbol not found");
  });
});
