import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Google AdSense hosts, allowed only when ads are configured
// (NEXT_PUBLIC_ADSENSE_CLIENT is read at build time, like the ad code).
const adsOn = /^ca-pub-\d{10,20}$/.test(process.env.NEXT_PUBLIC_ADSENSE_CLIENT?.trim() ?? "");
const AD_SCRIPT_HOSTS = adsOn
  ? " https://pagead2.googlesyndication.com https://*.adtrafficquality.google https://www.googletagservices.com"
  : "";
const AD_FRAME_HOSTS = adsOn
  ? " https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.googlesyndication.com https://www.google.com https://*.adtrafficquality.google"
  : "";
const AD_CONNECT_HOSTS = adsOn
  ? " https://pagead2.googlesyndication.com https://*.adtrafficquality.google https://*.google.com https://*.doubleclick.net"
  : "";

const CSP = [
  "default-src 'self'",
  // Next.js App Router ships small inline <script> tags carrying RSC
  // streaming/hydration data (self.__next_f.push(...) etc) — without a
  // request-scoped nonce (real to wire through a custom server + App
  // Router, and out of scope here), 'unsafe-inline' is required or the
  // app fails to hydrate at all. Dev mode additionally needs
  // 'unsafe-eval' for HMR/Fast Refresh. script-src still only allows
  // same-origin + the two trusted third parties below, so this CSP still
  // blocks loading any *external* injected script, which is the more
  // common XSS payload shape.
  // challenges.cloudflare.com is the optional Turnstile CAPTCHA widget (unused/harmless if no site key is configured).
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com${AD_SCRIPT_HOSTS}${isDev ? " 'unsafe-eval'" : ""}`,
  `frame-src https://challenges.cloudflare.com${AD_FRAME_HOSTS}`,
  // Tailwind/Radix set inline styles for positioning/animation; nonce-based
  // style CSP isn't practical with these libraries, so 'unsafe-inline' is
  // the pragmatic tradeoff here (script-src stays strict, which matters more).
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ws: wss: https://challenges.cloudflare.com${AD_CONNECT_HOSTS}`,
  "media-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Next's dev server refuses its HMR/dev connections from any origin but
// localhost, and without them the page never hydrates — every button is
// dead. Allow the host the app is actually served on (APP_URL), plus any
// extras listed in ALLOWED_DEV_ORIGINS, e.g. when developing on a remote box.
function devOrigins(): string[] {
  const hosts = new Set<string>();
  try {
    if (process.env.APP_URL) hosts.add(new URL(process.env.APP_URL).hostname);
  } catch {
    // malformed APP_URL — ignore here, the server logs it at startup
  }
  for (const h of (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",")) {
    if (h.trim()) hosts.add(h.trim());
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins(),
  // The floating dev badge sits in the bottom-left corner, directly on top of
  // the mobile tab bar's Discover tab, and swallows taps in `npm run dev`.
  // Build/runtime errors still open the full-screen overlay without it.
  devIndicators: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Camera/mic are used for voice/video chat — allow only same-origin.
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
