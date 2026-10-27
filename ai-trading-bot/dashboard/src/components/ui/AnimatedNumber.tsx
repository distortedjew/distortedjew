import { animate, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffectEvent, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { DASH, isNum } from "@/lib/format";

export interface AnimatedNumberProps {
  value: number | null | undefined;
  /** Formats every intermediate frame, e.g. (n) => formatUsd(n). */
  format: (value: number) => string;
  /** Seconds (default 0.5). */
  duration?: number;
  className?: string;
}

/**
 * Number that counts smoothly to each new value (KPIs, P&L, equity). Frames are written
 * straight to the DOM (no React re-render per frame); an sr-only copy holds the final value
 * for screen readers and tests. Instant when the user prefers reduced motion.
 *
 *   <AnimatedNumber value={equity} format={(n) => formatUsd(n)} className="num-sans text-kpi" />
 */
export function AnimatedNumber({ value, format, duration = 0.5, className }: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionValue = useMotionValue(isNum(value) ? value : 0);
  const reduceMotion = useReducedMotion();
  const hasValue = isNum(value);
  const text = hasValue ? format(value) : DASH;
  const formatFrame = useEffectEvent((n: number) => format(n));

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!isNum(value)) {
      node.textContent = DASH;
      return;
    }
    const from = motionValue.get();
    const firstPaint = node.textContent === "" || node.textContent === DASH;
    if (reduceMotion || firstPaint || from === value) {
      motionValue.jump(value);
      node.textContent = formatFrame(value);
      return;
    }
    node.textContent = formatFrame(from);
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.25, 1, 0.5, 1],
      onUpdate: (latest) => {
        node.textContent = formatFrame(latest);
      },
      onComplete: () => {
        node.textContent = formatFrame(value);
      },
    });
    return () => controls.stop();
  }, [value, duration, reduceMotion, motionValue]);

  return (
    <span className={cn("inline-block", className)}>
      <span ref={ref} aria-hidden />
      <span className="sr-only">{text}</span>
    </span>
  );
}
