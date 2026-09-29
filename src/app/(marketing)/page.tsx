import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SafetyNote } from "@/components/landing/safety-note";
import { MoreOnWisp } from "@/components/landing/more-on-wisp";
import { ClosingCta } from "@/components/landing/closing-cta";
import { getLandingStats } from "@/lib/analytics/landing-stats";

export default async function LandingPage() {
  const stats = await getLandingStats();

  return (
    <>
      <Hero onlineNow={stats.onlineNow} />
      <HowItWorks />
      <SafetyNote />
      <MoreOnWisp />
      <ClosingCta />
    </>
  );
}
