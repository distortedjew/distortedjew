import { getCurrentUser } from "@/lib/auth/session";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";
import { AmbientBackground } from "@/components/landing/ambient-background";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      <AmbientBackground />
      <Navbar isAuthenticated={!!user} />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
