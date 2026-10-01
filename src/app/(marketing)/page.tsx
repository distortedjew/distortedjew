import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SafetyNote } from "@/components/landing/safety-note";
import { MoreOnWisp } from "@/components/landing/more-on-wisp";
import { ClosingCta } from "@/components/landing/closing-cta";
import { AdSection } from "@/components/ads/ad-section";
import type { Metadata } from "next";
import { getLandingStats } from "@/lib/analytics/landing-stats";
import { pageMetadata, SITE_URL } from "@/lib/seo";
import { APP_NAME } from "@/lib/constants";

// Search results show the title, not the page, so it says what Wisp is in
// the words people search for; the tagline stays as the on-page headline.
export const metadata: Metadata = pageMetadata({
  title: "Wisp: Random chat with strangers by text, voice or video",
  absoluteTitle: true,
  description:
    "Talk to strangers by text, voice or video. Get matched at random or by interest and language, with mini-games and one-tap reporting. Free, no download, 18+.",
  path: "/",
});

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: `${SITE_URL}/`,
      name: APP_NAME,
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: APP_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/icon.svg`,
    },
    {
      "@type": "WebApplication",
      name: APP_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: "SocialNetworkingApplication",
      operatingSystem: "Any (web browser)",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "Random text, voice and video chat with people around the world, matched by interest or language.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};

export default async function LandingPage() {
  const stats = await getLandingStats();

  return (
    <>
      <script
        type="application/ld+json"
        // JSON only, from constants; "<" is escaped so no value can close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA).replace(/</g, "\\u003c") }}
      />
      <Hero onlineNow={stats.onlineNow} />
      <HowItWorks />
      <SafetyNote />
      <MoreOnWisp />
      <AdSection placement="landing" />
      <ClosingCta />
    </>
  );
}
