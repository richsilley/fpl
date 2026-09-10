/**
 * Layer 1 of The Edge (section 7.9): how many points a player is expected to
 * score.
 *
 * Not `server-only`: pure arithmetic over values already fetched, so the
 * backtest script can import it directly and run it against a past gameweek.
 *
 * ## This layer knows nothing about the reader
 *
 * It produces one number per player per fixture, and that number is the same
 * for everyone: a manager leading their league and one chasing get identical
 * projections. What differs between them is how much those points are *worth*,
 * and that is Layer 2's job (`edge-strategy.ts`). **Do not merge the two.**
 *
 * The reason is falsifiability. A projection can be checked against what
 * players actually scored — `scripts/backtest-projection.mjs` does exactly
 * that. A single blended "value" score, weighted by scope and risk and
 * objective, could never be checked against anything, because there is no
 * observable quantity it claims to predict. Keeping them apart buys one model
 * that can be wrong in a measurable way, plus one preference setting.
 *
 * ## Every constant is named and tunable
 *
 * None are inlined. They are first guesses informed by how FPL scores, and the
 * backtest is how they get better. A constant buried in an expression cannot
 * be tuned by anyone who was not there when it was written.
 */

import { defconThreshold } from './defcon'
import type { TeamFixture } from './fixtures'

/** FPL pays for an appearance, and pays double for sixty minutes. */
const APPEARANCE_POINTS_FULL = 2
const APPEARANCE_POINTS_PARTIAL = 1
const MINUTES_FOR_FULL_APPEARANCE = 60

/**
 * Average minutes at which a player is treated as certain to start.
 *
 * Below it, minutes scale the probability down linearly. Deliberately under
 * ninety: a nailed starter substituted on the hour every week averages about
 * seventy and is no less certain to start.
 */
const MINUTES_FOR_CERTAIN_START = 70

/** Goal points by position, straight from FPL's scoring table. */
const GOAL_POINTS: Record<string, number> = {
  GKP: 10,
  DEF: 6,
  MID: 5,
  FWD: 4,
}

const ASSIST_POINTS = 3

/**
 * What share of a position's expected goal involvements are goals rather than
 * assists.
 *
 * xGI is xG plus xA and the two pay differently, so a single "points per
 * involvement" has to know the mix. A defender's involvements are mostly
 * assists; a forward's are mostly goals.
 *
 * The projection carries `expected_goals` and `expected_assists` separately,
 * so this blend could be replaced by using both directly. It is kept as a
 * blend because section 7.9 specifies the formula in terms of xGI, and because
 * one constant per position is a thing the backtest can tune. If the backtest
 * shows the blend is the weakest part, splitting it is the first thing to try.
 */
const GOAL_SHARE_OF_INVOLVEMENT: Record<string, number> = {
  GKP: 0,
  DEF: 0.3,
  MID: 0.45,
  FWD: 0.7,
}

/** Clean sheet points by position, from FPL's scoring table. */
const CLEAN_SHEET_POINTS: Record<string, number> = {
  GKP: 4,
  DEF: 4,
  MID: 1,
  FWD: 0,
}

/**
 * Clean sheet probability against the easiest and hardest fixtures.
 *
 * Interpolated linearly on the fixture's inverted difficulty. Both ends stop
 * short of certainty: even the best defence against the worst attack concedes
 * often enough that a probability near one would be a lie.
 */
const CLEAN_SHEET_PROBABILITY_BEST = 0.55
const CLEAN_SHEET_PROBABILITY_WORST = 0.08

/** The two points for clearing the defensive contribution threshold. */
const DEFCON_POINTS = 2

/**
 * Where a per-90 rate stops and starts predicting the two points.
 *
 * DefCon is a threshold stat (see `defcon.ts`): the rate is a proxy for a hit
 * rate, not a hit rate itself. A player at 60% of the threshold effectively
 * never clears it; one at 130% clears it most weeks. Between those the
 * probability is interpolated.
 */
const DEFCON_RATE_FLOOR = 0.6
const DEFCON_RATE_CEILING = 1.3

/**
 * How hard the fixture swings attacking output.
 *
 * A multiplier of 1 is an average fixture. At 0.5, the easiest fixture lifts
 * expected attacking returns by a third and the hardest cuts them by a third.
 * Attacking output moves with the opposition but nowhere near as much as raw
 * difficulty suggests, so this is well under 1.
 */
const FIXTURE_SWING = 0.5

/** A run of average fixtures scores this, from section 6.1. */
const NEUTRAL_FIXTURE_SCORE = 6

/** Availability codes meaning the player will not feature at all. */
const STATUS_UNAVAILABLE = new Set(['i', 's', 'u', 'n'])

/** Everything Layer 1 needs about one player. Nothing about the reader. */
export type ProjectionInput = {
  position: string
  /** Season minutes, and the matches their club has played, for the rate. */
  minutes: number
  matchesPlayed: number
  /** FPL availability code: `a` available, `d` doubtful, otherwise out. */
  status: string
  /** Percentage chance of playing, when FPL publishes one. */
  chanceOfPlayingNextRound: number | null
  /** Expected goal involvements per 90 minutes. */
  expectedGoalInvolvementsPer90: number
  /** Defensive contributions per 90 minutes. */
  defensiveContributionPer90: number
}

/** The projection, and the parts behind it, so a row can show its working. */
export type Projection = {
  /** Total expected points across the fixtures given. */
  points: number
  /** Probability the player starts a given match, 0 to 1. */
  startProbability: number
  /** Expected points from appearances alone. */
  appearance: number
  /** Expected points from goals and assists. */
  attacking: number
  /** Expected points from clean sheets and defensive contributions. */
  defensive: number
  /** Fixtures actually counted, so a blank shows as a shortfall. */
  fixtures: number
}

const EMPTY: Projection = {
  points: 0,
  startProbability: 0,
  appearance: 0,
  attacking: 0,
  defensive: 0,
  fixtures: 0,
}

/**
 * Expected points for one player across a set of fixtures.
 *
 * Fixtures are passed in rather than looked up, so a double gameweek is simply
 * two entries and a blank is none — the same shape the Fixture Score relies on
 * (section 6.5), with no special cases here either.
 *
 * The caller decides which difficulty rating produced `fixture.value`, so the
 * projection follows the mode the reader selected (section 6.7).
 */
export function projectPoints(
  input: ProjectionInput,
  fixtures: TeamFixture[]
): Projection {
  const availability = availabilityMultiplier(input)
  if (availability === 0 || fixtures.length === 0) {
    return { ...EMPTY, fixtures: fixtures.length }
  }

  const expectedMinutes = minutesPerMatch(input)
  const startProbability =
    availability * Math.min(1, expectedMinutes / MINUTES_FOR_CERTAIN_START)

  if (startProbability === 0) {
    return { ...EMPTY, fixtures: fixtures.length }
  }

  const appearancePoints =
    expectedMinutes >= MINUTES_FOR_FULL_APPEARANCE
      ? APPEARANCE_POINTS_FULL
      : APPEARANCE_POINTS_PARTIAL

  const perInvolvement = pointsPerInvolvement(input.position)
  const cleanSheetPoints = CLEAN_SHEET_POINTS[input.position] ?? 0
  const defconProbability = defconClearProbability(input)

  let appearance = 0
  let attacking = 0
  let defensive = 0

  for (const fixture of fixtures) {
    // Section 7.9's formula, one fixture at a time, so a double gameweek earns
    // twice and a blank earns nothing.
    appearance += startProbability * appearancePoints
    attacking +=
      startProbability *
      input.expectedGoalInvolvementsPer90 *
      fixtureMultiplier(fixture) *
      perInvolvement
    defensive +=
      startProbability *
      (cleanSheetProbability(fixture) * cleanSheetPoints +
        defconProbability * DEFCON_POINTS)
  }

  return {
    points: appearance + attacking + defensive,
    startProbability,
    appearance,
    attacking,
    defensive,
    fixtures: fixtures.length,
  }
}

/**
 * Availability as a multiplier on everything else.
 *
 * Section 7.9: a player flagged out scores zero, full stop. A doubt scales the
 * whole projection by the published chance of playing, which is the only
 * number FPL gives and is already a probability.
 */
function availabilityMultiplier(input: ProjectionInput): number {
  if (STATUS_UNAVAILABLE.has(input.status)) {
    return 0
  }
  if (input.chanceOfPlayingNextRound !== null) {
    return Math.max(0, Math.min(1, input.chanceOfPlayingNextRound / 100))
  }
  return 1
}

/**
 * Minutes per match their club has played, not per match they appeared in.
 *
 * The distinction is the whole point: a player who starts every game and one
 * who comes on for twenty minutes each week both look high on the second
 * measure, and only the first is worth owning.
 */
function minutesPerMatch(input: ProjectionInput): number {
  if (input.matchesPlayed <= 0) {
    return 0
  }
  return input.minutes / input.matchesPlayed
}

/** The blended value of one expected goal involvement, by position. */
function pointsPerInvolvement(position: string): number {
  const goalShare = GOAL_SHARE_OF_INVOLVEMENT[position] ?? 0.5
  const goalPoints = GOAL_POINTS[position] ?? 5
  return goalShare * goalPoints + (1 - goalShare) * ASSIST_POINTS
}

/**
 * How much this fixture lifts or suppresses attacking output.
 *
 * `fixture.value` is `6 - difficulty` under whichever rating the reader
 * selected, so one fixture alone scores `value x 2` on section 6.1's scale.
 * Measured against the neutral score, that gives a multiplier centred on 1.
 */
function fixtureMultiplier(fixture: TeamFixture): number {
  const gameweekScore = fixture.value * 2
  const swing = (gameweekScore - NEUTRAL_FIXTURE_SCORE) / NEUTRAL_FIXTURE_SCORE
  return Math.max(0, 1 + FIXTURE_SWING * swing)
}

/** Clean sheet chance, interpolated on the fixture's inverted difficulty. */
function cleanSheetProbability(fixture: TeamFixture): number {
  // `value` runs 1 (hardest) to 5 (easiest) under FPL's integer rating.
  const eased = Math.max(0, Math.min(1, (fixture.value - 1) / 4))
  return (
    CLEAN_SHEET_PROBABILITY_WORST +
    eased * (CLEAN_SHEET_PROBABILITY_BEST - CLEAN_SHEET_PROBABILITY_WORST)
  )
}

/**
 * Chance of clearing the defensive contribution threshold in a match.
 *
 * Goalkeepers are outside the rule entirely and score nothing here.
 */
function defconClearProbability(input: ProjectionInput): number {
  const threshold = defconThreshold(input.position)
  if (threshold === null || threshold <= 0) {
    return 0
  }
  const rate = input.defensiveContributionPer90 / threshold
  const span = DEFCON_RATE_CEILING - DEFCON_RATE_FLOOR
  return Math.max(0, Math.min(1, (rate - DEFCON_RATE_FLOOR) / span))
}
