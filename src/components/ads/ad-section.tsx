"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { adSlotId, adsenseClient, showAdPlaceholders, type AdPlacement } from "@/lib/ads";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * A clearly labelled ad between page sections. Renders nothing unless
 * AdSense is configured (or placeholders are switched on to preview where
 * ads will go). Space is reserved up front so the page doesn't jump when
 * the ad loads.
 */
export function AdSection({
  placement,
  width = "max-w-6xl",
}: {
  placement: AdPlacement;
  /** Match the page's content width. */
  width?: "max-w-6xl" | "max-w-3xl";
}) {
  const client = adsenseClient();
  const slot = adSlotId(placement);
  const live = Boolean(client && slot);
  const placeholder = !live && showAdPlaceholders();

  if (!live && !placeholder) return null;

  return (
    <section aria-label="Advertisement" className="px-5 py-10 sm:px-8">
      <div className={`mx-auto ${width} border-t border-border pt-4`}>
        <p className="mb-3 text-xs text-muted-foreground">Advertisement</p>
        {live ? (
          <AdUnit client={client!} slot={slot!} />
        ) : (
          <div className="flex min-h-[250px] items-center justify-center rounded-xl border-2 border-dashed border-input text-sm text-muted-foreground">
            Ad placement: {placement}
          </div>
        )}
      </div>
    </section>
  );
}

function AdUnit({ client, slot }: { client: string; slot: string }) {
  const pushed = useRef(false);

  useEffect(() => {
    // Each <ins> must be pushed exactly once (StrictMode runs effects twice in dev).
    if (pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // Blocked by an ad blocker or not loaded yet: leave the reserved space empty.
    }
  }, []);

  return (
    <>
      {/* lazyOnload: fetched after the page is interactive, so ads never slow down the first paint. */}
      <Script
        id="adsbygoogle-js"
        strategy="lazyOnload"
        crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
      />
      <ins
        className="adsbygoogle block min-h-[250px]"
        style={{ display: "block" }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </>
  );
}
