import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/landing/legal-page";
import { APP_NAME, MINIMUM_AGE } from "@/lib/constants";
import { legalDetails, operatorName } from "@/lib/legal";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The rules for using Wisp: who can join, what isn't allowed, how accounts are moderated, and who runs the service.",
  path: "/terms",
});

export default function TermsPage() {
  const legal = legalDetails();
  const operator = operatorName(legal);

  return (
    <LegalPage title="Terms of Service" updated="October 2026">
      <p>
        These terms are an agreement between you and {operator}, which runs {APP_NAME}. By
        creating an account or chatting as a guest, you agree to them and to our{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        .
      </p>

      <h2>1. Who can use {APP_NAME}</h2>
      <p>
        You must be {MINIMUM_AGE} or older. We ask for your birth year before your first chat and
        may suspend accounts we reasonably believe belong to someone younger.
      </p>

      <h2>2. Your account</h2>
      <p>
        You can chat as a guest or create an account. You&apos;re responsible for what happens under
        your login and for keeping your password private.
      </p>

      <h2>3. {APP_NAME} is free</h2>
      <p>
        {APP_NAME} costs nothing to use. There are no purchases, subscriptions or hidden fees, so
        there&apos;s nothing to refund. Some public pages may show ads. If we ever offer paid
        features, we&apos;ll show the price and refund terms before you pay.
      </p>

      <h2>4. Rules</h2>
      <ul>
        <li>No harassment, threats, hate speech or targeted abuse.</li>
        <li>No sexual content involving minors, ever. We report it to the authorities.</li>
        <li>No nudity or sexual content with anyone who hasn&apos;t clearly agreed to it.</li>
        <li>No spam, scams, phishing, or bots and other automated use.</li>
        <li>No recording, screenshotting or sharing other people without their permission.</li>
        <li>No pretending to be another person, a brand or {APP_NAME} staff.</li>
        <li>Nothing illegal where you or the other person live.</li>
      </ul>
      <p>
        Breaking these rules can lead to a warning, a timeout, a suspension or a permanent ban, as
        described on our{" "}
        <Link href="/safety" className="underline">
          safety page
        </Link>
        .
      </p>

      <h2>5. What you post</h2>
      <p>
        You own what you write and share. You give us permission to store it, show it to the people
        you&apos;re talking to, and use it for moderation, only for as long as needed to run{" "}
        {APP_NAME} and as described in the Privacy Policy. Don&apos;t post anything you don&apos;t
        have the right to share.
      </p>

      <h2>6. Ending your account</h2>
      <p>
        You can delete your account at any time from Settings. We may suspend or close accounts that
        break these terms or the law, or to protect other people.
      </p>

      <h2>7. No guarantees</h2>
      <p>
        {APP_NAME} connects you with strangers. We use automated checks and moderators to reduce
        abuse, but we can&apos;t control what other people say or do, and the service is provided
        &quot;as is&quot;, without guarantees that it will always be available or error-free. Use
        good judgment, don&apos;t share personal details, and report or block anyone who makes you
        uncomfortable.
      </p>

      <h2>8. Limits on our liability</h2>
      <p>
        To the extent the law allows, {operator} isn&apos;t liable for indirect or consequential
        losses, or for what other users do. Nothing in these terms limits liability that can&apos;t
        be limited by law, or your rights as a consumer.
      </p>

      <h2>9. Copyright complaints</h2>
      <p>
        If you believe something on {APP_NAME} infringes your copyright
        {legal.contactEmail ? (
          <>
            , email{" "}
            <a href={`mailto:${legal.contactEmail}`} className="underline">
              {legal.contactEmail}
            </a>{" "}
            with the work, where it appears, and your contact details
          </>
        ) : (
          ", contact us with the work, where it appears, and your contact details"
        )}
        .
      </p>

      <h2>10. Governing law</h2>
      <p>
        {legal.jurisdiction
          ? `These terms are governed by the laws of ${legal.jurisdiction}, without taking away any protection the law where you live gives you.`
          : "These terms are governed by the laws of the place where the operator is established, without taking away any protection the law where you live gives you."}
      </p>

      <h2>11. Changes</h2>
      <p>
        We may update these terms. For significant changes we&apos;ll tell you in the app before
        they take effect. If you keep using {APP_NAME} after that, the new terms apply.
      </p>

      <h2>12. Contact</h2>
      <p>
        {operator}
        {legal.address && <>, {legal.address}</>}
        {legal.contactEmail && (
          <>
            .{" "}
            <a href={`mailto:${legal.contactEmail}`} className="underline">
              {legal.contactEmail}
            </a>
          </>
        )}
        .
      </p>
    </LegalPage>
  );
}
