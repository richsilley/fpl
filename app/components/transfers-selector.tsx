import Link from 'next/link'

import type { Horizon } from '@/lib/fpl/horizon'
import { buildHref, type CarriedState, type ViewId } from '@/lib/fpl/params'

/** FPL banks at most five. Beyond that the control would offer a fiction. */
export const MAX_TRANSFERS = 5
export const DEFAULT_TRANSFERS = 1

export function parseTransfers(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TRANSFERS
  }
  return Math.min(MAX_TRANSFERS, Math.max(1, parsed))
}

/**
 * How many transfers the reader has (section 7.9). The primary control.
 *
 * It is the one input that changes the shape of the answer rather than its
 * ordering: one transfer is a different plan from three, not the same plan
 * ranked differently. Everything else — horizon, scope — adjusts a ranking,
 * which is why they sit behind the Advanced disclosure and this does not.
 *
 * FPL does not publish a manager's free transfer count anywhere (see
 * `chips.ts`), so this is asked rather than derived. A number inferred from
 * transfer history breaks around wildcard and free hit weeks, and being wrong
 * about the reader's budget would invalidate every package below it.
 */
export function TransfersSelector({
  managerId,
  transfers,
  view,
  horizon,
  sort,
  carry,
}: {
  managerId: string
  transfers: number
  view: ViewId
  horizon: Horizon
  sort: string | null
  carry: CarriedState
}) {
  const href = (value: number) =>
    buildHref({
      ...carry,
      id: managerId,
      view,
      horizon,
      sort,
      transfers: value,
    })

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-neutral-300 px-4 py-3 dark:border-neutral-700">
      <span
        id="transfers-label"
        className="text-base font-semibold text-neutral-900 dark:text-neutral-50"
      >
        You have
      </span>
      <span
        role="group"
        aria-labelledby="transfers-label"
        className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700"
      >
        {Array.from({ length: MAX_TRANSFERS }, (_, index) => index + 1).map(
          (value) => (
            <Link
              key={value}
              href={href(value)}
              aria-current={value === transfers ? 'true' : undefined}
              scroll={false}
              className={`px-3.5 py-1.5 text-base font-semibold tabular-nums transition-colors ${
                value === transfers
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {value}
            </Link>
          )
        )}
      </span>
      <span className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
        transfer{transfers === 1 ? '' : 's'}
      </span>
    </div>
  )
}

/**
 * Horizon and scope, folded away.
 *
 * Section 7.9: difficulty times risk times horizon was over fifty combinations
 * that barely changed the output. Difficulty is now fixed to Form — the gate
 * model reads fixtures through the projection, and offering three ratings for
 * a number the reader never sees was a control over nothing. Risk is gone
 * entirely; see the note in `page.tsx`.
 *
 * A `<details>` element rather than client state: it is a disclosure, the
 * browser has one, and it costs no JavaScript.
 */
export function AdvancedControls({ children }: { children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-neutral-200 px-4 py-2 dark:border-neutral-800">
      <summary className="cursor-pointer text-sm text-neutral-600 marker:text-neutral-400 dark:text-neutral-400">
        Advanced
      </summary>
      <div className="flex flex-col gap-3 pb-2 pt-3 sm:flex-row sm:items-end sm:gap-6">
        {children}
      </div>
    </details>
  )
}
