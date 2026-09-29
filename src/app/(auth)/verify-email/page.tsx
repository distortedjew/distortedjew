"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";

type Status = "verifying" | "success" | "error";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<VerifyingCard />}>
      <VerifyEmailForm />
    </Suspense>
  );
}

function VerifyingCard() {
  return (
    <Card>
      <CardHeader className="items-center text-center">
        <Loader2 className="mb-2 size-10 animate-spin text-muted-foreground" />
        <CardTitle>Verifying your email…</CardTitle>
      </CardHeader>
    </Card>
  );
}

function VerifyEmailForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>(token ? "verifying" : "error");
  const [error, setError] = useState<string | null>(
    token ? null : "This link is missing its token.",
  );

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setStatus("error");
          setError(data.error ?? "Could not verify this email.");
          return;
        }
        setStatus("success");
      })
      .catch(() => {
        setStatus("error");
        setError("Network error. Please try again.");
      });
  }, [token]);

  return (
    <Card>
      <CardHeader className="items-center text-center">
        {status === "verifying" && (
          <>
            <Loader2 className="mb-2 size-10 animate-spin text-muted-foreground" />
            <CardTitle>Verifying your email…</CardTitle>
          </>
        )}
        {status === "success" && (
          <>
            <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-success/15 text-success-foreground dark:text-success">
              <CheckCircle2 className="size-6" />
            </span>
            <CardTitle>Email verified</CardTitle>
            <CardDescription>Thanks for confirming your email address.</CardDescription>
          </>
        )}
        {status === "error" && (
          <>
            <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <XCircle className="size-6" />
            </span>
            <CardTitle>Couldn&apos;t verify email</CardTitle>
            <CardDescription>{error}</CardDescription>
          </>
        )}
      </CardHeader>
      {status !== "verifying" && (
        <CardFooter className="justify-center">
          <Button asChild>
            <Link href="/discover">Continue to Wisp</Link>
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
