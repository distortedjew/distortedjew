"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { APP_NAME, MINIMUM_AGE } from "@/lib/constants";

const currentYear = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: 100 }, (_, i) => currentYear - MINIMUM_AGE - i);

export function GuestGate() {
  const router = useRouter();
  const [birthYear, setBirthYear] = useState("");
  const [loading, setLoading] = useState(false);

  async function continueAsGuest() {
    if (!birthYear) {
      toast.error("Please select your birth year.");
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
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <span className="mb-2 flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-primary-foreground">
            <Sparkles className="size-5" />
          </span>
          <CardTitle className="text-xl">One more thing</CardTitle>
          <CardDescription>
            {APP_NAME} connects you with real strangers over video, voice, and
            text — confirm your age to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <select
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            className="h-11 rounded-xl border border-input bg-input/30 px-4 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="" disabled>
              Select your birth year
            </option>
            {BIRTH_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <Button onClick={continueAsGuest} disabled={loading} className="w-full">
            {loading && <Loader2 className="size-4 animate-spin" />}
            Continue as guest
          </Button>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link href="/register">Sign up</Link>
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            By continuing you confirm you are {MINIMUM_AGE}+ and agree to our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
