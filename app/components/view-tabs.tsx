import Link from 'next/link'

import { TabPending } from '@/app/components/tab-pending'

import {
  BUILT_VIEWS,
  buildHref,
  type CarriedState,
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
 * ## They are the loudest thing on the page, on purpose
 *
 * The whole app is four views over one squad, so choosing between them is the
 * primary act. As understated tabs they lost that fight to the manager ID form
 * and the view-as picker sitting above them; those have since moved into the
 * menu, and these have been given the weight the hierarchy always implied —
 * segmented buttons, larger text, the selected one filled rather than
 * underlined.
 *
 * ## They report being pressed
 *
 * Switching view is a server round trip, and until it returns the tabs cannot
 * know which of them is selected — that comes back with the response. Each
 * carries a `TabPending` child that reacts to the press itself, so the delay
 * reads as waiting rather than as a control that ignored you. This stays a
 * Server Component; only the indicator inside each link is client code.
 */
export function ViewTabs({
  managerId,
  view,
  horizon,
  sort,
  carry,
}: {
  managerId: string
  view: ViewId
  horizon: Horizon
  sort: string | null
  /** Carried through so leaving Ownership and returning keeps the population. */
  /** Ownership population and view-as target, carried untouched (section 8.2). */
  carry: CarriedState
}) {
  return (
    <nav
      aria-label="View"
      className="flex w-full gap-1 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-800/60"
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
              ...carry,
            })}
            aria-current={selected ? 'page' : undefined}
            scroll={false}
            className={`relative flex-1 whitespace-nowrap rounded-md px-3 py-2 text-center text-sm font-semibold transition-colors sm:text-base ${
              selected
                ? 'bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-50'
                : 'text-neutral-600 hover:bg-white/60 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900/50 dark:hover:text-neutral-50'
            }`}
          >
            {/* Behind the label, and out of the layout, so a pressed tab does
                not shift by a pixel. */}
            <TabPending />
            <span className="relative">{VIEW_LABELS[id]}</span>
          </Link>
        )
      })}
    </nav>
  )
}
