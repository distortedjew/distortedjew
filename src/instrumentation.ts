/**
 * Runs once when the Next.js server starts. Schedules the data retention
 * job (see src/lib/retention.ts) in the Node.js runtime only.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_RETENTION_JOB === "true") return;
  const { scheduleRetention } = await import("@/lib/retention");
  scheduleRetention();
}
