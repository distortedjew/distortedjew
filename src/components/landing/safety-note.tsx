import Link from "next/link";

const FACTS = [
  "Everyone confirms they're 18 or older before their first chat.",
  "Every chat has one-tap Report and Block. People you block are never matched with you again.",
  "Reports go to moderators, who can warn, suspend or ban an account.",
  "Messages are checked for spam and abuse as they're sent.",
  "You don't need a phone number or your real name. Guests stay anonymous.",
];

export function SafetyNote() {
  return (
    <section className="bg-[#1D1838] px-5 py-16 text-[#EEEAFB] sm:px-8 lg:py-24 dark:bg-card">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Talking to strangers, safely
          </h2>
          <Link
            href="/safety"
            className="mt-5 inline-block text-sm font-medium underline underline-offset-4 opacity-80 hover:opacity-100"
          >
            Read the safety guide
          </Link>
        </div>
        <ul className="flex flex-col">
          {FACTS.map((fact) => (
            <li
              key={fact}
              className="flex gap-4 border-t border-white/15 py-4 text-lg leading-relaxed first:border-t-0 first:pt-0"
            >
              <span className="mt-2.5 size-2 shrink-0 rounded-full bg-glow" aria-hidden />
              {fact}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
