"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { APP_NAME, MINIMUM_AGE } from "@/lib/constants";

const currentYear = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 100 }, (_, i) => currentYear - MINIMUM_AGE - i);

export function GuestGate() {
  const router = useRouter();
  const [birthYear, setBirthYear] = useState("");
  const [loading, setLoading] = useState(false);

  async function continueAsGuest() {
    if (!birthYear) {
      toast.error("Pick your birth year to continue.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ birthYear: Number(birthYear) }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong.");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Couldn't reach Wisp. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col px-5 sm:px-8">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center">
        <Link href="/" className="flex items-center gap-2.5 font-display text-xl font-bold tracking-tight">
          <Logo size="size-8" iconSize="size-5" />
          {APP_NAME}
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
        <h1 className="type-poster text-5xl sm:text-6xl">How old are you?</h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {APP_NAME} is for adults. Pick your birth year to chat as a guest. You don&apos;t need an
          email or a phone number.
        </p>

        <form
          className="mt-8 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            continueAsGuest();
          }}
        >
          <label htmlFor="guest-birth-year" className="text-sm font-medium">
            Birth year
          </label>
          <select
            id="guest-birth-year"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className="h-12 rounded-lg border border-input bg-card px-3.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="" disabled>
              Choose a year
            </option>
            {BIRTH_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <Button type="submit" size="lg" disabled={loading} className="mt-2 w-full">
            {loading && <Loader2 className="size-4 animate-spin" />}
            Continue as guest
          </Button>
        </form>

        <p className="mt-6 text-sm text-muted-foreground">
          Want to keep your connections?{" "}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>{" "}
          or{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            log in
          </Link>
          .
        </p>

        <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
          By continuing you confirm you&apos;re {MINIMUM_AGE} or older and agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
