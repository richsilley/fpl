import Link from 'next/link'

import { formatPoints, formatRank, formatTopPercent } from '@/lib/format'
import type { SquadManager } from '@/lib/fpl/squad'

/**
 * The section 7.1 header, and the app's one permanent bar.
 *
 * ## It is sticky, and it carries the menu
 *
 * Whose squad you are looking at is the one fact every view depends on, so it
 * stays on screen while the table scrolls under it, and the way into the menu
 * travels with it. Everything else that used to crowd the top of the page —
 * the manager ID form, the view-as picker — now lives in that menu, which is
 * what lets the four views be the most prominent thing below.
 *
 * ## Two groups of figures, not one row of six
 *
 * They answer two different questions, and each group carries the same three
 * shapes: points, rank, and that rank as a share of the field. Laid out as one
 * row of six they read as an undifferentiated strip and the two "Top %" values
 * look like a mistake. Grouped, the repetition becomes the point: the same
 * three columns twice, comparable straight down.
 *
 * On a phone the tiles would eat a third of the screen while stuck to the top,
 * so they collapse to a single line of text there. The identity and the menu,
 * which is what the bar is really for, stay at every width.
 *
 * ## Viewing someone else's squad
 *
 * The whole bar turns amber and the way back appears beside the team name.
 * That belongs here rather than in the menu: it is a statement about what you
 * are looking at, so it should sit with the name of what you are looking at,
 * and it must be reachable without opening anything.
 */
export function SquadHeader({
  manager,
  totalPlayers,
  menuHref,
  viewingAs,
  backHref,
}: {
  manager: SquadManager
  /** Total FPL entries: the denominator for both top-percentage figures. */
  totalPlayers: number
  menuHref: string
  /** True when this is a borrowed squad rather than the reader's own. */
  viewingAs: boolean
  backHref: string
}) {
  const stats = [
    {
      label: `GW${manager.gameweek} points`,
      short: `GW${manager.gameweek}`,
      value: formatPoints(manager.gameweekPoints),
    },
    {
      label: 'GW rank',
      short: 'GW rank',
      value: formatRank(manager.gameweekRank),
    },
    {
      label: 'Top',
      short: 'Top',
      value: formatTopPercent(manager.gameweekRank, totalPlayers),
    },
  ]
  const overall = [
    {
      label: 'Overall points',
      short: 'Points',
      value: formatPoints(manager.overallPoints),
    },
    {
      label: 'Overall rank',
      short: 'Rank',
      value: formatRank(manager.overallRank),
    },
    {
      label: 'Top',
      short: 'Top',
      value: formatTopPercent(manager.overallRank, totalPlayers),
    },
  ]

  return (
    <header
      className={`border-b px-5 py-2.5 backdrop-blur sm:px-8 sm:py-3 lg:px-12 ${
        viewingAs
          ? 'border-amber-400 bg-amber-50/95 dark:border-amber-700 dark:bg-amber-950/85'
          : 'border-neutral-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-900/90'
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2">
        <MenuButton href={menuHref} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-lg font-semibold tracking-tight text-neutral-900 sm:text-xl dark:text-neutral-50">
              {manager.teamName}
            </h2>
            <span className="truncate text-sm text-neutral-500 dark:text-neutral-400">
              {manager.managerName}
            </span>
            {viewingAs && (
              <Link
                href={backHref}
                scroll={false}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
              >
                <span aria-hidden>&larr;</span>
                Back to my team
              </Link>
            )}
          </div>

          {/* The phone-sized substitute for the tiles. */}
          <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs tabular-nums text-neutral-500 sm:hidden dark:text-neutral-400">
            {[...stats, ...overall].map((stat, index) => (
              // Keyed by position: both groups carry a figure labelled "Top".
              <span key={`${stat.label}-${index}`}>
                {stat.short}{' '}
                <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                  {stat.value}
                </span>
              </span>
            ))}
          </p>
        </div>

        {/* Two devices separate the groups, because either alone was too weak
            to read as a boundary: a rule, and a gutter several times the gap
            between tiles inside a group. */}
        <div className="hidden shrink-0 gap-4 divide-x divide-neutral-300 sm:flex dark:divide-neutral-700">
          <StatGroup label={`Gameweek ${manager.gameweek}`} stats={stats} />
          <StatGroup label="Overall" stats={overall} />
        </div>
      </div>
    </header>
  )
}

/**
 * The way into the menu, which holds the manager ID form and the view-as
 * picker. Always beside the team name, so it travels with the sticky bar.
 */
function MenuButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-label="Open menu"
      className="inline-flex shrink-0 items-center gap-2 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      <span aria-hidden className="flex flex-col gap-[3px]">
        <span className="block h-[2px] w-4 bg-current" />
        <span className="block h-[2px] w-4 bg-current" />
        <span className="block h-[2px] w-4 bg-current" />
      </span>
      <span className="hidden sm:inline">Menu</span>
    </Link>
  )
}

/**
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
    <dl aria-label={label} className="grid grid-cols-3 gap-2 pl-4 first:pl-0">
      {stats.map((stat) => (
        <div key={stat.label} className="min-w-[5.5rem] px-1">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            {stat.label}
          </dt>
          <dd className="text-base font-semibold tabular-nums text-neutral-900 dark:text-neutral-50">
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
