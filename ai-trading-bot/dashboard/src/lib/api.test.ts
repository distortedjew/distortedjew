import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, buildUrl, describeError, getAuthToken, initAuthToken, setAuthToken } from "@/lib/api";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => setAuthToken(null));
afterEach(() => vi.unstubAllGlobals());

describe("buildUrl", () => {
  it("drops empty values and repeats array keys", () => {
    expect(
      buildUrl("/api/events", {
        limit: 50,
        types: ["AI_ANALYSIS", "TRADE_CLOSED"],
        symbol: undefined,
        q: "",
      }),
    ).toBe("/api/events?limit=50&types=AI_ANALYSIS&types=TRADE_CLOSED");
    expect(buildUrl("/api/status")).toBe("/api/status");
    expect(buildUrl("/api/ai/latest", { symbol: "BTC/USDT" })).toBe("/api/ai/latest?symbol=BTC%2FUSDT");
  });
});

describe("auth token", () => {
  it("moves ?token= from the address bar into storage", () => {
    window.history.replaceState(null, "", "/trades?token=s3cret&symbol=BTC");
    initAuthToken();
    expect(getAuthToken()).toBe("s3cret");
    expect(window.location.search).toBe("?symbol=BTC");
    expect(window.localStorage.getItem("tradebot.token")).toBe("s3cret");
    window.history.replaceState(null, "", "/");
  });

  it("sends it as a Bearer header", async () => {
    setAuthToken("abc");
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await api.get("/api/status");
    const init = fetchMock.mock.calls[0][1]!;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer abc");
  });
});

describe("requests and errors", () => {
  it("returns parsed JSON and sends JSON bodies", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse({ unread_count: 0 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.post("/api/notifications/read", { ids: [] })).resolves.toEqual({ unread_count: 0 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/notifications/read");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe('{"ids":[]}');
  });

  it("turns HTTP failures into ApiError with the API's detail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Trade not found" }, 404)),
    );
    const error = await api.get("/api/trades/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).isNotFound).toBe(true);
    expect((error as ApiError).detail).toBe("Trade not found");
  });

  it("maps FastAPI validation errors to field paths", async () => {
    const body = {
      detail: [
        { loc: ["body", "risk", "max_positions"], msg: "Input should be less than or equal to 20" },
        { loc: ["body", "ai", "temperature"], msg: "Input should be less than or equal to 2" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(body, 422)),
    );
    const error = (await api.put("/api/settings", {}).catch((e: unknown) => e)) as ApiError;
    expect(error.fieldErrors()).toEqual({
      "risk.max_positions": "Input should be less than or equal to 20",
      "ai.temperature": "Input should be less than or equal to 2",
    });
    expect(error.detail).toContain("risk.max_positions");
  });

  it("classifies network failures and timeouts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const network = (await api.get("/api/status").catch((e: unknown) => e)) as ApiError;
    expect(network.kind).toBe("network");
    expect(network.isTransient).toBe(true);
    expect(describeError(network)).toMatch(/Can't reach the API/);

    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
      ),
    );
    const pending = api.get("/api/performance", { timeoutMs: 1_000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1_000);
    const timeout = (await pending) as ApiError;
    vi.useRealTimers();
    expect(timeout.kind).toBe("timeout");
    expect(describeError(timeout)).toMatch(/too long/);
  });

  it("describes a 503 from an unpublished engine state as a wait, not a failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ detail: "Trading engine has not published state yet" }, 503)),
    );
    const error = (await api.get("/api/portfolio").catch((e: unknown) => e)) as ApiError;
    expect(error.isEngineUnavailable).toBe(true);
    expect(error.isTransient).toBe(true);
    expect(describeError(error)).toMatch(/hasn't published/);
  });

  it("treats a gateway 502 / 504 (dev proxy, nginx) as an unreachable API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" })),
    );
    const error = (await api.get("/api/portfolio").catch((e: unknown) => e)) as ApiError;
    expect(error.isUnreachable).toBe(true);
    expect(describeError(error)).toMatch(/Can't reach the API/);
  });

  it("treats 401 as non-transient with a token hint", () => {
    const error = new ApiError({
      status: 401,
      kind: "http",
      detail: "Not authenticated",
      path: "/api/status",
    });
    expect(error.isUnauthorized).toBe(true);
    expect(error.isTransient).toBe(false);
    expect(describeError(error)).toMatch(/\?token=/);
  });
});
