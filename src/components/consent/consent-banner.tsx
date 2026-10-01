"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { adsenseClient } from "@/lib/ads";
import {
  CONSENT_CHANGED_EVENT,
  OPEN_CONSENT_EVENT,
  effectiveConsent,
  globalPrivacyControl,
  readConsent,
  saveConsent,
  type ConsentChoice,
} from "@/lib/consent";

/**
 * Asks before any ad cookies are used. Only shown when ads are configured:
 * without them Wisp sets nothing that needs consent. Both choices are the
 * same size and weight, and saying no is never harder than saying yes.
 */
export function ConsentBanner() {
  const adsConfigured = Boolean(adsenseClient());
  // "server" until hydrated, so the banner never flashes into server HTML.
  const stored = useSyncExternalStore(
    subscribeToConsent,
    () => readConsent() ?? "none",
    () => "server",
  );
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    const reopen = () => setReopened(true);
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  // Ask once; a Global Privacy Control signal already answers "no".
  const open = reopened || (stored === "none" && !globalPrivacyControl());
  if (!adsConfigured || !open) return null;

  const choose = (choice: ConsentChoice) => {
    const before = effectiveConsent();
    saveConsent(choice);
    setReopened(false);
    // Ad scripts can't be unloaded; reload so withdrawn consent applies at once.
    if (before === "ads" && choice === "essential") window.location.reload();
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-xl rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-xl sm:bottom-5"
    >
      <h2 id="consent-title" className="font-display text-lg font-semibold">
        Cookies on Wisp
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        We use essential cookies to keep you logged in. If you agree, Google will also use cookies to
        show and measure ads on public pages like this one. Ads never appear in chats.{" "}
        <Link href="/cookies" className="underline">
          Cookie Policy
        </Link>
      </p>
      {globalPrivacyControl() && (
        <p className="mt-2 text-sm text-muted-foreground">
          Your browser asks sites not to share your data, so ad cookies stay off whatever you pick here.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => choose("essential")}>
          Essential only
        </Button>
        <Button variant="outline" onClick={() => choose("ads")}>
          Accept ad cookies
        </Button>
      </div>
    </div>
  );
}

/** The current choice, kept in sync when it changes anywhere on the page. */
export function useAdConsent(): boolean {
  return useSyncExternalStore(
    subscribeToConsent,
    () => effectiveConsent() === "ads",
    () => false,
  );
}

function subscribeToConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
}
