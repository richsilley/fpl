'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import type { Replacement } from '@/lib/fpl/replacements'
import { formatPrice } from '@/lib/format'

/**
 * The replacement picker (section 7.7), floating over the page (7.8).
 *
 * ## Why this one is a Client Component
 *
 * Search has to filter as you type, and the affordability toggle has to act on
 * the list already on screen. Both are momentary view state over data that is
 * already here, so a round trip per keystroke would be absurd. The third and
 * last piece of client JavaScript in the app, after the horizon control and
 * `AutoSubmitSelect`.
 *
 * **Every row is still a real link.** Selecting a replacement is a navigation,
 * built on the server, so the swap itself needs no JavaScript. Without JS the
 * search box and the toggle are simply absent and the full ranked list works
 * exactly as it reads.
 *
 * ## The row is a table, not a sentence
 *
 * Name, club, price and the cost of the move each get their own column, at a
 * fixed width, so they line up down the list and can be compared by running
 * the eye straight down. They used to sit at the two far ends of a very wide
 * panel, which put the price a whole screen away from the name it belonged to.
 * The flags — over budget, fourth from a club — go on a second line under the
 * name, because they are occasional and would otherwise reserve width that is
 * usually empty.
 *
 * ## Nothing is filtered out
 *
 * Unaffordable players and club-limit breaches stay in the list, flagged. This
 * is a planning surface: the reader may be part-way through funding a move,
 * and the app cannot know which of four Sunderland players they mean to drop.
 * The affordability toggle is the one exception, and it is theirs to set, off
 * by default.
 */
export function ReplacementPanel({
  outgoingName,
  outgoingClub,
  outgoingPrice,
  position,
  positionPlural,
  rankingLabel,
  metricLabel,
  available,
  replacements,
  closeHref,
}: {
  outgoingName: string
  /** Full club name: this is prose, not a column of three-letter codes. */
  outgoingClub: string
  /** In tenths. */
  outgoingPrice: number
  /** "Goalkeeper", not "GKP". The code belongs in table headings, not here. */
  position: string
  /** Plural of the above, for "Every goalkeeper in the game". */
  positionPlural: string
  rankingLabel: string
  /** The metric's own name, for the column heading: "Fixture Score", "Form". */
  metricLabel: string
  /** Funds available before this swap, in tenths. */
  available: number
  replacements: (Replacement & { href: string })[]
  closeHref: string
}) {
  const [query, setQuery] = useState('')
  const [affordableOnly, setAffordableOnly] = useState(false)

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return replacements.filter((row) => {
      if (affordableOnly && !row.affordable) {
        return false
      }
      // One box for both: `haystack` holds the display name, both real names
      // and the club's full and short names, so "bruno", "haaland" and
      // "arsenal" all work without the reader choosing a field first.
      return needle === '' || row.haystack.includes(needle)
    })
  }, [replacements, query, affordableOnly])

  return (
    <div className="flex max-h-[calc(100vh-3rem)] flex-col">
      {/* Not `flex-wrap`: the description is long enough that wrapping sent
          Close onto a line of its own below it, which on a phone put the way
          out halfway down the dialog. The text block wraps instead. */}
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 p-4 dark:border-neutral-800">
        {/* Who is leaving, then their details, then what the list is. Run
            together on one line the name competed with three attributes of
            the player being replaced, which is the least important part. */}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            Replace {outgoingName}
          </h3>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {outgoingClub} &middot; {position} &middot;{' '}
            {formatPrice(outgoingPrice)}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Every {position.toLowerCase()} in the game, ranked by{' '}
            {rankingLabel.toLowerCase()}. {formatPrice(available)} available.
          </p>
        </div>
        <Link
          href={closeHref}
          scroll={false}
          className="shrink-0 rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Close
        </Link>
      </div>

      {/* Stacked on a phone. Side by side, the toggle's label squeezed the
          search box down to a few characters, and search is the control that
          actually needs the width. */}
      <div className="flex flex-col gap-2 border-b border-neutral-200 p-3 sm:flex-row sm:items-center sm:gap-3 dark:border-neutral-800">
        <label htmlFor="replacement-search" className="sr-only">
          Search by player or club
        </label>
        <input
          id="replacement-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search player or club…"
          autoComplete="off"
          className="w-full min-w-0 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/30 sm:flex-1 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-600"
        />
        <label className="flex shrink-0 items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={affordableOnly}
            onChange={(event) => setAffordableOnly(event.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-600"
          />
          Only what I can afford
        </label>
        <span
          aria-live="polite"
          className="shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400"
        >
          {shown.length} of {replacements.length}
        </span>
      </div>

      {/* The column heads for the rows below, so the fixed widths read as
          columns rather than as coincidence. */}
      <div className="flex items-center gap-3 border-b border-neutral-200 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span className="min-w-0 flex-1">Player</span>
        <span className="w-16 shrink-0 text-right">Price</span>
        <span className="w-16 shrink-0 text-right">Change</span>
        {/* The metric's own name, not "Ranked by": the values underneath
            already state their units, so a generic heading said nothing the
            column did not. */}
        <span className="hidden w-40 shrink-0 truncate text-right sm:block">
          {metricLabel}
        </span>
        <span className="w-12 shrink-0 text-right">xP</span>
      </div>

      {/* `min-h-0` so this is what shrinks when the panel hits its height cap:
          without it the list keeps its content height and pushes the badge
          legend off the bottom of the dialog. */}
      <ul className="min-h-0 flex-1 divide-y divide-neutral-100 overflow-y-auto dark:divide-neutral-800">
        {shown.map((row) => (
          <li key={row.id}>
            {/* Already in the squad, so listed and flagged but not selectable.
                This is the one thing the panel will not let you do, and it is
                not the same call as over budget or over the club limit: those
                are states you can fund or transfer your way out of, while a
                duplicate player is one FPL has no concept of, and taking it
                would silently leave you with fourteen. */}
            <RowShell href={row.alreadyOwned ? null : row.href}>
              <span className="min-w-0 flex-1">
                {/* The club reads as part of the name, which is how anyone
                    would say it out loud, and a column of three-letter codes
                    was width spent on the least distinguishing thing. */}
                <span className="block truncate">
                  <span className="font-medium text-neutral-900 dark:text-neutral-100">
                    {row.fullName}
                  </span>{' '}
                  <span className="text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
                    {row.club}
                  </span>
                </span>
                {(row.alreadyOwned ||
                  row.breachesClubLimit ||
                  !row.affordable) && (
                  <span className="mt-0.5 flex flex-wrap gap-1">
                    {row.alreadyOwned && <Flag tone="neutral">in squad</Flag>}
                    {row.breachesClubLimit && (
                      <Flag tone="warn">4th {row.club}</Flag>
                    )}
                    {!row.affordable && <Flag tone="warn">over budget</Flag>}
                  </span>
                )}
              </span>

              <span className="w-16 shrink-0 text-right text-sm tabular-nums text-neutral-900 dark:text-neutral-100">
                {formatPrice(row.price)}
              </span>
              <span
                className={`w-16 shrink-0 text-right text-sm tabular-nums ${costTone(row.costDifference)}`}
              >
                {formatCostDifference(row.costDifference)}
              </span>
              <span className="hidden w-40 shrink-0 truncate text-right text-xs text-neutral-500 sm:block dark:text-neutral-400">
                {row.rankValue}
              </span>
              <span className="w-12 shrink-0 text-right text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                {row.expectedPointsNext.toFixed(1)}
              </span>
            </RowShell>
          </li>
        ))}

        {shown.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No {positionPlural.toLowerCase()} match that.
            {affordableOnly && ' Try turning off the affordability filter.'}
          </li>
        )}
      </ul>

      {/* The badges appeared on rows with nothing anywhere saying what they
          meant, and the reason unusable players are listed at all was written
          down only in the requirements. Both belong under the list. */}
      <div className="shrink-0 space-y-1.5 border-t border-neutral-200 px-3 py-2.5 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <BadgeNote>
            <Flag tone="neutral">in squad</Flag> already one of your fifteen
          </BadgeNote>
          <BadgeNote>
            <Flag tone="warn">over budget</Flag> costs more than you have
          </BadgeNote>
          <BadgeNote>
            <Flag tone="warn">4th COV</Flag> you already own three from that
            club
          </BadgeNote>
        </div>
        <p>
          These players are still listed rather than hidden, because you may be
          planning to fund the move by selling elsewhere.
        </p>
      </div>
    </div>
  )
}

function BadgeNote({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>
}

/** A selectable row is a link; an unselectable one is the same box, inert. */
function RowShell({
  href,
  children,
}: {
  href: string | null
  children: React.ReactNode
}) {
  const shape = 'flex items-start gap-3 px-3 py-1.5'
  if (href === null) {
    return <span className={`${shape} opacity-55`}>{children}</span>
  }
  return (
    <Link
      href={href}
      scroll={false}
      className={`${shape} transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60`}
    >
      {children}
    </Link>
  )
}

/**
 * The cost of the move, from the reader's point of view: a rise costs money,
 * so it is the red one. This is the opposite of the Form view's price column,
 * where a rise is a gain in team value — the same arrow means different things
 * depending on whether you already own the player.
 */
function costTone(difference: number): string {
  if (difference === 0) {
    return 'text-neutral-400 dark:text-neutral-500'
  }
  return difference > 0
    ? 'text-rose-700 dark:text-rose-400'
    : 'text-emerald-700 dark:text-emerald-400'
}

/** Section 7.7: "+£3.2m", "-£0.5m", "level". */
export function formatCostDifference(tenths: number): string {
  if (tenths === 0) {
    return 'level'
  }
  const sign = tenths > 0 ? '+' : '−'
  return `${sign}£${Math.abs(tenths / 10).toFixed(1)}m`
}

function Flag({
  tone,
  children,
}: {
  tone: 'neutral' | 'warn'
  children: React.ReactNode
}) {
  return (
    <span
      className={`rounded px-1 py-0.5 text-[10px] font-medium ${
        tone === 'warn'
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
      }`}
    >
      {children}
    </span>
  )
}
