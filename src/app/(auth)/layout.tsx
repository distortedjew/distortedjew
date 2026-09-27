import Link from "next/link";
import { Sparkles } from "lucide-react";
import { AmbientBackground } from "@/components/landing/ambient-background";
import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <AmbientBackground />
      <Link href="/" className="mb-8 flex items-center gap-2 font-display text-xl font-semibold">
        <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground">
          <Sparkles className="size-4.5" />
        </span>
        {APP_NAME}
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
