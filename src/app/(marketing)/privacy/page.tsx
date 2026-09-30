import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/landing/legal-page";
import { APP_NAME } from "@/lib/constants";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "What Wisp collects, why, how long it's kept, and how to delete your account.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="September 2026">
      <p className="text-muted-foreground">
        {APP_NAME} is built to collect as little personal information as
        possible while still keeping the platform safe. This page explains
        what we collect, why, and how you can control it.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>Account basics: username, and email if you register (not required for guest sessions).</li>
        <li>Profile details you choose to add: bio, interests, languages, country, avatar.</li>
        <li>Conversation metadata needed to operate matching and moderation (message timestamps, match history).</li>
        <li>A salted, one-way hash of your IP address for abuse-rate-limiting — never the raw IP.</li>
        <li>Anonymized product usage events (e.g. &quot;match started&quot;) with no message content attached.</li>
      </ul>

      <h2>What we don&apos;t do</h2>
      <ul>
        <li>We never sell your data.</li>
        <li>We never show your email address to other users.</li>
        <li>We never store raw IP addresses.</li>
        <li>We don&apos;t require a phone number or government ID to use the core product.</li>
      </ul>

      <h2>Moderation records</h2>
      <p>
        Messages are analyzed by an automated safety filter at send time, and
        flagged messages may be retained longer for human review. Reports you
        file, and reports filed against you, are stored to support the
        moderation process described on our{" "}
        <a href="/safety" className="underline">
          safety page
        </a>
        .
      </p>

      <h2>Advertising</h2>
      <p>
        Some public pages, like the home page and the games page, may show ads from Google AdSense.
        Ads never appear inside a chat. Google and its partners may use cookies to show and measure
        ads, and in the European Economic Area, the UK and Switzerland you&apos;re asked for consent
        first. See{" "}
        <a
          href="https://policies.google.com/technologies/partner-sites"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          how Google uses information from sites that use its services
        </a>
        , and manage ad personalization in your{" "}
        <a href="https://adssettings.google.com" className="underline" target="_blank" rel="noopener noreferrer">
          Google ad settings
        </a>
        .
      </p>

      <h2>Your controls</h2>
      <ul>
        <li>Edit or clear your profile fields at any time from Settings.</li>
        <li>Control who can see your country and profile from Settings → Privacy.</li>
        <li>Delete your account, which removes your profile and disassociates historical messages from your identity.</li>
      </ul>

      <h2>Retention</h2>
      <p>
        Conversation content is retained only as long as needed for safety
        and abuse investigation, then purged on a rolling basis. Aggregated,
        de-identified analytics may be retained longer to improve the
        product.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about this policy or a data request can be made from your
        account Settings page.
      </p>
    </LegalPage>
  );
}
