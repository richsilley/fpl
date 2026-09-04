/**
 * Player availability (section 7.3).
 *
 * Not `server-only`: pure mapping over a status code, no FPL calls.
 *
 * Section 7.3 asks for three visual states, not five API ones: "Red for out,
 * amber for doubtful with the percentage chance shown, no flag for available."
 * This collapses the API's status codes to exactly those three so the views do
 * not each invent their own reading of the codes.
 */

export type AvailabilityLevel = 'available' | 'doubtful' | 'out'

export type Availability = {
  level: AvailabilityLevel
  /** Short label for the flag, e.g. "75%" or "Out". Null when available. */
  flag: string | null
  /** Fuller wording for a status column, e.g. "Suspended". */
  label: string
  /** Percentage chance of playing, when the API gives one for a doubt. */
  chance: number | null
}

/**
 * Observed status codes, verified against the live API on 4 September 2026:
 * `a` available, `d` doubtful, `i` injured, `s` suspended, `u` unavailable
 * (which in practice covers players out on loan or otherwise not in the
 * league). `n` is documented elsewhere as not eligible.
 *
 * Anything unrecognised is treated as out rather than available. Showing a
 * player as fit when the API is telling us something we do not understand is
 * the more costly mistake of the two.
 */
const LABELS: Record<string, string> = {
  a: 'Available',
  d: 'Doubtful',
  i: 'Injured',
  s: 'Suspended',
  u: 'Unavailable',
  n: 'Not eligible',
}

export function availabilityOf(player: {
  status: string
  chanceOfPlaying: number | null
}): Availability {
  const label = LABELS[player.status] ?? 'Unavailable'

  if (player.status === 'a') {
    return { level: 'available', flag: null, label, chance: null }
  }

  if (player.status === 'd') {
    // Section 7.3 wants the percentage shown on a doubt. The API usually gives
    // one, but not always, so fall back to the word.
    return {
      level: 'doubtful',
      flag:
        player.chanceOfPlaying === null
          ? 'Doubt'
          : `${player.chanceOfPlaying}%`,
      label,
      chance: player.chanceOfPlaying,
    }
  }

  return { level: 'out', flag: 'Out', label, chance: player.chanceOfPlaying }
}
