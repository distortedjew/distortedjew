const STEPS = [
  {
    title: "Choose how to talk",
    body: "Text, voice or video. Add a few interests or a language if you want someone specific, or leave it to chance.",
  },
  {
    title: "Get matched",
    body: "Usually within seconds. You see their name, what you have in common, and their country if they share it.",
  },
  {
    title: "Talk, play, or move on",
    body: "Start a mini-game or share a song. Tap Next for someone new, or the heart to stay connected if they tap it too.",
  },
];

export function HowItWorks() {
  return (
    <section className="border-t border-border px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="max-w-[36ch]">
              <span className="type-poster block text-6xl text-primary" aria-hidden>
                {i + 1}
              </span>
              <h3 className="mt-4 font-display text-xl font-semibold">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
