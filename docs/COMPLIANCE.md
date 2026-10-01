# Legal and compliance checklist

What Wisp does about each item on a common "don't get sued" checklist, and
what the operator still has to do. **This is not legal advice.** The policy
texts were written to match what the code actually does, but a lawyer in
your jurisdiction should review them before launch.

## Before launch: operator to-do

1. **Fill in the business details** in `.env` (the server warns at startup
   until you do). They appear in the footer, the Terms and the Privacy Policy.
   ```
   LEGAL_ENTITY_NAME=Your Company Ltd
   LEGAL_ADDRESS=1 Example Street, City, Country
   LEGAL_CONTACT_EMAIL=privacy@your-domain.com
   LEGAL_JURISDICTION=Country (or State, Country)
   ```
2. **Make sure someone reads `LEGAL_CONTACT_EMAIL`.** Privacy requests must be
   answered within 30 days (GDPR) or 45 days (CCPA).
3. **Child-safety reporting.** If a moderator finds child sexual abuse
   material, you're legally required in many countries to report it (in the
   US, to NCMEC's CyberTipline). Register with the relevant body before launch.
4. **Have a lawyer review** `/terms`, `/privacy` and `/cookies`, especially
   the liability limits and governing-law sections, which vary by country.
5. **If you turn on ads in the EU/UK,** also publish Google's consent message
   (AdSense → Privacy & messaging). See [DEPLOY.md](DEPLOY.md#ads-google-adsense).
6. **Sign data processing agreements** with every provider you enable
   (email, storage, moderation, translation, hosting). Most offer one in
   their dashboard.

## The 20 items

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Privacy policy | Done. Matches what the code does: data collected, legal bases, providers, retention periods, rights, transfers. | `/privacy` |
| 2 | Terms of service | Done. 18+, rules, content license, termination, disclaimers, liability, copyright complaints, governing law. | `/terms` |
| 3 | Refund policy | Not applicable: Wisp sells nothing. The Terms say so explicitly (section 3). Add a refund policy before adding any paid feature. | `/terms`, section 3 |
| 4 | Cookie policy | Done. Lists every cookie and browser-storage item and why. | `/cookies` |
| 5 | Cookie consent banner | Done. Shown only when ads are configured (nothing else needs consent). Both buttons are the same size. Ads load only after "Accept". Global Privacy Control is honoured as a "no". Choice can be changed from the footer at any time. | `src/components/consent/` |
| 6 | Form consents | Checked. Sign-up has an unticked Terms/Privacy checkbox, enforced on the server. The guest entry states what continuing means. No pre-ticked boxes anywhere. | `/register`, guest gate |
| 7 | No unnecessary data | Checked. Birth year is used for the age check and never stored. IPs are stored only as salted hashes. Email is optional (guests have none). Old data is deleted automatically (see Retention). | `src/lib/retention.ts` |
| 8 | Audit third-party SDKs | Done. See the inventory below. No analytics or tracking SDKs. | below |
| 9 | Remove dark patterns | Checked. Equal-weight consent buttons; account deletion is self-serve in Settings, with no retention flow; no fake urgency or countdowns. | |
| 10 | Remove hidden fees | Not applicable: no payments. Stated in the Terms. | |
| 11 | Remove fake reviews | Checked. No testimonials or ratings. The hero chat is labelled "Example conversation". The online counter shows the real number and hides itself when low. | landing page |
| 12 | Remove unsupported claims | Fixed. "Matched within seconds" now says "when people are online". "Moderators review flagged messages" is now true: there's a Flagged messages queue in the admin panel. The privacy policy's retention claims are enforced by a scheduled job. | `/admin/flagged` |
| 13 | Alt text | Checked with axe-core on every public and signed-in page; no missing alternatives. Icon-only buttons have labels. | |
| 14 | Colour contrast | Checked with axe-core in light and dark mode; fixed the remaining failures (locked achievements). | |
| 15 | Keyboard navigation | "Skip to content" link on every page; all controls are native buttons/links or Radix components with keyboard support; focus rings visible. | `src/app/layout.tsx` |
| 16 | Business details | Done, from `.env`: footer, Terms, Privacy Policy. **Operator must fill them in.** | `src/lib/legal.ts` |
| 17 | Age consent for kids' data | Wisp is 18+ only, so it doesn't collect children's data. Neutral age screen (birth year, no hint of the cut-off); under-18 answers are blocked and the browser can't retry for 24 hours. | `src/lib/auth/age-gate.ts` |
| 18 | Unsubscribe link in emails | Not applicable: Wisp sends only transactional email (verify address, reset password), which doesn't need one. Add an unsubscribe link before sending any newsletter or marketing email. | |
| 19 | License fonts/images | Checked. See Licenses below. All icons and images are original or permissively licensed. | |
| 20 | Data deletion request | Done. Settings → "Download your data" (JSON export) and "Delete account" (immediate). Email requests go to `LEGAL_CONTACT_EMAIL`. | Settings |

## Third-party services

Only services you turn on in `.env` are contacted. In development, every one
of them is replaced by a local stand-in.

| Service | What it receives | When | Consent needed |
|---|---|---|---|
| Google AdSense | IP, browser details, cookies, page URL | Only on the home and games pages, only after "Accept ad cookies" | Yes (banner) |
| Cloudflare Turnstile | IP, browser signals | On sign-up, when `CAPTCHA_PROVIDER=turnstile` | No (security) |
| Email provider (Resend-compatible) | Email address, message content | Verification and password-reset emails | No (contract) |
| Object storage (S3/R2) | Uploaded avatar images | When `STORAGE_PROVIDER=s3` | No (contract) |
| Moderation API | Message text | Every chat message, when `AI_PROVIDER` is set | No (legitimate interest: safety) |
| Translation API | Message text | When a user taps Translate or turns on auto-translate | No (user request) |
| STUN/TURN servers | IP address | Voice and video calls. Production uses your own TURN server; Google's public STUN server is only a fallback when none is configured | No (needed for calls) |

There are no analytics, tracking pixels, social-login SDKs or session-replay
tools. Shared music links are shown as plain links, not embedded players.

## Data we keep, and for how long

Enforced by `purgeExpiredData` in `src/lib/retention.ts`. It runs every 6
hours from `src/instrumentation.ts`, guarded by a Redis lock so only one
server runs it. Set `DISABLE_RETENTION_JOB=true` to turn it off (not
recommended in production). Periods are in `src/lib/retention-policy.ts`
and quoted in the Privacy Policy and Settings, so change them in one place.

| Data | Kept for |
|---|---|
| Chat messages | 30 days |
| Flagged messages, and messages in a reported chat or room | 180 days |
| Usage events (analytics) | 180 days |
| Login sessions | 30 days after they expire or are revoked |
| Read notifications | 90 days |
| Guest accounts with no activity | anonymized after 90 days |
| Deleted accounts | anonymized immediately: name, email, password, profile, photo, connections, notifications and sessions are removed. Messages and moderation records stay attached to a meaningless placeholder until their own period ends. |

## Licenses

| Asset | License |
|---|---|
| Bricolage Grotesque (display font) | SIL Open Font License 1.1 |
| Atkinson Hyperlegible Next (body font) | SIL Open Font License 1.1 |
| Lucide icons | ISC |
| Logo, favicon, app icons | Original to this project |
| npm dependencies | MIT, Apache-2.0, ISC, BSD-2/3-Clause (all permit commercial use) |

Fonts are self-hosted at build time by `next/font`, so visitors' browsers
never contact Google Fonts.
