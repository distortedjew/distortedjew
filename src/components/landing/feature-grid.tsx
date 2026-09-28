import { Video, Sparkles, Gamepad2, Globe, Languages, ShieldCheck } from "lucide-react";

const FEATURES = [
  {
    icon: Video,
    title: "Random video & voice",
    description: "Face-to-face or voice-only — jump into a live conversation with one tap, powered by real-time WebRTC.",
  },
  {
    icon: Sparkles,
    title: "Interest matching",
    description: "Tell us what you're into — gaming, music, anime, code — and we'll pair you with people who get it.",
  },
  {
    icon: Gamepad2,
    title: "Mini-games together",
    description: "Break the ice with Would You Rather, Trivia, or Draw & Guess without ever leaving the conversation.",
  },
  {
    icon: Globe,
    title: "Global community",
    description: "Meet people from a country you pick, or let the world surprise you. Every conversation is a new place.",
  },
  {
    icon: Languages,
    title: "Language exchange",
    description: "Practice a new language with a native speaker, with live translation to bridge the gaps.",
  },
  {
    icon: ShieldCheck,
    title: "Built-in safety",
    description: "Reporting, blocking, and AI-assisted moderation run quietly in the background of every chat.",
  },
];

export function FeatureGrid() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything you need for a real conversation
          </h2>
          <p className="mt-3 text-muted-foreground">
            No feeds to scroll, no profiles to swipe. Just people, matched well.
          </p>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-border/60 bg-card/60 p-6 transition-colors hover:border-primary/30 hover:bg-card"
            >
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 text-primary">
                <feature.icon className="size-5" />
              </div>
              <h3 className="font-display text-base font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
