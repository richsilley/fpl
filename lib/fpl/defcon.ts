/**
 * Defensive contribution ("DefCon"), for the Form view (section 7.3).
 *
 * Not `server-only`: pure arithmetic over numbers already fetched.
 *
 * FPL awards two points for clearing a threshold of defensive actions in a
 * match: 10 for a defender, 12 for a midfielder or forward. Goalkeepers are
 * not scored on it at all.
 *
 * ## The per-90 rate is a proxy, not a prediction
 *
 * DefCon is a **threshold** stat, capped at two points: a player either clears
 * the line in a given match or does not, and beating it by a mile earns
 * nothing extra. A season average per 90 cannot tell those apart. A player
 * sitting just above the threshold most weeks and a player who posts two huge
 * scores and nothing otherwise can show the same rate while being worth very
 * different amounts, because only the first reliably banks the points.
 *
 * The figure shown is therefore a rough indicator of whether a player is in
 * the right territory, not a forecast of returns. The honest measure is a hit
 * rate: in how many of their matches did they actually clear the threshold.
 * That needs per-gameweek history from the `element-summary/{id}/` endpoint,
 * one call per player, which is not in the projection and is deferred.
 */

export type DefconThreshold = number | null

/**
 * Match actions needed for the two points, by position.
 *
 * Null for goalkeepers, who the rule does not cover, which is why they render
 * as an em dash rather than a zero.
 */
export function defconThreshold(position: string): DefconThreshold {
  switch (position) {
    case 'DEF':
      return 10
    case 'MID':
    case 'FWD':
      return 12
    default:
      return null
  }
}

/**
 * How full the bar is: the per-90 rate against the player's own threshold.
 *
 * Capped at 1, so clearing the line reads as a full bar. Beyond it the extra
 * earns nothing, so showing more would overstate the player.
 */
export function defconRatio(
  perNinety: number,
  threshold: DefconThreshold,
): number | null {
  if (threshold === null || threshold <= 0) {
    return null
  }
  if (!Number.isFinite(perNinety) || perNinety <= 0) {
    return 0
  }
  return Math.min(1, perNinety / threshold)
}

/** One decimal, matching the other rate columns. */
export function formatDefcon(perNinety: number): string {
  return (Number.isFinite(perNinety) ? perNinety : 0).toFixed(1)
}
