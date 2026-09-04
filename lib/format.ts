/**
 * Display formatting shared across views.
 *
 * No `server-only` here: these are pure functions and a Client Component view
 * will want them too.
 */

/**
 * Formats a price for display.
 *
 * Constraint 4 (section 5): the API gives prices in tenths of a million, so
 * `75` is £7.5m. Always one decimal place, so a column of prices lines up.
 */
export function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`
}

/** Formats a rank with thousands separators, e.g. 280868 to "280,868". */
export function formatRank(rank: number | null): string {
  return rank === null ? '—' : rank.toLocaleString('en-GB')
}

/** Formats a points total with an explicit sign, e.g. -4 to "-4". */
export function formatPoints(points: number): string {
  return points.toLocaleString('en-GB')
}

/**
 * Formats a price change for the Form view (section 7.3).
 *
 * Also in tenths, so `-1` is a fall of £0.1m. Always signed, because the
 * direction is the point of the column, and an em dash for no change so a
 * column of zeroes does not drown the movements that matter.
 */
export function formatPriceChange(tenths: number): string {
  if (tenths === 0) {
    return '—'
  }
  const sign = tenths > 0 ? '+' : '−'
  return `${sign}${Math.abs(tenths / 10).toFixed(1)}`
}
