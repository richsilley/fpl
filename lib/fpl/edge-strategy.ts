/**
 * Layer 2 of The Edge (section 7.9): what a player's projected points are
 * worth, given where the reader stands.
 *
 * Not `server-only`: pure arithmetic, and the backtest needs to be able to
 * strip this layer off to score Layer 1 on its own.
 *
 * ## Strategy does not change how many points a player scores
 *
 * It changes how much you care about variance relative to the people you are
 * competing with. Leading a league, every differential is a way to lose ground
 * you already hold, so what your rivals own is worth more than its raw
 * projection. Chasing, matching the field preserves the gap that is beating
 * you, so a differential is worth more than its projection. **Same
 * projections, opposite ranking.**
 *
 * That is the whole of this layer:
 *
 * ```
 * value = projected + RISK x direction x (ownership - populationMean)
 * ```
 *
 * ## Exactly one tuning constant
 *
 * `RISK_WEIGHT`, scaled by the reader's risk setting. That is deliberate and
 * is the reason Layer 1 is kept separate (see `edge-projection.ts`). Merging
 * the layers would need a weight per combination of scope, objective and risk,
 * and there is no observable quantity any of those could be validated against.
 * One falsifiable model plus one preference is the whole design.
 *
 * ## There is no Objective control
 *
 * Direction is derived from whether the reader is ahead of or behind the
 * selected scope, which the app already computes for the Ownership view's
 * direction flag (section 7.4). Aggressive-while-ahead is extending a lead;
 * conservative-while-ahead is defending it. Risk plus scope covers every case
 * with one fewer control, and a control whose value can be derived is a
 * control that can disagree with reality.
 */

import type { FieldPosition } from './ownership'

/**
 * Points per percentage point of ownership difference, at balanced risk.
 *
 * The units matter: ownership is a percentage, so a player 20 points clear of
 * the population mean shifts by `20 x RISK_WEIGHT x scale`. At 0.04 balanced,
 * that is 0.8 points over a horizon — enough to separate near-equal
 * projections without ever overturning a real difference in expected points.
 *
 * **This is the only number in Layer 2.** If The Edge ranks badly, this and
 * the Layer 1 constants are the two places to look, and they fail in
 * distinguishable ways: Layer 1 being wrong shows up in the backtest, Layer 2
 * being wrong does not and can only be judged by whether the advice is useful.
 */
export const RISK_WEIGHT = 0.04

/** The reader's appetite for variance against their reference population. */
export const RISK_LEVELS = ['conservative', 'balanced', 'aggressive'] as const
export type RiskLevel = (typeof RISK_LEVELS)[number]

export const DEFAULT_RISK: RiskLevel = 'balanced'

export const RISK_LABELS: Record<RiskLevel, string> = {
  conservative: 'Conservative',
  balanced: 'Balanced',
  aggressive: 'Aggressive',
}

/**
 * How hard the ownership term pulls, per risk level.
 *
 * Conservative does not mean "ignore ownership": it means lean harder on the
 * safe side of whichever direction the reader's position implies. Aggressive
 * leans harder the other way. The sign comes from `direction`, not from here,
 * which is why a single scale covers both being ahead and being behind.
 */
const RISK_SCALE: Record<RiskLevel, number> = {
  conservative: 1.6,
  balanced: 1,
  aggressive: 0.2,
}

export function parseRisk(value: string | undefined): RiskLevel {
  return (RISK_LEVELS as readonly string[]).includes(value ?? '')
    ? (value as RiskLevel)
    : DEFAULT_RISK
}

/**
 * Which way the ownership term points.
 *
 * **Ahead: +1**, so a player owned more than the population mean is worth more
 * than their raw projection and a differential is penalised. **Behind: -1**,
 * the reverse. Unknown: 0, which drops the term entirely rather than guessing
 * — with no rank to read the reader against there is no such thing as a safe
 * pick.
 *
 * ## This is the opposite sign to the one section 7.9 writes down
 *
 * That section specifies "-1 when ahead of the reference population, +1 when
 * behind", but its own reasoning in the next paragraph says the opposite:
 * "Leading, you minimise the chance of losing ground, so you want what your
 * rivals own. Chasing, you need differentials."
 *
 * Taken literally the formula does the reverse of the prose. Built that way it
 * ranked a 30%-owned player *below* a 0.2%-owned one for a manager in the top
 * 1% — advising someone defending a lead to take on variance against the field
 * they are already beating.
 *
 * The prose wins for two reasons. It is stated twice and the sign once, and
 * more importantly the Ownership view (section 7.4) already ships the same
 * rule: ahead, Template is the best band and Differential the worst. Two views
 * giving opposite advice from the same standing would be a visible
 * contradiction, and the one that has been on screen longest is the one that
 * defines what "ahead" means in this app.
 */
export function strategyDirection(position: FieldPosition): number {
  if (position === 'ahead') {
    return 1
  }
  if (position === 'behind') {
    return -1
  }
  return 0
}

/** One line of prose stating the derived direction, shown above the lists. */
export function describeDirection(
  position: FieldPosition,
  risk: RiskLevel,
  subject: string
): string {
  if (position === 'unknown') {
    return `There is no rank to read you against ${subject}, so there is no safe or bold side to take. These are ranked on projected points alone.`
  }

  const ahead = position === 'ahead'
  const stance = ahead
    ? 'players your rivals already own are worth more than their raw projection, and differentials are a risk'
    : 'differentials are worth more than their raw projection, because matching the field preserves the gap'

  const appetite =
    risk === 'balanced'
      ? ''
      : risk === 'conservative'
        ? ' Conservative leans harder that way.'
        : ' Aggressive leans against it, taking on variance to chase a bigger swing.'

  return `You are ${ahead ? 'ahead of' : 'behind'} ${subject}, so ${stance}.${appetite}`
}

export type StrategyInput = {
  /** Layer 1's answer, untouched. */
  projectedPoints: number
  /** This player's ownership within the selected scope, as a percentage. */
  ownership: number
  /** Mean ownership across the candidates being ranked. */
  populationMean: number
  position: FieldPosition
  risk: RiskLevel
}

export type StrategyValue = {
  /** What the lists rank on. */
  value: number
  /** How far the strategy moved it, for showing the working. */
  adjustment: number
}

/**
 * Section 7.9's Layer 2 formula, verbatim.
 *
 * `adjustment` is returned separately so a row can show projection and
 * strategy apart. A player near the top because of expected points and one
 * there because they are heavily owned in the reader's league are different
 * recommendations, and the row has to be able to say which.
 */
export function strategyValue({
  projectedPoints,
  ownership,
  populationMean,
  position,
  risk,
}: StrategyInput): StrategyValue {
  const adjustment =
    RISK_WEIGHT *
    RISK_SCALE[risk] *
    strategyDirection(position) *
    (ownership - populationMean)

  return { value: projectedPoints + adjustment, adjustment }
}

/** Mean of the ownership figures the ranking is being done over. */
export function meanOwnership(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  return values.reduce((total, value) => total + value, 0) / values.length
}
