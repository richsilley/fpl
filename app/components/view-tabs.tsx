import Link from 'next/link'

import {
  BUILT_VIEWS,
  buildHref,
  VIEW_LABELS,
  type ViewId,
} from '@/lib/fpl/params'
import type { Horizon } from '@/lib/fpl/horizon'

/**
 * Switches between views (section 8.2's `view` parameter).
 *
 * Links, so the view is in the URL and a shared link opens on the same one.
 * The horizon rides along, which is what section 7.6 means by the Fixtures and
 * Club Blocks views reading the same `horizon` parameter: switching view keeps
 * the run of gameweeks you were looking at.
 *
 * Only built views are listed. Form and Ownership are in section 8.2's table
 * but are build steps 5 to 7, and a tab that leads nowhere is worse than no
 * tab.
 */
export function ViewTabs({
  managerId,
  view,
  horizon,
  sort,
  league,
  rival,
}: {
  managerId: string
  view: ViewId
  horizon: Horizon
  sort: string | null
  /** Carried through so leaving Ownership and returning keeps the population. */
  league: string | null
  rival: string | null
}) {
  return (
    <nav
      aria-label="View"
      className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800"
    >
      {BUILT_VIEWS.map((id) => {
        const selected = id === view
        return (
          <Link
            key={id}
            href={buildHref({
              id: managerId,
              view: id,
              horizon,
              sort,
              league,
              rival,
            })}
            aria-current={selected ? 'page' : undefined}
            scroll={false}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? 'border-neutral-900 text-neutral-900 dark:border-neutral-100 dark:text-neutral-50'
                : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-800 dark:text-neutral-400 dark:hover:border-neutral-700 dark:hover:text-neutral-200'
            }`}
          >
            {VIEW_LABELS[id]}
          </Link>
        )
      })}
    </nav>
  )
}
