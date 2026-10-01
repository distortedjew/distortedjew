import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/seo";
import { LegalPage } from "@/components/landing/legal-page";
import { CookieSettingsLink } from "@/components/consent/cookie-settings-link";
import { APP_NAME } from "@/lib/constants";
import { CONSENT_COOKIE } from "@/lib/consent";

export const metadata: Metadata = pageMetadata({
  title: "Cookie Policy",
  description: "The cookies and browser storage Wisp uses, what each one is for, and how to change your choice.",
  path: "/cookies",
});

const AUTH_COOKIE = process.env.AUTH_COOKIE_NAME || "wisp_session";

const ESSENTIAL = [
  { name: AUTH_COOKIE, purpose: "Keeps you logged in, as a guest or with an account.", lasts: "30 days, or until you log out" },
  { name: CONSENT_COOKIE, purpose: "Remembers whether you accepted ad cookies.", lasts: "1 year" },
  { name: "theme (browser storage)", purpose: "Remembers light or dark mode.", lasts: "Until you clear it" },
  {
    name: "Cloudflare Turnstile",
    purpose: "May be set on the sign-up page to tell people from bots.",
    lasts: "Short-lived",
  },
];

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy" updated="October 2026">
      <p>
        Cookies are small files a website saves in your browser. {APP_NAME} uses as few as
        possible.
      </p>

      <h2>Essential cookies</h2>
      <p>These are needed for {APP_NAME} to work, so they don&apos;t need your consent.</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="py-2 pr-4 font-semibold">Name</th>
              <th scope="col" className="py-2 pr-4 font-semibold">What it&apos;s for</th>
              <th scope="col" className="py-2 font-semibold">How long</th>
            </tr>
          </thead>
          <tbody>
            {ESSENTIAL.map((c) => (
              <tr key={c.name} className="border-b border-border align-top">
                <td className="py-2 pr-4 font-medium">{c.name}</td>
                <td className="py-2 pr-4 text-muted-foreground">{c.purpose}</td>
                <td className="py-2 text-muted-foreground">{c.lasts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Ad cookies (only if you accept)</h2>
      <p>
        If ads are shown on {APP_NAME} and you choose &quot;Accept ad cookies&quot;, Google AdSense
        and its partners may set cookies to show ads and measure them. Nothing is set if you choose
        &quot;Essential only&quot; or your browser sends a Global Privacy Control signal. Google
        explains these cookies in{" "}
        <a
          href="https://policies.google.com/technologies/cookies"
          className="underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          its cookie policy
        </a>
        .
      </p>

      <h2>Changing your choice</h2>
      <p>
        Open <CookieSettingsLink className="underline" /> at any time, including from the bottom of
        every page. If you withdraw consent, ads stop loading straight away. Cookies Google already
        set stay until they expire or you clear them in your browser settings.
      </p>

      <h2>More</h2>
      <p>
        See the{" "}
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>{" "}
        for everything else about how we handle your data.
      </p>
    </LegalPage>
  );
}
