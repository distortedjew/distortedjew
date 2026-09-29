import Link from "next/link";

const ITEMS = [
  {
    href: "/rooms",
    title: "Group rooms",
    body: "Temporary rooms for 2 to 8 people around a topic, over text, voice or video. They close when everyone leaves.",
  },
  {
    href: "/games",
    title: "Mini-games",
    body: "Would You Rather, Trivia, Guess the Word and Draw & Guess, played inside the chat.",
  },
  {
    href: "/discover",
    title: "Language exchange",
    body: "Get paired with someone who speaks a different language, and translate any message with one tap.",
  },
];

export function MoreOnWisp() {
  return (
    <section className="px-5 py-16 sm:px-8 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">More than one-on-one</h2>
        <div className="mt-10 grid gap-x-8 sm:grid-cols-3">
          {ITEMS.map((item) => (
            <Link
              key={item.href + item.title}
              href={item.href}
              className="group border-t-2 border-foreground py-5 focus-visible:outline-none"
            >
              <h3 className="font-display text-xl font-semibold group-hover:text-primary group-focus-visible:text-primary group-focus-visible:underline">
                {item.title}
              </h3>
              <p className="mt-2 max-w-[36ch] leading-relaxed text-muted-foreground">{item.body}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
