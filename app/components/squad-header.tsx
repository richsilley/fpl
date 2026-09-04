import { formatPoints, formatRank, formatTopPercent } from '@/lib/format'
import type { SquadManager } from '@/lib/fpl/squad'

/**
 * The section 7.1 header: manager name, team name, and the six figures that
 * place the squad.
 *
 * ## Two groups, not one row of six
 *
 * The figures answer two different questions — how did this gameweek go, and
 * where does the season stand — and each group carries the same three shapes:
 * points, rank, and that rank as a share of the field. Laid out as one row of
 * six they read as an undifferentiated strip of numbers and the two "Top %"
 * figures look like a mistake, because nothing says which is which.
 *
 * Grouped, the repetition becomes the point: the same three columns twice, so
 * the gameweek and the season can be compared straight down. The groups carry
 * no headings, as none are needed once the labels say GW and Overall; the
 * separation does the work.
 *
 * Every figure describes the gameweek shown rather than a live value, which is
 * why the gameweek is named in the points label.
 */
export function SquadHeader({
  manager,
  totalPlayers,
}: {
  manager: SquadManager
  /** Total FPL entries: the denominator for both top-percentage figures. */
  totalPlayers: number
}) {
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="min-w-0">
        <h2 className="truncate text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl dark:text-neutral-50">
          {manager.teamName}
        </h2>
        <p className="mt-0.5 truncate text-sm text-neutral-500 dark:text-neutral-400">
          {manager.managerName}
        </p>
      </div>

      {/* Two things separate the groups, because either alone was too weak to
          read as a boundary: a rule, and a gutter three times the gap between
          tiles inside a group. Proximity does most of the work — the eye
          groups the tight triplets before it notices the line — and the rule
          confirms it. Both have to turn with the layout, so the divider runs
          down the middle at desktop width and across the stack below it. */}
      <div className="flex shrink-0 flex-col gap-5 divide-y divide-neutral-300 sm:flex-row sm:gap-6 sm:divide-x sm:divide-y-0 dark:divide-neutral-700">
        <StatGroup
          label={`Gameweek ${manager.gameweek}`}
          stats={[
            {
              label: `GW${manager.gameweek} points`,
              value: formatPoints(manager.gameweekPoints),
            },
            { label: 'GW rank', value: formatRank(manager.gameweekRank) },
            {
              label: 'Top',
              value: formatTopPercent(manager.gameweekRank, totalPlayers),
            },
          ]}
        />
        <StatGroup
          label="Overall"
          stats={[
            {
              label: 'Overall points',
              value: formatPoints(manager.overallPoints),
            },
            { label: 'Overall rank', value: formatRank(manager.overallRank) },
            {
              label: 'Top',
              value: formatTopPercent(manager.overallRank, totalPlayers),
            },
          ]}
        />
      </div>
    </header>
  )
}

/**
 * One of the two groups.
 *
 * `label` is not rendered: the visible labels already say GW and Overall, and
 * a heading on top of them would be a third level of text for no extra
 * meaning. It is kept as the group's accessible name so a screen reader, which
 * cannot see the rule, still gets the grouping the layout expresses.
 */
function StatGroup({
  label,
  stats,
}: {
  label: string
  stats: { label: string; value: string }[]
}) {
  return (
    <dl
      aria-label={label}
      className="grid grid-cols-3 gap-2 pt-5 first:pt-0 sm:gap-2 sm:pl-6 sm:pt-0 sm:first:pl-0"
    >
      {stats.map((stat) => (
        <Stat key={stat.label} label={stat.label} value={stat.value} />
      ))}
    </dl>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-neutral-50 px-3 py-2 sm:min-w-[6.5rem] dark:bg-neutral-800/50">
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
        {value}
      </dd>
    </div>
  )
}
