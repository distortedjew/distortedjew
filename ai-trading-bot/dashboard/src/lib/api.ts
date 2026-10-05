/**
 * Typed REST client for the FastAPI gateway.
 *
 *   const portfolio = await api.get<Portfolio>("/api/portfolio");
 *   await api.put<SettingsResponse>("/api/settings", settings);
 *
 * - Base URL: `import.meta.env.VITE_API_BASE ?? ""` (same origin; Vite proxies /api in dev).
 * - Auth: open the dashboard once with `?token=<DASHBOARD_TOKEN>`; the token is kept in
 *   localStorage, removed from the address bar and sent as `Authorization: Bearer …`.
 * - Every failure is an `ApiError` (HTTP status, network error, timeout) with a readable `detail`.
 * Prefer the hooks in src/hooks/queries.ts over calling this directly from components.
 */

const TOKEN_STORAGE_KEY = "tradebot.token";
const DEFAULT_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------- auth token

let cachedToken: string | null | undefined;

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Read `?token=` from the URL once: persist it and strip it from the address bar. */
export function initAuthToken(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("token");
  if (fromUrl === null) return;
  setAuthToken(fromUrl.trim() || null);
  url.searchParams.delete("token");
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

export function getAuthToken(): string | null {
  if (cachedToken === undefined) cachedToken = safeStorage()?.getItem(TOKEN_STORAGE_KEY) ?? null;
  return cachedToken;
}

export function setAuthToken(token: string | null): void {
  cachedToken = token;
  const storage = safeStorage();
  if (!storage) return;
  try {
    if (token) storage.setItem(TOKEN_STORAGE_KEY, token);
    else storage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* storage full or blocked: keep the in-memory token */
  }
}

export function getApiBase(): string {
  return (import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
}

// ---------------------------------------------------------------- errors

export type ApiErrorKind = "http" | "network" | "timeout" | "parse";

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

/** Any failed API call. `status` is 0 for network errors and timeouts. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly kind: ApiErrorKind;
  readonly body: unknown;
  readonly path: string;

  constructor(opts: { status: number; detail: string; kind: ApiErrorKind; body?: unknown; path: string }) {
    super(opts.detail);
    this.name = "ApiError";
    this.status = opts.status;
    this.detail = opts.detail;
    this.kind = opts.kind;
    this.body = opts.body;
    this.path = opts.path;
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * 503: the trading engine has not published this live state yet (fresh install, engine not
   * started). Not a failure of the dashboard — show a calm "waiting" state; it clears by itself.
   */
  get isEngineUnavailable(): boolean {
    return this.kind === "http" && this.status === 503;
  }

  /**
   * The API itself is unreachable: a network error, or a gateway (Vite's dev proxy, nginx…)
   * answering 502 / 504 on its behalf.
   */
  get isUnreachable(): boolean {
    return this.kind === "network" || (this.kind === "http" && (this.status === 502 || this.status === 504));
  }

  /** True for errors worth retrying (network, timeout, 5xx, 429). */
  get isTransient(): boolean {
    return this.kind !== "http" || this.status >= 500 || this.status === 429 || this.status === 408;
  }

  /**
   * FastAPI 422 validation errors keyed by dotted field path without the "body" prefix:
   * `{ "risk.max_positions": "Input should be less than or equal to 20" }`.
   */
  fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    const detail = (this.body as { detail?: unknown } | null)?.detail;
    if (!Array.isArray(detail)) return out;
    for (const issue of detail as ValidationIssue[]) {
      const loc = (issue.loc ?? []).filter((part) => part !== "body").join(".");
      if (loc && issue.msg && !out[loc]) out[loc] = issue.msg;
    }
    return out;
  }
}

/** A short, human sentence for any error (used by ErrorState and toasts). */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isUnreachable) return "Can't reach the API server. Check that the backend is running.";
    if (error.kind === "timeout") return "The API took too long to respond.";
    if (error.isUnauthorized)
      return "Not authorized. Open the dashboard with ?token=<DASHBOARD_TOKEN> in the URL.";
    if (error.isEngineUnavailable)
      return "The trading engine hasn't published this data yet. It appears automatically once the engine is running.";
    if (error.status >= 500) return `The API returned an error (${error.status}). ${error.detail}`.trim();
    return error.detail;
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function detailFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const parts = (detail as ValidationIssue[])
        .map((issue) => {
          const loc = (issue.loc ?? []).filter((p) => p !== "body").join(".");
          return loc ? `${loc}: ${issue.msg ?? "invalid"}` : (issue.msg ?? "");
        })
        .filter(Boolean);
      if (parts.length) return parts.join("; ");
    }
  }
  if (typeof body === "string" && body.trim() && body.length < 300) return body.trim();
  return fallback;
}

// ---------------------------------------------------------------- requests

type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type QueryParams = Record<string, QueryValue>;

/**
 * Build `/api/…?a=1&b=2`. Empty values (undefined, null, "") are dropped;
 * arrays become repeated keys (`types=A&types=B`), which FastAPI reads as `list[str]`.
 */
export function buildUrl(path: string, params?: QueryParams): string {
  const search = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        for (const item of value) search.append(key, String(item));
      } else {
        search.append(key, String(value));
      }
    }
  }
  const qs = search.toString();
  return `${getApiBase()}${path}${qs ? `?${qs}` : ""}`;
}

export interface RequestOptions {
  params?: QueryParams;
  signal?: AbortSignal;
  /** Abort after this many ms (default 15 s). */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function send(method: string, path: string, body: unknown, opts: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort(opts.signal?.reason);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }

  const headers: Record<string, string> = { Accept: "application/json", ...authHeaders(), ...opts.headers };
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    return await fetch(buildUrl(path, opts.params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (opts.signal?.aborted) throw error; // caller cancelled (e.g. query unmounted): propagate as-is
    if (timedOut) {
      throw new ApiError({
        status: 0,
        kind: "timeout",
        detail: `Request timed out after ${Math.round(timeoutMs / 1000)} s`,
        path,
      });
    }
    throw new ApiError({
      status: 0,
      kind: "network",
      detail: error instanceof Error ? error.message : "Network error",
      path,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

async function request<T>(
  method: string,
  path: string,
  body: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const response = await send(method, path, body, opts);
  const payload = await readBody(response);
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      kind: "http",
      detail: detailFromBody(payload, response.statusText || `HTTP ${response.status}`),
      body: payload,
      path,
    });
  }
  if (response.status === 204) return undefined as T;
  if (typeof payload === "string" && (response.headers.get("content-type") ?? "").includes("json")) {
    throw new ApiError({ status: response.status, kind: "parse", detail: "Invalid JSON from the API", path });
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, body ?? {}, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) => request<T>("PUT", path, body, opts),
  del: <T = void>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts),
};

/**
 * Download a file endpoint (e.g. /api/trades/export.csv) with the auth header and save it.
 * A plain <a href> cannot send the Bearer token, so the file is fetched and saved as a blob.
 */
export async function downloadFile(
  path: string,
  params: QueryParams | undefined,
  filename: string,
): Promise<void> {
  const response = await send("GET", path, undefined, {
    params,
    timeoutMs: 60_000,
    headers: { Accept: "*/*" },
  });
  if (!response.ok) {
    const payload = await readBody(response);
    throw new ApiError({
      status: response.status,
      kind: "http",
      detail: detailFromBody(payload, `Download failed (${response.status})`),
      body: payload,
      path,
    });
  }
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1_000);
}
