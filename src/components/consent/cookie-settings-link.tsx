"use client";

import Link from "next/link";
import { adsenseClient } from "@/lib/ads";
import { openConsentSettings } from "@/lib/consent";

/**
 * "Cookie settings": reopens the consent choice when ads are on. Without
 * ads there's no choice to make, so it links to the Cookie Policy instead.
 */
export function CookieSettingsLink({ className }: { className?: string }) {
  if (!adsenseClient()) {
    return (
      <Link href="/cookies" className={className}>
        Cookie settings
      </Link>
    );
  }
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      Cookie settings
    </button>
  );
}
