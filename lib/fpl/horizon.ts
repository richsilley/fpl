/**
 * Horizon and Fixture Score helpers that are pure arithmetic (sections 6.1 and
 * 7.6).
 *
 * Deliberately **not** `server-only`, unlike the rest of lib/fpl. The horizon
 * control is a Client Component, and importing a server-only module from one
 * throws at build time. Everything here is a constant or a pure function over
 * numbers, so it is safe in either place; anything that touches the FPL API
 * stays in ./fixtures.ts.
 */

export const LAST_GAMEWEEK = 38

/**
 * The horizon is any whole number of gameweeks from 1 up (section 7.6), not
 * one of a fixed set. The presets are shortcuts, not the range.
 */
export type Horizon = number

/** One-click horizons (section 7.6). 1 is the question asked at a deadline. */
export const HORIZON_PRESETS = [1, 3, 5, 8, 10] as const

export const DEFAULT_HORIZON: Horizon = 5

/**
 * The score an all-average run gets, and the midpoint of the scale: every
 * fixture at FDR 3 gives `(3 / 1) x 2`. Used to colour the summary.
 */
export const NEUTRAL_SCORE = 6

/**
 * Section 7.6: out-of-range values clamp to the nearest valid value rather
 * than erroring, so a hand-edited URL still renders something sensible.
 *
 * This enforces the lower bound and the absolute season length only. The upper
 * bound depends on how many gameweeks are left, which needs the event list, so
 * `clampHorizon` applies it once that is known.
 */
export function parseHorizon(value: string | undefined): Horizon {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_HORIZON
  }
  return Math.min(LAST_GAMEWEEK, Math.max(1, Math.floor(parsed)))
}

/** Gameweeks left to play, which is the largest useful horizon. */
export function maxHorizon(startGameweek: number): number {
  return Math.max(1, LAST_GAMEWEEK - startGameweek + 1)
}

export function clampHorizon(horizon: Horizon, startGameweek: number): Horizon {
  return Math.min(horizon, maxHorizon(startGameweek))
}

/** Section 6.3: one decimal place, e.g. "7.2". */
export function formatFixtureScore(score: number): string {
  return score.toFixed(1)
}
