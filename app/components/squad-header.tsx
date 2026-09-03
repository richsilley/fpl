import { formatPoints, formatRank } from '@/lib/format'
import type { SquadManager } from '@/lib/fpl/squad'

/**
 * The section 7.1 header: manager name, team name, overall rank and gameweek
 * points.
 *
 * Rank and points are for the gameweek on screen, not live values, so the
 * gameweek is labelled on both to make that unambiguous.
 */
export function SquadHeader({ manager }: { manager: SquadManager }) {
  return (
    <header className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900 sm:p-5">
      <h2 className="text-xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50 sm:text-2xl">
        {manager.teamName}
      </h2>
      <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
        {manager.managerName}
      </p>

      {/*
        Section 7.1 asks for four things, and the gameweek is carried in the
        points label rather than given a tile of its own, which would repeat
        it and leave an odd cell empty in the two-column layout.
      */}
      <dl className="mt-4 grid grid-cols-2 gap-3">
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
    <div className="rounded-md bg-neutral-50 px-3 py-2 dark:bg-neutral-800/50">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
        {value}
      </dd>
    </div>
  )
}
