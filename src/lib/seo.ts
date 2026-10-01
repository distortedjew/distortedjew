import type { Metadata } from "next";
import { APP_NAME } from "@/lib/constants";

/** The public origin, without a trailing slash. Set APP_URL in production. */
export const SITE_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Pages behind sign-in or with user-generated content: kept out of search results. */
export const NOINDEX: Metadata["robots"] = { index: false, follow: true };

/**
 * Metadata for a public page: a unique title and description, a canonical
 * URL, and matching share-card fields (which otherwise inherit the
 * homepage's and point every share at "/").
 */
export function pageMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: {
  title: string;
  description: string;
  path: string;
  /** Use the title as-is instead of "Title · Wisp". */
  absoluteTitle?: boolean;
}): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} · ${APP_NAME}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: path },
    openGraph: { title: fullTitle, description, url: path, siteName: APP_NAME, type: "website" },
    twitter: { card: "summary_large_image", title: fullTitle, description },
  };
}
