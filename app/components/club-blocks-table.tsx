import Link from 'next/link'

import {
  FixtureCell,
  ScoreBadge,
  scoreTone,
} from '@/app/components/fixture-visuals'
import { MAX_PLAYERS_PER_CLUB, type ClubBlock } from '@/lib/fpl/clubs'
import { horizonGameweeks, type Horizon } from '@/lib/fpl/fixtures'
import {
  buildHref,
  type CarriedState,
  nextClubSort,
  splitClubSort,
  type ClubSort,
  type ClubSortField,
} from '@/lib/fpl/params'

/**
 * View 4, Club Blocks (section 7.5). "Who should I buy?"
 *
 * Twenty club rows instead of fifteen player rows, which section 4 calls the
 * one deliberate exception to the row set: a squad-shaped table cannot answer
 * a question about players you do not own.
 *
 * Sorting is a URL parameter rather than component state, for the same reason
 * the horizon is: section 8.2 wants every control reflected in the URL, so a
 * sorted table is a link someone can send. That also keeps the whole view a
 * Server Component.
 */

/**
 * Below `sm` the score and owned columns are hidden and folded into the club
 * cell instead. Left as columns they take the whole width of a phone and no
 * fixtures are visible at all until you scroll, which defeats the point of the
 * view. Same trade as the Fixtures view makes with its summary column.
 */
const CLUB_COLUMN = 'w-[9.5rem] min-w-[9.5rem] sm:w-52 sm:min-w-52'
const SCORE_COLUMN = 'hidden sm:table-cell w-24 min-w-24'
const STRENGTH_COLUMN = 'hidden sm:table-cell w-28 min-w-28'
const OWNED_COLUMN = 'hidden sm:table-cell w-56 min-w-56'
/**
 * Gameweek columns are sized to the number on show, matching the Fixtures
 * view: a short horizon leaves room to breathe, a long one packs down so more
 * of the season stays on screen.
 */
function gameweekColumnWidth(count: number): string {
  if (count <= 6) return 'w-24 min-w-24'
  if (count <= 12) return 'w-[4.5rem] min-w-[4.5rem]'
  return 'w-[3.25rem] min-w-[3.25rem]'
}

export function ClubBlocksTable({
  blocks,
  managerId,
  horizon,
  startGameweek,
  sort,
  carry,
}: {
  blocks: ClubBlock[]
  managerId: string
  horizon: Horizon
  startGameweek: number
  sort: ClubSort
  /** Ownership population and view-as target, carried untouched (section 8.2). */
  carry: CarriedState
}) {
  // The horizon selects the columns, matching the Fixtures view: choosing five
  // gameweeks shows five columns, and the cells on screen are exactly the ones
  // the score is computed from. Must stay in step with `buildClubBlocks`,
  // which builds each row's fixtures over the same window.
  const columns = horizonGameweeks(startGameweek, horizon)
  const GW_COLUMN = gameweekColumnWidth(columns.length)
  const active = splitClubSort(sort)

  const sortHref = (field: ClubSortField) =>
    buildHref({
      id: managerId,
      view: 'clubs',
      horizon,
      sort: nextClubSort(field, sort),
      ...carry,
    })

  return (
    // `relative` for the same reason as the fixtures table: the absolutely
    // positioned sr-only labels in the cells would otherwise escape the scroll
    // container and stretch the whole document sideways.
    <div className="relative overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          All twenty clubs, ranked by Fixture Score over the next {horizon}{' '}
          gameweeks from gameweek {startGameweek}, with how many players you
          already own from each.
        </caption>

        <thead>
          <tr>
            <SortableHeader
              href={sortHref('club')}
              active={active.field === 'club'}
              descending={active.descending}
              className={`sticky left-0 z-20 text-left ${CLUB_COLUMN}`}
            >
              Club
            </SortableHeader>

            <SortableHeader
              href={sortHref('score')}
              active={active.field === 'score'}
              descending={active.descending}
              align="right"
              className={`text-right ${SCORE_COLUMN}`}
            >
              {/* Section 6.4: labelled Fixture Score, never FDR. */}
              Fixture Score
            </SortableHeader>
            {/* Immediately right of Fixture Score, on the same 0 to 10 scale
                and the same bands, so the two read as a pair: how good the run
                is, and how good the club is. */}
            <SortableHeader
              href={sortHref('strength')}
              active={active.field === 'strength'}
              descending={active.descending}
              className={`text-right ${STRENGTH_COLUMN}`}
              title="How strong this club is right now, on the same 0 to 10 scale as Fixture Score. Always this app's figure — FPL publishes no form-aware strength, so this column does not change with the difficulty toggle"
            >
              Team Strength
              {/* Named so it is not read as an FPL figure while the toggle
                  says FPL. */}
              <span className="ml-1 font-normal text-neutral-400 dark:text-neutral-500">
                (ours)
              </span>
            </SortableHeader>

            <SortableHeader
              href={sortHref('owned')}
              active={active.field === 'owned'}
              descending={active.descending}
              className={`text-left ${OWNED_COLUMN}`}
            >
              Owned
            </SortableHeader>

            {columns.map((gameweek) => (
              <th
                key={gameweek}
                scope="col"
                className={`border-b border-neutral-200 bg-neutral-50 px-1 py-2 text-center text-xs font-medium tabular-nums text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${GW_COLUMN}`}
              >
                <span className="sr-only">Gameweek </span>
                <span aria-hidden>GW</span>
                {gameweek}
              </th>
            ))}
            {/* Absorbs leftover width so a short horizon does not stretch the
                real columns across the page. Collapses to nothing once the
                table is wider than its container. */}
            <th
              aria-hidden
              className="w-auto border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800"
            />
          </tr>
        </thead>

        <tbody>
          {blocks.map((block) => (
            <ClubRow
              key={block.teamId}
              block={block}
              gameweekCount={columns.length}
              gwColumn={GW_COLUMN}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ClubRow({
  block,
  gameweekCount,
  gwColumn,
}: {
  block: ClubBlock
  gameweekCount: number
  gwColumn: string
}) {
  const owned = block.owned.length
  const atLimit = owned >= MAX_PLAYERS_PER_CLUB

  // Sticky cells sit above the scrolling ones, so they need an opaque
  // background of their own rather than inheriting the row's.
  const rowBackground = 'bg-white dark:bg-neutral-900'

  return (
    <tr>
      <th
        scope="row"
        className={`sticky left-0 z-10 border-b border-neutral-100 px-3 py-1.5 text-left font-normal dark:border-neutral-800/70 ${rowBackground} ${CLUB_COLUMN}`}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {block.name}
          </span>
          <span className="shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
            {block.shortName}
          </span>
        </span>
        {/* Below sm the score and owned columns are hidden, so they ride
            along here instead. Names are dropped at this width; the count is
            what surfaces the three-per-club limit. */}
        <span className="mt-0.5 flex items-center gap-1.5 sm:hidden">
          <ScoreBadge summary={block.score} compact />
          <StrengthBadge value={block.teamStrength} compact />
          {owned > 0 && <OwnedBadge count={owned} atLimit={atLimit} />}
        </span>
      </th>

      <td
        className={`border-b border-neutral-100 px-2 py-1.5 text-right dark:border-neutral-800/70 ${rowBackground} ${SCORE_COLUMN}`}
      >
        <ScoreBadge summary={block.score} />
      </td>
      <td
        className={`border-b border-neutral-100 px-2 py-1.5 text-right dark:border-neutral-800/70 ${rowBackground} ${STRENGTH_COLUMN}`}
      >
        <StrengthBadge value={block.teamStrength} />
      </td>

      <td
        className={`border-b border-r border-neutral-200 px-2 py-1.5 dark:border-neutral-800 ${rowBackground} ${OWNED_COLUMN}`}
      >
        <OwnedCell owned={block.owned} atLimit={atLimit} />
      </td>

      {Array.from({ length: gameweekCount }, (_, index) => (
        // `h-px` is not a real height: a table cell always stretches to its
        // row. Declaring a definite one lets the shaded block inside resolve
        // `h-full` against the row instead of its own content height.
        <td
          key={index}
          className={`h-px border-b border-l border-neutral-100 p-0 dark:border-neutral-800/70 ${gwColumn}`}
        >
          <FixtureCell fixtures={block.fixtures[index] ?? []} />
        </td>
      ))}
      {/* Matches the spacer in the header. */}
      <td
        aria-hidden
        className={`w-auto border-b border-neutral-100 dark:border-neutral-800/70 ${rowBackground}`}
      />
    </tr>
  )
}

/**
 * How many of this club's players are already in the squad (section 7.5).
 *
 * The point is the three-per-club limit, so a club at the limit is called out
 * rather than left for the reader to count: at three, buying another means
 * selling one first, which changes what the Fixture Score is worth.
 */
function OwnedCell({
  owned,
  atLimit,
}: {
  owned: ClubBlock['owned']
  atLimit: boolean
}) {
  if (owned.length === 0) {
    return (
      <span className="text-xs text-neutral-400 dark:text-neutral-600">
        <span aria-hidden>&mdash;</span>
        <span className="sr-only">No players owned</span>
      </span>
    )
  }

  return (
    <span className="flex items-baseline gap-1.5">
      <OwnedBadge count={owned.length} atLimit={atLimit} />
      <span className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
        {owned.map((player) => player.name).join(', ')}
      </span>
    </span>
  )
}

/**
 * Team Strength on the same 0 to 10 scale and the same colour bands as the
 * Fixture Score beside it, so the pair reads as one thought: an easy run
 * against a weak side is a different proposition from an easy run against a
 * strong one.
 */
function StrengthBadge({
  value,
  compact = false,
}: {
  value: number
  compact?: boolean
}) {
  return (
    <span
      title={`Team Strength ${value.toFixed(1)} of 10`}
      className={`inline-flex items-baseline rounded px-1.5 py-0.5 tabular-nums ${
        compact ? 'text-[11px]' : 'text-sm'
      } ${scoreTone(value)}`}
    >
      <span className="font-semibold">{value.toFixed(1)}</span>
      <span className="sr-only"> team strength out of 10</span>
    </span>
  )
}

/** The count on its own, for the narrow layout where names do not fit. */
function OwnedBadge({ count, atLimit }: { count: number; atLimit: boolean }) {
  return (
    <span
      title={
        atLimit
          ? `At the limit of ${MAX_PLAYERS_PER_CLUB} players from one club`
          : undefined
      }
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
        atLimit
          ? 'bg-amber-200 text-amber-950 dark:bg-amber-700 dark:text-amber-50'
          : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
      }`}
    >
      {count}
      {atLimit && <span className="ml-1 font-normal">max</span>}
      <span className="sr-only"> of {MAX_PLAYERS_PER_CLUB} players owned</span>
    </span>
  )
}

/**
 * A column header that is also the link to sort by that column.
 *
 * `aria-sort` carries the current state, so the table announces how it is
 * ordered rather than leaving the arrow as the only signal.
 */
function SortableHeader({
  href,
  active,
  descending,
  align = 'left',
  className,
  title,
  children,
}: {
  href: string
  active: boolean
  descending: boolean
  align?: 'left' | 'right'
  className: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <th
      scope="col"
      title={title}
      aria-sort={active ? (descending ? 'descending' : 'ascending') : 'none'}
      className={`border-b border-neutral-200 bg-neutral-50 p-0 font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${className}`}
    >
      <Link
        href={href}
        scroll={false}
        className={`flex items-center gap-1 px-3 py-2 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
          align === 'right' ? 'justify-end' : 'justify-start'
        }`}
      >
        <span>{children}</span>
        <span
          aria-hidden
          className={
            active
              ? 'text-neutral-900 dark:text-neutral-100'
              : 'text-neutral-300 dark:text-neutral-600'
          }
        >
          {active && !descending ? '▴' : '▾'}
        </span>
      </Link>
    </th>
  )
}
