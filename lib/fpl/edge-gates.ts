/**
 * The Edge, Layer 2 (section 7.9): does a move qualify at all?
 *
 * Not `server-only`: pure arithmetic over values already fetched.
 *
 * ## Two of three, not a weighted sum
 *
 * This replaces the continuous value ranking the first build used. That ranked
 * every player in the game on one number and put Khalaili — 0.2% owned, form
 * 2.0 — top of the buy list, because a defender with a high DefCon rate and an
 * easy fixture run scores well on an arithmetic that never asks whether anyone
 * would actually pick him.
 *
 * A gate has no weights, so there is nothing to tune and nothing to be
 * arbitrary about. A move either raises the floor, or moves money the right
 * way, or is a player you would take anyway. **Two of those three, or it is
 * not a transfer.** One of three is a chase.
 *
 * The three tests are deliberately independent: one looks at points, one at
 * money, one at durability. A candidate that passes on points alone is a
 * one-week punt; one that passes on money alone is a value trade with no
 * football behind it.
 */

import type { FplElement } from './types'

/** Projected points a buy must beat the sell by, per gameweek, to pass. */
const FLOOR_MARGIN_PER_GAMEWEEK = 0.8

/**
 * The long horizon Test 3 checks against, in gameweeks.
 *
 * Section 7.9: a player who only looks good over three gameweeks is a punt,
 * not a transfer. Six is long enough that a single soft fixture cannot carry
 * a candidate, and short enough to stay inside the run anyone is planning for.
 */
export const LONG_HORIZON = 6

/** Where a candidate has to rank on the long horizon, among the same position. */
const LONG_HORIZON_PERCENTILE = 0.75

/** Net transfers that count as the market moving, rather than noise. */
const MOMENTUM_THRESHOLD = 20_000

/** Minutes per match below which a player is not a real option. */
const MIN_MINUTES_PER_MATCH = 60

/**
 * Ownership below which a player must also be in form to be considered.
 *
 * Section 7.9: low ownership plus low form is not an undiscovered asset, it is
 * the market knowing something. Ten million managers have looked at this
 * player and passed.
 */
const OBSCURITY_OWNERSHIP = 1
const OBSCURITY_FORM_FLOOR = 3

export type GateName = 'floor' | 'money' | 'anyway'

export const GATE_LABELS: Record<GateName, string> = {
  floor: 'Raises the floor',
  money: 'Money moves the right way',
  anyway: 'Would be picked anyway',
}

export type GateResult = {
  passed: GateName[]
  failed: GateName[]
  /** True when at least two of three passed. */
  qualifies: boolean
}

/** Why a candidate never reached the tests. One reason, the first that hit. */
export type Disqualifier =
  | 'minutes'
  | 'obscure'
  | 'unavailable'
  | 'club-limit'
  | 'unaffordable'
  | 'same-player'

export const DISQUALIFIER_LABELS: Record<Disqualifier, string> = {
  minutes: 'Not playing enough minutes',
  obscure: 'Under 1% owned and out of form',
  unavailable: 'Not available',
  'club-limit': 'Would be a fourth from that club',
  unaffordable: 'Cannot afford it with this sale',
  'same-player': 'Already in the squad',
}

export type CandidateInput = {
  element: FplElement
  /** Layer 1's projection over the selected horizon. */
  projected: number
  /** Layer 1's projection over `LONG_HORIZON`, for Test 3. */
  projectedLong: number
  /** Minutes per match their club has played. */
  minutesPerMatch: number
  /** Where `projectedLong` sits among players of the same position, 0 to 1. */
  longHorizonPercentile: number
}

/**
 * Checks applied before the tests, because each is a fact about the move
 * rather than an argument for it. A player who is injured does not get to
 * pass two of three on the strength of his fixtures.
 */
export function disqualify(
  candidate: CandidateInput,
  context: {
    owned: Set<number>
    clubCounts: Map<number, number>
    sellingTeamId: number | null
    fundsAvailable: number
    sellPrice: number
  }
): Disqualifier | null {
  const { element } = candidate

  if (context.owned.has(element.id)) {
    return 'same-player'
  }
  if (element.status !== 'a') {
    return 'unavailable'
  }
  if (candidate.minutesPerMatch < MIN_MINUTES_PER_MATCH) {
    return 'minutes'
  }

  const ownership = Number(element.selected_by_percent) || 0
  const form = Number(element.form) || 0
  if (ownership < OBSCURITY_OWNERSHIP && form < OBSCURITY_FORM_FLOOR) {
    return 'obscure'
  }

  // Selling a player from the same club frees a slot, so the limit is counted
  // against the squad as it would be *after* the sale, not before it.
  const held = context.clubCounts.get(element.team) ?? 0
  const freed = context.sellingTeamId === element.team ? 1 : 0
  if (held - freed >= 3) {
    return 'club-limit'
  }

  if (element.now_cost > context.fundsAvailable + context.sellPrice) {
    return 'unaffordable'
  }

  return null
}

/**
 * The three tests, run against a specific pairing.
 *
 * A buy is only ever evaluated against the player it replaces. Test 1 needs
 * the sell to have something to beat, and Test 2 needs both sides of the money
 * — a rising buy funded by a rising sell is not the same trade as one funded
 * by a falling one.
 */
export function runGates(
  buy: CandidateInput,
  sell: CandidateInput,
  horizonGameweeks: number
): GateResult {
  const passed: GateName[] = []
  const failed: GateName[] = []

  const record = (name: GateName, ok: boolean) =>
    (ok ? passed : failed).push(name)

  // Test 1: raises the floor, by a margin that scales with the horizon so a
  // longer view needs a proportionally bigger gap, not the same absolute one.
  record(
    'floor',
    buy.projected - sell.projected >=
      FLOOR_MARGIN_PER_GAMEWEEK * Math.max(1, horizonGameweeks)
  )

  // Test 2: money moves the right way. Selling a falling asset into a rising
  // or stable one. Price change is the fact; transfer momentum is the market's
  // forecast of the next one, and either side is enough on its own.
  record('money', moneyMovesRight(buy.element, sell.element))

  // Test 3: would be picked anyway. Ranks well on the long horizon, so the
  // case does not rest on the handful of gameweeks currently selected.
  record('anyway', buy.longHorizonPercentile >= LONG_HORIZON_PERCENTILE)

  return { passed, failed, qualifies: passed.length >= 2 }
}

/**
 * Selling a falling asset, buying a rising or stable one.
 *
 * Both halves have to be true. Swapping one faller for another is churn, and
 * buying a riser funded by another riser spends value rather than moving it.
 */
function moneyMovesRight(buy: FplElement, sell: FplElement): boolean {
  return isFalling(sell) && !isFalling(buy)
}

/** Net transfers this gameweek. Positive is the market buying. */
export function netTransfers(element: FplElement): number {
  return element.transfers_in_event - element.transfers_out_event
}

/**
 * Falling, by price already moved or by the market moving against them.
 *
 * `cost_change_event` is what has happened; net transfers are what is about to.
 * A player being sold by a quarter of a million managers has not fallen yet
 * and will.
 */
export function isFalling(element: FplElement): boolean {
  return (
    element.cost_change_event < 0 ||
    netTransfers(element) <= -MOMENTUM_THRESHOLD
  )
}

/** Rising, by the same two signals in the other direction. */
export function isRising(element: FplElement): boolean {
  return (
    element.cost_change_event > 0 || netTransfers(element) >= MOMENTUM_THRESHOLD
  )
}

// ---------------------------------------------------------------------------
// The sell gate
// ---------------------------------------------------------------------------

/**
 * Reasons a squad player has a case against them. Two of these flags a sale.
 *
 * Section 7.9: do not rank all fifteen worst-first. Ranking manufactures a
 * sell case for players who have none — someone is always fifteenth. The GW4
 * log's framing is the right one: two players have no case to stay, and
 * everyone else does.
 */
export type SellReason = 'fixtures' | 'form' | 'price' | 'availability'

export const SELL_REASON_LABELS: Record<SellReason, string> = {
  fixtures: 'Hard run of fixtures',
  form: 'Out of form for the minutes played',
  price: 'Falling price, being sold',
  availability: 'Fitness doubt',
}

/** Fixture Score below this over the horizon is a hard run. 6.0 is average. */
const SELL_FIXTURE_THRESHOLD = 5.2

/**
 * Form is judged against the player's own position, not an absolute number.
 *
 * Section 7.9 asks for "form below a threshold given minutes played", and the
 * minutes half is only one of the two adjustments that matters. Among players
 * getting real minutes the median form runs GKP 3.0, DEF 3.0, MID 3.7, FWD 3.3
 * — a keeper on 3.0 is an ordinary keeper, a midfielder on 3.0 is a problem.
 * A single threshold would have flagged the squad's first-choice goalkeeper
 * for being a goalkeeper.
 *
 * The caller supplies the median for the position, computed over the same
 * population every gameweek, so this has no constant of its own.
 */

export type SellCase = {
  reasons: SellReason[]
  /** True when at least two reasons hold. */
  flagged: boolean
}

export function sellCase(
  element: FplElement,
  fixtureScore: number,
  minutesPerMatch: number,
  /** Median form among regular starters in this player's position. */
  positionMedianForm: number
): SellCase {
  const reasons: SellReason[] = []

  if (fixtureScore < SELL_FIXTURE_THRESHOLD) {
    reasons.push('fixtures')
  }

  // Form is only evidence when there are minutes behind it. A benched player
  // has low form because he has not played, which is a different problem and
  // one the minutes threshold on the buy side already handles.
  const form = Number(element.form) || 0
  if (minutesPerMatch >= MIN_MINUTES_PER_MATCH && form < positionMedianForm) {
    reasons.push('form')
  }

  // The same definition of "falling" the buy side uses. It was stricter here,
  // demanding the drop had already happened, which missed exactly the players
  // the market is in the middle of dumping — the fourth most-sold player in
  // the game read as a hold because his price had not ticked down yet.
  if (isFalling(element)) {
    reasons.push('price')
  }

  if (element.status !== 'a') {
    reasons.push('availability')
  }

  return { reasons, flagged: reasons.length >= 2 }
}
