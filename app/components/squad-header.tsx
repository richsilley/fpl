import { formatPoints, formatRank } from '@/lib/format'
import type { SquadManager } from '@/lib/fpl/squad'

/**
 * The section 7.1 header: manager name, team name, overall rank and gameweek
 * points.
 *
 * Rank and points are for the gameweek shown, not live values, so the gameweek
 * is named in the points label to make that unambiguous.
 *
 * Narrow layout stacks the identity above the stats. From `sm` the two sit on
 * one line with the stats pushed right, so the card still reads as one bar at
 * desktop width rather than leaving a long empty gutter.
 */
export function SquadHeader({ manager }: { manager: SquadManager }) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
          {manager.teamName}
        </h2>
        <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
          {manager.managerName}
        </p>
      </div>

      <dl className="grid shrink-0 grid-cols-2 gap-3 sm:flex sm:gap-4">
        <Stat label="Overall rank" value={formatRank(manager.overallRank)} />
        <Stat
          label={`GW${manager.gameweek} points`}
          value={formatPoints(manager.gameweekPoints)}
        />
      </dl>
    </header>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-800/50 sm:min-w-[8.5rem]">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
        {value}
      </dd>
    </div>
  )
}
