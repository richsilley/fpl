import Link from 'next/link'

import type { Horizon } from '@/lib/fpl/horizon'
import {
  buildHref,
  type CarriedState,
  type RatingSource,
  type ViewId,
} from '@/lib/fpl/params'

/**
 * Switches between FPL's own fixture difficulty and the one derived from
 * results (section 6.7).
 *
 * Two links rather than a checkbox, because the choice belongs in the URL: a
 * shared link has to reproduce the numbers the sender was looking at, and a
 * screenshot of a table scored one way is meaningless if the reader opens it
 * scored the other.
 *
 * It sits beside the horizon control because both shape the same two views,
 * and it appears on both of them, since a rating that applied to Fixtures but
 * not Club Blocks would let the two disagree about the same club.
 */
export function RatingToggle({
  managerId,
  rating,
  view,
  horizon,
  sort,
  carry,
}: {
  managerId: string
  rating: RatingSource
  view: ViewId
  horizon: Horizon
  sort: string | null
  carry: CarriedState
}) {
  const href = (value: RatingSource) =>
    buildHref({ ...carry, id: managerId, view, horizon, sort, rating: value })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-sm text-neutral-500 dark:text-neutral-400">
        Difficulty
      </span>
      <span className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700">
        <Option
          href={href('fpl')}
          selected={rating === 'fpl'}
          title="FPL's own fixture difficulty rating, fixed before the season started"
        >
          FPL
        </Option>
        <Option
          href={href('form')}
          selected={rating === 'form'}
          title="Derived from results: recent goal difference and points, shrunk towards a prior, with a league-wide home advantage"
        >
          Form
        </Option>
        <Option
          href={href('blend')}
          selected={rating === 'blend'}
          title="Form, offset by the club's own strength: how hard the fixture is for them. Changes cell colours only — the Fixture Score is the same as Form"
        >
          Blend
        </Option>
      </span>
    </div>
  )
}

function Option({
  href,
  selected,
  title,
  children,
}: {
  href: string
  selected: boolean
  title: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-current={selected ? 'true' : undefined}
      scroll={false}
      className={`px-2.5 py-1 text-sm font-medium transition-colors ${
        selected
          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
          : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      {children}
    </Link>
  )
}
