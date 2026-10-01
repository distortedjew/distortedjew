import { getCurrentUser } from "@/lib/auth/session";
import { Navbar } from "@/components/landing/navbar";
import { Footer } from "@/components/landing/footer";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar isAuthenticated={!!user} />
      <main id="main" tabIndex={-1} className="outline-none flex-1">{children}</main>
      <Footer />
    </div>
  );
}
