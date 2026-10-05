/**
 * Motion presets (framer-motion). Fast and subtle: 120–220 ms, no bounce. The app is wrapped
 * in <MotionConfig reducedMotion="user">, so these collapse to instant changes when the OS asks
 * for reduced motion. Spread them onto motion elements: <motion.div {...motionPresets.fadeRise} />.
 */
import type { Transition } from "framer-motion";

export const EASE_OUT: [number, number, number, number] = [0.25, 1, 0.5, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];

const quick: Transition = { duration: 0.18, ease: EASE_OUT };

export const motionPresets = {
  /** Route / page enter: fade + slight rise. */
  page: {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.2, ease: EASE_OUT },
  },
  /** Generic fade + rise for cards and panels appearing. */
  fadeRise: {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 4 },
    transition: quick,
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15, ease: EASE_OUT },
  },
  /** New row in a live feed (events, decisions, trades). Use with <AnimatePresence initial={false}>. */
  listItem: {
    initial: { opacity: 0, y: -6, backgroundColor: "color-mix(in oklab, var(--accent) 8%, transparent)" },
    animate: { opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" },
    exit: { opacity: 0 },
    transition: { duration: 0.24, ease: EASE_OUT, backgroundColor: { duration: 1.2 } },
  },
  /** Dialog panel. */
  dialog: {
    initial: { opacity: 0, scale: 0.97, y: 8 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: 4 },
    transition: { duration: 0.18, ease: EASE_OUT },
  },
  overlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.16 },
  },
  /** Banner sliding open under the nav. */
  banner: {
    initial: { height: 0, opacity: 0 },
    animate: { height: "auto", opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: { duration: 0.2, ease: EASE_OUT },
  },
} as const;

/** Sheet (drawer) transitions per side. */
export const sheetMotion = {
  right: { initial: { x: "100%" }, animate: { x: 0 }, exit: { x: "100%" } },
  left: { initial: { x: "-100%" }, animate: { x: 0 }, exit: { x: "-100%" } },
  bottom: { initial: { y: "100%" }, animate: { y: 0 }, exit: { y: "100%" } },
} as const;

export const sheetTransition: Transition = { type: "tween", duration: 0.24, ease: EASE_OUT };
