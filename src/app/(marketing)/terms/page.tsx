import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/landing/legal-page";
import { MINIMUM_AGE, APP_NAME } from "@/lib/constants";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The rules for using Wisp: who can join, what isn't allowed, and how accounts are moderated.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="September 2026">
      <p className="text-muted-foreground">
        These Terms govern your use of {APP_NAME}. By creating an account or
        using {APP_NAME} as a guest, you agree to them.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least {MINIMUM_AGE} years old to use {APP_NAME}. By
        using the service you confirm that you meet this requirement. We may
        request additional verification and suspend accounts we reasonably
        believe belong to someone under {MINIMUM_AGE}.
      </p>

      <h2>2. Your account</h2>
      <p>
        You may use {APP_NAME} as a registered account or as a temporary
        guest. You are responsible for the activity that happens under your
        session, and for keeping your password confidential. Guest sessions
        are not permanently tied to real-world identity information.
      </p>

      <h2>3. Acceptable use</h2>
      <ul>
        <li>No harassment, threats, hate speech, or targeted abuse.</li>
        <li>No sexual content involving minors, ever, under any circumstance.</li>
        <li>No spam, scams, phishing, or automated/bot traffic.</li>
        <li>No recording or redistributing another user without their consent.</li>
        <li>No impersonation of another person, brand, or Wisp staff.</li>
      </ul>
      <p>
        Violations may result in a warning, timeout, suspension, or permanent
        ban, at our discretion, following the process described on our{" "}
        <a href="/safety" className="underline">
          safety page
        </a>
        .
      </p>

      <h2>4. Content</h2>
      <p>
        Messages, matches, and room activity are provided for real-time
        conversation between users. We do not claim ownership over what you
        say, but we may retain limited records (see our{" "}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>
        ) for safety, moderation, and abuse-prevention purposes.
      </p>

      <h2>5. Termination</h2>
      <p>
        You may stop using {APP_NAME} and request account deletion at any
        time from Settings. We may suspend or terminate access for violations
        of these Terms or applicable law.
      </p>

      <h2>6. Disclaimers</h2>
      <p>
        {APP_NAME} connects you with strangers. We use automated and human
        moderation to reduce abuse, but we cannot guarantee the behavior of
        other users. Use good judgment, and report or block anyone who makes
        you uncomfortable.
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update these Terms from time to time. Continued use of{" "}
        {APP_NAME} after changes take effect constitutes acceptance of the
        updated Terms.
      </p>
    </LegalPage>
  );
}
