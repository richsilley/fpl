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

/**
 * Where a rank sits as a share of the field, e.g. rank 280,868 of 10,389,260
 * is the top "2.7%".
 *
 * Rank over total, to one decimal place. Note this is the inverse framing of
 * the Ownership view's "ahead of 97.3% of managers": same fact, and both are
 * shown because the header answers "how am I doing" while section 7.4 answers
 * "how much room is there above me".
 *
 * **Floored at 0.1%.** One decimal runs out of resolution at about rank 5,200
 * in a field of ten million, and every rank above that rounded to "0.0%",
 * which reads as missing data rather than as the best possible answer. 0.1% is
 * the smallest figure this scale can honestly express, so it is where it
 * stops; the exact standing is in the rank beside it.
 */
export function formatTopPercent(
  rank: number | null,
  totalPlayers: number
): string {
  if (rank === null || rank < 1 || totalPlayers < 1) {
    return '—'
  }
  const percent = Math.min(100, (rank / totalPlayers) * 100)
  return `${Math.max(0.1, percent).toFixed(1)}%`
}

/** Formats a points total with an explicit sign, e.g. -4 to "-4". */
export function formatPoints(points: number): string {
  return points.toLocaleString('en-GB')
}

/**
 * Formats a price change for the Form view (section 7.3).
 *
 * Also in tenths, so `-1` is a fall of £0.1m. Always signed, because the
 * direction is the point of the column.
 *
 * **No change renders as nothing at all**, not a dash. Most players have not
 * moved in a given week, and a column of placeholders is visual noise that
 * hides the handful of rows that did move.
 */
export function formatPriceChange(tenths: number): string {
  if (tenths === 0) {
    return ''
  }
  const sign = tenths > 0 ? '+' : '−'
  return `${sign}${Math.abs(tenths / 10).toFixed(1)}`
}

/**
 * Net transfers this gameweek, in words rather than as a signed number.
 *
 * "Market +345k" did not say what was being counted; "345k buying" needs no
 * tooltip. Rounded to thousands because the magnitude is the whole signal —
 * whether a quarter of a million managers are moving, not whether it is
 * 345,102 or 345,098.
 *
 * Shared by the Form and Ownership tables and The Edge, so one movement cannot
 * be described three different ways.
 */
export function formatNetTransfers(net: number): string {
  if (net === 0) {
    return 'level'
  }
  const magnitude = Math.abs(net)
  const rounded =
    magnitude >= 1000 ? `${Math.round(magnitude / 1000)}k` : String(magnitude)
  return net > 0 ? `${rounded} buying` : `${rounded} selling`
}

/** Green when the market is buying, red when selling. Matches section 6.4. */
export function netTransferTone(net: number): string {
  if (net === 0) {
    return 'text-neutral-400 dark:text-neutral-500'
  }
  return net > 0
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-rose-700 dark:text-rose-400'
}
