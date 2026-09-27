import type { Metadata } from "next";
import { ShieldCheck, Flag, UserX, Bot, Lock, Heart } from "lucide-react";
import { MINIMUM_AGE, APP_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Safety Center" };

const PILLARS = [
  {
    icon: Bot,
    title: "AI-assisted moderation",
    body: "Every message passes through an automated safety filter before it's delivered. High-risk messages are blocked outright; borderline ones are queued for human review.",
  },
  {
    icon: Flag,
    title: "Report anything, anytime",
    body: "Every chat, room, and profile has a one-tap report button with clear categories — harassment, spam, sexual content, hate, threats, scams, impersonation.",
  },
  {
    icon: UserX,
    title: "Instant blocking",
    body: "Blocking someone ends the conversation immediately and guarantees you'll never be matched with them again.",
  },
  {
    icon: Lock,
    title: "Minimal data, by design",
    body: "We don't require ID or a phone number to chat. We never show your email or raw IP to anyone, ever.",
  },
  {
    icon: ShieldCheck,
    title: "Trust signals",
    body: "Accounts build a private trust score from account age, verification, and history. We never let anyone buy their way to a better standing.",
  },
  {
    icon: Heart,
    title: "You're in control",
    body: "Next, Connect, Report, and Block are always one tap away — nothing forces you to stay in a conversation you don't want.",
  },
];

const CATEGORIES = [
  "Harassment", "Spam", "Sexual content", "Hate or abusive content",
  "Threats", "Scam", "Impersonation", "Other",
];

export default function SafetyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-20">
      <div className="mx-auto max-w-xl text-center">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Safety Center</h1>
        <p className="mt-3 text-muted-foreground">
          {APP_NAME} is built for adults {MINIMUM_AGE}+ having real
          conversations. Here&apos;s exactly how we keep it that way.
        </p>
      </div>

      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div key={pillar.title} className="rounded-2xl border border-border/60 bg-card/60 p-6">
            <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 text-primary">
              <pillar.icon className="size-5" />
            </div>
            <h3 className="font-display text-base font-semibold">{pillar.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{pillar.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-2xl border border-border/60 bg-card/60 p-8">
        <h2 className="font-display text-xl font-semibold">Report categories</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Every report is reviewed against these categories so our moderation
          team — and our automated systems — can act quickly and consistently.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <span
              key={c}
              className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-16 rounded-2xl border border-border/60 bg-card/60 p-8">
        <h2 className="font-display text-xl font-semibold">What happens after you report someone</h2>
        <ol className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
          <li><strong className="text-foreground">1. Immediate separation.</strong> Reporting ends your current conversation right away — you&apos;re never stuck.</li>
          <li><strong className="text-foreground">2. Automated triage.</strong> Our AI moderation layer assigns a risk score and category to the report.</li>
          <li><strong className="text-foreground">3. Human review when needed.</strong> Higher-risk reports are queued for a human moderator — no one is permanently banned from an automated score alone.</li>
          <li><strong className="text-foreground">4. Action.</strong> Depending on severity: a warning, a temporary timeout, a suspension, or a ban.</li>
        </ol>
      </div>

      <div className="mt-16 text-center text-sm text-muted-foreground">
        If you or someone else is in immediate danger, please contact local
        emergency services. {APP_NAME}&apos;s moderation team handles
        platform safety, not emergencies.
      </div>
    </div>
  );
}
