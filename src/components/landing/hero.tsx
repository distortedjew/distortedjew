import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TAGLINE } from "@/lib/brand";
import { HeroConversation } from "./hero-conversation";

/** Below this, a live count reads as "empty room" rather than "busy", so it's hidden. */
const MIN_ONLINE_TO_SHOW = 5;

export function Hero({ onlineNow }: { onlineNow: number }) {
  return (
    <section className="px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div>
          <h1 className="type-poster text-[3.25rem] sm:text-7xl lg:text-[5.4rem]">{TAGLINE}</h1>
          <p className="mt-6 max-w-[34ch] text-lg leading-relaxed text-muted-foreground sm:text-xl">
            Text, voice or video with a stranger, picked at random or by what you&apos;re into. No
            download, no phone number.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href="/discover">Start chatting</Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/login">Log in</Link>
            </Button>
          </div>

          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            {onlineNow >= MIN_ONLINE_TO_SHOW ? (
              <>
                <span className="relative flex size-2.5" aria-hidden>
                  <span className="absolute inset-0 animate-ping rounded-full bg-glow opacity-60 motion-reduce:hidden" />
                  <span className="relative size-2.5 rounded-full bg-glow" />
                </span>
                {onlineNow.toLocaleString("en-US")} people online now. 18+ only.
              </>
            ) : (
              "Free, and 18+ only."
            )}
          </p>
        </div>

        <HeroConversation />
      </div>
    </section>
  );
}
