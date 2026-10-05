import { OctagonAlert } from "lucide-react";

/**
 * Shown above the navigation whenever the engine reports `mode === "live"`, together with a red
 * frame around the viewport. This build only paper trades; the banner exists so a live engine
 * can never be mistaken for a simulation.
 */
export function LiveTradingBanner({ frame = true }: { frame?: boolean }) {
  return (
    <>
      <div
        role="alert"
        className="relative z-50 flex items-center justify-center gap-2 bg-down-solid px-4 py-1.5 text-center text-[12px] font-semibold tracking-[0.06em] text-white"
      >
        <OctagonAlert className="size-4 shrink-0" aria-hidden />
        <span>LIVE TRADING — real funds at risk</span>
        <span className="hidden font-normal tracking-normal text-white/80 md:inline">
          · Orders from this bot are sent to the exchange.
        </span>
      </div>
      {frame ? (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] shadow-[inset_0_0_0_2px_var(--down)]" />
      ) : null}
    </>
  );
}
