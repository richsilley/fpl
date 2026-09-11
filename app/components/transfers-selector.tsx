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
 * How many transfers the reader has (section 7.9).
 *
 * It is the one input that changes the shape of the answer rather than its
 * ordering: one transfer is a different plan from three, not the same plan
 * ranked differently.
 *
 * **Styled exactly as the horizon control**, down to the label weight and the
 * button padding. It used to be a bordered box in a larger, heavier type, on
 * the argument that the shape-changing control should look like the loudest
 * one. In place, it read as a separate panel that had drifted into the control
 * strip rather than as the third of three settings, and it drew the eye away
 * from the suggestions underneath. The three controls are one strip; keep them
 * looking like it.
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        id="transfers-label"
        className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        You have
      </span>
      <span
        role="group"
        aria-labelledby="transfers-label"
        className="inline-flex rounded-md border border-neutral-300 p-0.5 dark:border-neutral-700"
      >
        {Array.from({ length: MAX_TRANSFERS }, (_, index) => index + 1).map(
          (value) => (
            <Link
              key={value}
              href={href(value)}
              aria-current={value === transfers ? 'true' : undefined}
              scroll={false}
              className={`rounded px-2.5 py-1 text-sm font-medium tabular-nums transition-colors ${
                value === transfers
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
              }`}
            >
              {value}
            </Link>
          )
        )}
      </span>
      {/* "transfer(s)", not a pluralised word. The label sits beside a number
          the reader is about to change, and a word that rewrites itself on
          every click draws the eye away from the number that moved. */}
      <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
        transfer(s)
      </span>
    </div>
  )
}
