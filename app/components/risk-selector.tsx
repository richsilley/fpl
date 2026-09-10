import Link from 'next/link'

import type { Horizon } from '@/lib/fpl/horizon'
import {
  RISK_LABELS,
  RISK_LEVELS,
  type RiskLevel,
} from '@/lib/fpl/edge-strategy'
import { buildHref, type CarriedState, type ViewId } from '@/lib/fpl/params'

/**
 * Risk appetite for The Edge (section 7.9).
 *
 * Shaped like the difficulty selector, because it does the same kind of job:
 * three named options under one label, each a link so the choice is in the URL
 * and a shared link reproduces the ranking the sender saw.
 *
 * ## There is no Objective control beside it
 *
 * Whether the reader is defending a lead or chasing one is *derived* from
 * where they sit in the selected scope, which the app already computes for the
 * Ownership direction flag. Risk plus scope covers every combination with one
 * fewer control, and a control whose value can be derived is a control that
 * can be set to disagree with reality.
 */
export function RiskSelector({
  managerId,
  risk,
  view,
  horizon,
  sort,
  carry,
}: {
  managerId: string
  risk: RiskLevel
  view: ViewId
  horizon: Horizon
  sort: string | null
  carry: CarriedState
}) {
  const href = (value: RiskLevel) =>
    buildHref({ ...carry, id: managerId, view, horizon, sort, risk: value })

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        id="risk-label"
        className="text-sm text-neutral-500 dark:text-neutral-400"
      >
        Risk
      </span>
      <span
        role="group"
        aria-labelledby="risk-label"
        className="inline-flex overflow-hidden rounded-md border border-neutral-300 dark:border-neutral-700"
      >
        {RISK_LEVELS.map((level) => (
          <Link
            key={level}
            href={href(level)}
            aria-current={level === risk ? 'true' : undefined}
            scroll={false}
            title={RISK_TOOLTIPS[level]}
            className={`px-2.5 py-1 text-sm font-medium transition-colors ${
              level === risk
                ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            {RISK_LABELS[level]}
          </Link>
        ))}
      </span>
    </div>
  )
}

/**
 * Each says what the setting does, not what the word means. The direction it
 * leans in comes from the reader's position, so none of these can name a
 * direction without being wrong half the time.
 */
const RISK_TOOLTIPS: Record<RiskLevel, string> = {
  conservative:
    'Lean harder towards the safe side of your position: protect a lead, or close a gap steadily.',
  balanced: 'Rank mostly on projected points, with a light ownership tilt.',
  aggressive:
    'Take on variance against your rivals for a bigger swing, in either direction.',
}
