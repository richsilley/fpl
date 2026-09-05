import Link from 'next/link'

/**
 * Shared pieces of the frozen player column, so the three fifteen-row views
 * behave identically when a scratch squad is being edited (section 7.7).
 */

/**
 * The player's name, as the way into the replacement panel.
 *
 * The name is the target because it is the one thing on the row that already
 * identifies the player, and the whole row would be too big a hit area next to
 * a sortable header. A separate "replace" button per row would add fifteen
 * controls to a table whose point is density.
 *
 * `href` is null on the Club Blocks view, where rows are clubs, and any time
 * there is no squad to edit. The name then renders as plain text rather than a
 * dead link.
 */
export function PlayerName({
  name,
  href,
}: {
  name: string
  href: string | null
}) {
  if (href === null) {
    return (
      <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
        {name}
      </span>
    )
  }

  return (
    <Link
      href={href}
      scroll={false}
      title={`Replace ${name}`}
      className="truncate font-medium text-neutral-900 underline decoration-neutral-300 decoration-dotted underline-offset-2 transition-colors hover:decoration-neutral-900 dark:text-neutral-100 dark:decoration-neutral-600 dark:hover:decoration-neutral-100"
    >
      {name}
    </Link>
  )
}

/**
 * Marks a row whose club is over the three-per-club limit (section 7.7).
 *
 * An accent down the left of the frozen column rather than a wash across the
 * row: the frozen column is the one part of the table always on screen, so the
 * mark survives horizontal scrolling on a phone, and it does not collide with
 * the availability tints the Form view already uses.
 *
 * Every row of an offending club gets it, not just the newest arrival — any of
 * them could be the one the reader drops, and singling out the most recent
 * would be the app guessing at their plan.
 */
export function overLimitAccent(
  teamId: number,
  overLimitTeamIds: Set<number> | undefined
): string {
  return overLimitTeamIds?.has(teamId)
    ? 'border-l-4 border-l-amber-500 dark:border-l-amber-500'
    : ''
}
