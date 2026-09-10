/**
 * Which chips a rival still has (section 7.9).
 *
 * Not `server-only`: it derives from a payload the caller already has.
 *
 * ## Remaining is derived, because FPL only publishes what was played
 *
 * `entry/{id}/history/` returns a `chips` array of chips **used**, each with
 * the gameweek. Subtracting those from the season's allowance gives what is
 * left. There is no "remaining" field to read.
 *
 * ## Free transfers are deliberately absent
 *
 * FPL does not expose a manager's free transfer count anywhere. It can only be
 * inferred by tracking transfers accrued against transfers made, week by week,
 * and that inference breaks the moment a wildcard or free hit is involved:
 * those weeks allow unlimited transfers without consuming the stored one, and
 * the payload does not distinguish a transfer made under a chip from a normal
 * one. A number that is wrong exactly when the reader most needs it is worse
 * than no number, so this shows none.
 */

/**
 * The chips a manager gets, in the order they appear in the FPL interface.
 *
 * Since 2024/25 each is granted twice, once per half of the season, and the
 * API names both halves identically — so an allowance of two per chip is what
 * "used once" has to be measured against. `manager` is the assistant manager
 * chip, which FPL's payload calls `manager`.
 */
export const CHIP_ALLOWANCE: { code: string; label: string; total: number }[] =
  [
    { code: 'wildcard', label: 'Wildcard', total: 2 },
    { code: 'freehit', label: 'Free Hit', total: 2 },
    { code: 'bboost', label: 'Bench Boost', total: 2 },
    { code: '3xc', label: 'Triple Captain', total: 2 },
  ]

export type ChipStatus = {
  label: string
  remaining: number
  total: number
  /** Gameweeks it was played in, so the row can say when. */
  playedIn: number[]
}

/**
 * What is left, from what was played.
 *
 * An unrecognised chip code is ignored rather than guessed at: FPL has added
 * chips mid-season before, and inventing an allowance for one would report a
 * remaining count for something whose rules are unknown.
 */
export function remainingChips(
  played: { name: string; event: number }[]
): ChipStatus[] {
  return CHIP_ALLOWANCE.map(({ code, label, total }) => {
    const uses = played
      .filter((chip) => chip.name === code)
      .map((chip) => chip.event)
      .sort((a, b) => a - b)

    return {
      label,
      remaining: Math.max(0, total - uses.length),
      total,
      playedIn: uses,
    }
  })
}
