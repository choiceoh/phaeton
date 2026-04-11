/**
 * Shared Framer Motion transition presets & variants.
 *
 * Use these instead of inline transition objects to keep durations,
 * easing curves, and animation patterns consistent across the app.
 */
import type { Transition, Variants } from 'framer-motion'

/* ── Transition presets ── */

/** 100 ms — context menus, tab switches, tiny state flips */
export const MICRO: Transition = { duration: 0.1, ease: 'easeOut' }

/** 150 ms — badges, chips, chevrons, small UI feedback */
export const FAST: Transition = { duration: 0.15, ease: 'easeOut' }

/** 200 ms — sidebar, panels, chat — Material-style deceleration */
export const BASE: Transition = { duration: 0.2, ease: [0.4, 0, 0.2, 1] }

/** 300 ms — major layout shifts */
export const SLOW: Transition = { duration: 0.3, ease: [0.4, 0, 0.2, 1] }

/* ── Variant presets ── */

/** Fade + slight scale — popups, menus, floating UI */
export const fadeScale: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit:    { opacity: 0, scale: 0.95 },
}

/** Fade + slide up — list items, comments, history cards */
export const fadeSlideUp: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -4 },
}

/** Fade + slide down — toolbars, dropdowns appearing from top */
export const fadeSlideDown: Variants = {
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: 8 },
}

/** Horizontal list item — sort/filter condition rows */
export const listItem: Variants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit:    { opacity: 0, x: -8, height: 0, marginBottom: 0, overflow: 'hidden' },
}

/** Stagger container — wrap a list of motion children */
export const staggerContainer: Variants = {
  animate: { transition: { staggerChildren: 0.03 } },
}
