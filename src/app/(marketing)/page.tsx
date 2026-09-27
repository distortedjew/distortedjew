import { Hero } from "@/components/landing/hero";
import { StatsBar } from "@/components/landing/stats-bar";
import { FeatureGrid } from "@/components/landing/feature-grid";
import { CtaBand } from "@/components/landing/cta-band";
import { getLandingStats } from "@/lib/analytics/landing-stats";

export default async function LandingPage() {
  const stats = await getLandingStats();

  return (
    <>
      <Hero />
      <StatsBar stats={stats} />
      <FeatureGrid />
      <CtaBand />
    </>
  );
}
