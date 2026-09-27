"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void },
      ) => void;
    };
  }
}

/**
 * Renders nothing when no site key is configured — the server falls back to
 * the mock CAPTCHA provider automatically in that case, so signup keeps
 * working end-to-end without any external credentials.
 */
export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const siteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    const id = setInterval(() => {
      if (window.turnstile && ref.current) {
        window.turnstile.render(ref.current, { sitekey: siteKey, callback: onToken });
        clearInterval(id);
      }
    }, 200);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
      <div ref={ref} />
    </>
  );
}
