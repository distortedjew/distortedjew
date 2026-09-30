import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { MINIMUM_AGE, APP_NAME } from "@/lib/constants";

export const metadata: Metadata = pageMetadata({
  title: "Safety",
  description:
    "How Wisp keeps chats with strangers safe: an 18+ age check, one-tap report and block, screened messages and human moderators.",
  path: "/safety",
});

const PROTECTIONS = [
  {
    title: "Messages are screened as they're sent",
    body: "An automated filter checks every message before it's delivered. High-risk messages are blocked. Borderline ones are sent to a moderator for review.",
  },
  {
    title: "Report anyone, any time",
    body: "Every chat and room has a report button. Reporting ends the conversation for both of you right away.",
  },
  {
    title: "Blocking is permanent",
    body: "Blocking ends the chat immediately, and you'll never be matched with that person again.",
  },
  {
    title: "You share as little as you want",
    body: "You don't need ID or a phone number to chat. Your email and IP address are never shown to anyone.",
  },
  {
    title: "Accounts earn trust over time",
    body: "Each account has a private trust score based on its age, verification and history. It can't be bought.",
  },
  {
    title: "You can always leave",
    body: "Next, Report, Block and Leave are one tap away in every conversation.",
  },
];

const CATEGORIES = [
  "harassment", "spam", "sexual content", "hate or abusive content",
  "threats", "scams", "impersonation", "anything else",
];

const AFTER_REPORT = [
  { title: "You're separated right away.", body: "The conversation ends the moment you report." },
  { title: "The report is sorted automatically.", body: "It gets a category and a risk score." },
  { title: "A moderator reviews serious cases.", body: "Nobody is permanently banned by an automated score alone." },
  { title: "Action is taken.", body: "Depending on severity: a warning, a timeout, a suspension or a ban." },
];

export default function SafetyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-20">
      <h1 className="type-poster text-5xl sm:text-7xl">Safety</h1>
      <p className="mt-5 max-w-[48ch] text-lg leading-relaxed text-muted-foreground">
        {APP_NAME} is for adults {MINIMUM_AGE} and older. This is how conversations with strangers
        stay safe here, and what happens when someone crosses a line.
      </p>

      <section className="mt-14">
        <h2 className="font-display text-2xl font-bold tracking-tight">How you&apos;re protected</h2>
        <dl className="mt-6 border-t border-border">
          {PROTECTIONS.map((item) => (
            <div key={item.title} className="grid gap-1 border-b border-border py-5 sm:grid-cols-[1fr_1.3fr] sm:gap-8">
              <dt className="font-display text-lg font-semibold">{item.title}</dt>
              <dd className="leading-relaxed text-muted-foreground">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-14">
        <h2 className="font-display text-2xl font-bold tracking-tight">What happens after you report someone</h2>
        <ol className="mt-6 flex flex-col gap-5">
          {AFTER_REPORT.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="type-poster w-8 shrink-0 text-3xl text-primary" aria-hidden>
                {i + 1}
              </span>
              <p className="leading-relaxed">
                <strong className="font-semibold">{step.title}</strong>{" "}
                <span className="text-muted-foreground">{step.body}</span>
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-8 leading-relaxed text-muted-foreground">
          You can report {CATEGORIES.slice(0, -1).join(", ")}, or {CATEGORIES.at(-1)}.
        </p>
      </section>

      <p className="mt-14 border-l-4 border-destructive pl-5 leading-relaxed">
        If you or someone else is in immediate danger, contact local emergency services.{" "}
        {APP_NAME}&apos;s moderators handle safety on the platform and can&apos;t respond to
        emergencies.
      </p>
    </div>
  );
}
