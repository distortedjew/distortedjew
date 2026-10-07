/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute or relative base for REST calls; default "" (same origin). */
  readonly VITE_API_BASE?: string;
  /** Full WebSocket URL override; default `/ws` on the API origin. */
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
