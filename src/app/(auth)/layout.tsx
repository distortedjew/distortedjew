import Link from "next/link";
import { AmbientBackground } from "@/components/landing/ambient-background";
import { Logo } from "@/components/brand/logo";
import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <AmbientBackground />
      <Link href="/" className="mb-8 flex items-center gap-2 font-display text-xl font-semibold">
        <Logo size="size-9" iconSize="size-4.5" />
        {APP_NAME}
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
