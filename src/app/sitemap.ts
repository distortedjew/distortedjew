import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/** Public, indexable pages only. Sign-in, chat and account pages are noindex. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/games`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/safety`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/cookies`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
