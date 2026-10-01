import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/landing/legal-page";
import { APP_NAME, MINIMUM_AGE } from "@/lib/constants";
import { legalDetails, operatorName } from "@/lib/legal";
import { RETENTION } from "@/lib/retention-policy";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "What Wisp collects, why, who it's shared with, how long it's kept, and how to download or delete your data.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const legal = legalDetails();
  const operator = operatorName(legal);

  return (
    <LegalPage title="Privacy Policy" updated="October 2026">
      <p>
        This policy explains what {APP_NAME} collects about you, why, who it&apos;s shared with,
        how long it&apos;s kept, and what you can do about it. We try to collect as little as we
        can while keeping conversations between strangers safe.
      </p>

      <h2>Who is responsible for your data</h2>
      <p>
        {APP_NAME} is run by {operator}
        {legal.address && <>, {legal.address}</>}, which is the data controller for the personal
        data described here.
        {legal.contactEmail && (
          <>
            {" "}
            For anything about privacy, email{" "}
            <a href={`mailto:${legal.contactEmail}`} className="underline">
              {legal.contactEmail}
            </a>
            .
          </>
        )}
      </p>

      <h2>What we collect and why</h2>
      <ul>
        <li>
          <strong>Account details.</strong> Your username and, if you create an account, your email
          address and a hashed password. Used to run your account and send account emails
          (verification, password reset). Legal basis: providing the service you asked for.
        </li>
        <li>
          <strong>Age confirmation.</strong> We ask for your birth year to confirm you&apos;re{" "}
          {MINIMUM_AGE} or older. We use it for that check and don&apos;t store it.
        </li>
        <li>
          <strong>Profile details you choose to add.</strong> Display name, bio, interests,
          languages, country and avatar. People you&apos;re matched with can see these, depending
          on your visibility settings.
        </li>
        <li>
          <strong>Your conversations.</strong> Text messages you send in chats and rooms,
          connections you make and people you block. Stored to deliver messages and to investigate
          reports. Legal basis: providing the service, and our legitimate interest in keeping the
          platform safe.
        </li>
        <li>
          <strong>Voice and video calls.</strong> Calls go directly between you and the other
          person, encrypted. When a direct connection isn&apos;t possible they pass through our
          relay server, still encrypted. We don&apos;t record or store calls.
        </li>
        <li>
          <strong>Reports and moderation records.</strong> Reports you file or that are filed about
          you, and any action moderators take. Legal basis: legitimate interest in safety and legal
          obligations.
        </li>
        <li>
          <strong>Technical data.</strong> A login cookie, the browser and device each login came
          from, and a one-way hash of your IP address used to limit abuse. We never store your raw
          IP address.
        </li>
        <li>
          <strong>Usage events.</strong> Records of actions like &quot;match started&quot; or
          &quot;report created&quot;, tied to your account ID but never containing message text.
          Used to understand how {APP_NAME} is used and to spot abuse.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        We use a small number of cookies to keep you logged in and remember your choices. Ad
        cookies are only used if you accept them. Details are in the{" "}
        <Link href="/cookies" className="underline">
          Cookie Policy
        </Link>
        .
      </p>

      <h2>Who we share data with</h2>
      <p>We don&apos;t sell your personal data. We use these service providers to run {APP_NAME}:</p>
      <ul>
        <li>Our hosting provider, which stores the database and runs the servers.</li>
        <li>An email provider, to send account emails.</li>
        <li>A file storage provider, if avatars are stored in the cloud.</li>
        <li>
          A content moderation provider, if enabled: message text is sent to it to check for abuse.
        </li>
        <li>A translation provider: a message&apos;s text is sent to it when you translate it.</li>
        <li>Cloudflare Turnstile, to stop bots when you create an account.</li>
        <li>
          Google AdSense, only if ads are shown and you accept ad cookies (see Advertising below).
        </li>
      </ul>
      <p>
        We may also disclose data when the law requires it, or to protect someone from serious
        harm.
      </p>

      <h2>Advertising</h2>
      <p>
        Some public pages, like the home page and the games page, may show ads from Google AdSense.
        Ads never appear inside a chat. Ad cookies are only set if you choose &quot;Accept ad
        cookies&quot;, and you can change your mind any time from Cookie settings at the bottom of
        every page. If your browser sends a Global Privacy Control signal, we treat it as a no. See{" "}
        <a
          href="https://policies.google.com/technologies/partner-sites"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          how Google uses information from sites that use its services
        </a>
        .
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Chat and room messages: {RETENTION.messagesDays} days.</li>
        <li>
          Messages our filter flagged, and conversations that were reported: {RETENTION.flaggedDays}{" "}
          days, so moderators can review them.
        </li>
        <li>Usage events: {RETENTION.analyticsDays} days.</li>
        <li>Login records: until {RETENTION.sessionsDaysAfterExpiry} days after the login expires.</li>
        <li>Read notifications: {RETENTION.notificationsDays} days.</li>
        <li>
          Guest accounts with no activity for {RETENTION.inactiveGuestDays} days are deleted.
        </li>
        <li>
          Reports and moderation records: as long as the account exists, so repeat abuse can be
          recognized.
        </li>
      </ul>
      <p>
        When you delete your account, your username, email, password and profile are removed
        immediately. Messages you sent stay until their normal deletion date above, no longer
        linked to anything that identifies you.
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Get a copy of your data:</strong> Settings, then Download my data.
        </li>
        <li>
          <strong>Correct it:</strong> edit your profile at any time.
        </li>
        <li>
          <strong>Delete it:</strong> Settings, then Delete account.
        </li>
        <li>
          <strong>Withdraw consent</strong> to ad cookies from Cookie settings.
        </li>
        <li>
          Depending on where you live (for example the EU, UK or California), you may also have the
          right to object to or restrict how we use your data, and to complain to your data
          protection authority.
        </li>
      </ul>
      {legal.contactEmail && (
        <p>
          If you can&apos;t sign in, or want to make any other request, email{" "}
          <a href={`mailto:${legal.contactEmail}`} className="underline">
            {legal.contactEmail}
          </a>
          . We answer within 30 days.
        </p>
      )}

      <h2>Age</h2>
      <p>
        {APP_NAME} is only for people {MINIMUM_AGE} and older. We don&apos;t knowingly collect data
        from anyone younger. If we learn an account belongs to someone under {MINIMUM_AGE}, we
        delete it.
      </p>

      <h2>Where data is processed</h2>
      <p>
        Our service providers may process data outside your country. When data leaves the EU or
        UK, we rely on safeguards such as the European Commission&apos;s Standard Contractual
        Clauses.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are hashed, connections are encrypted with HTTPS, IP addresses are only stored as
        one-way hashes, and only authorized moderators can see reports.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy in a way that matters, we&apos;ll update the date at the top and,
        for significant changes, tell you in the app.
      </p>
    </LegalPage>
  );
}
