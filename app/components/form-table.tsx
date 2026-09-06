import Link from 'next/link'

import {
  MATRIX_HEADER_HEIGHT,
  MATRIX_PLAYER_COLUMN,
  MATRIX_ROW_HEIGHT,
} from '@/app/components/table-metrics'
import { overLimitAccent, PlayerName } from '@/app/components/player-cell'
import { availabilityOf, type Availability } from '@/lib/fpl/availability'
import { defconRatio, defconThreshold, formatDefcon } from '@/lib/fpl/defcon'
import type { Horizon } from '@/lib/fpl/horizon'
import {
  buildHref,
  type CarriedState,
  nextFormSort,
  splitFormSort,
  type FormSort,
  type FormSortField,
} from '@/lib/fpl/params'
import type { Squad, SquadPlayer } from '@/lib/fpl/squad'
import { formatPoints, formatPrice, formatPriceChange } from '@/lib/format'

/**
 * View 2, Form (section 7.3). "Who is playing well, and who is at risk?"
 *
 * ## Reading order
 *
 * The columns section 7.3 lists are all numbers, and presented flat they read
 * as a wall of them. Three devices give the table a hierarchy without adding
 * any data:
 *
 * 1. **The price block** is three columns that belong together, separated from
 *    the performance columns by a rule, with movement coloured by direction
 *    and no-change left blank so the eye lands only on what moved.
 * 2. **Data bars** behind exactly three columns, so the shape of the squad is
 *    readable at a glance without reading a single number.
 * 3. **Availability is a dot and a tinted row**, not two more columns of text.
 *    In a normal week nothing is flagged and the table is quieter for it.
 */

/**
 * Widths are deliberately uneven.
 *
 * The plain numeric columns are sized to their contents and no more, because
 * padding between bare numbers is just distance the eye has to travel. The
 * three bar columns are wider, because there the space *is* the data: a bar
 * needs room to be read as a length rather than a stub.
 */
const PLAYER_COLUMN = MATRIX_PLAYER_COLUMN
const PRICE_COLUMN = 'w-16 min-w-16'
const TIGHT_COLUMN = 'w-12 min-w-12'
const SEASON_COLUMN = 'w-[4.75rem] min-w-[4.75rem]'
// Wider than they were: a bar needs room before a high value and a low one
// look different at a glance, which is the only reason the bars exist.
const BAR_COLUMN = 'w-28 min-w-28'
/** Sized to its own header, which is wider than the number under it. */
const XP_COLUMN = 'w-[4.75rem] min-w-[4.75rem]'

export function FormTable({
  squad,
  managerId,
  sort,
  horizon,
  carry,
  swapHref,
  overLimitTeamIds,
  matchesPlayed,
}: {
  squad: Squad
  managerId: string
  sort: FormSort
  horizon: Horizon
  /** Ownership population and view-as target, carried untouched (section 8.2). */
  carry: CarriedState
  /** Opens the replacement panel for a player (section 7.7). Null disables it. */
  swapHref: ((playerId: number) => string) | null
  /** Clubs over the three-per-club limit, for the row accent (section 7.7). */
  overLimitTeamIds: Set<number>
  /** Completed matches per club, the denominator for average minutes (7.3). */
  matchesPlayed: Map<number, number>
}) {
  const all = [...squad.startingXi, ...squad.bench]
  const scales = barScales(all)
  const active = splitFormSort(sort)

  const sortHref = (field: FormSortField) =>
    buildHref({
      id: managerId,
      view: 'form',
      horizon,
      sort: nextFormSort(field, sort),
      ...carry,
    })

  // Sorting happens inside each group, so the starting XI and the bench stay
  // separated whatever the order. The split is structural (section 7.1), not
  // just a default ordering to be thrown away on the first click.
  const startingXi = sortPlayers(squad.startingXi, sort)
  const bench = sortPlayers(squad.bench, sort)

  return (
    <div className="relative overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          {squad.manager.teamName}: price, form, returns and availability for
          each of the fifteen players.
        </caption>

        <thead>
          <tr className={MATRIX_HEADER_HEIGHT}>
            {/* Section 7.3 requires a way back to squad order. Clicking a
                sorted column only ever flips its direction, so this is it, and
                it says so explicitly whenever a sort is applied rather than
                relying on the reader guessing that the Player header resets. */}
            <SortableHeader
              href={sortHref('squad')}
              active={active.field === 'squad'}
              descending={false}
              sortable={false}
              align="left"
              className={`sticky left-0 z-20 border-r ${PLAYER_COLUMN}`}
              title="Back to squad order: starting XI, then bench"
            >
              Player
              {active.field !== 'squad' && (
                <span className="ml-1.5 font-normal text-neutral-500 dark:text-neutral-400">
                  <span aria-hidden>&#8634;</span> squad order
                </span>
              )}
            </SortableHeader>

            {/* Price block */}
            <SortableHeader
              href={sortHref('price')}
              active={active.field === 'price'}
              descending={active.descending}
              className={PRICE_COLUMN}
              title="Current price"
            >
              Price
            </SortableHeader>
            <SortableHeader
              href={sortHref('gw')}
              active={active.field === 'gw'}
              descending={active.descending}
              className={TIGHT_COLUMN}
              title="Price change this gameweek, in millions"
            >
              GW
            </SortableHeader>
            <SortableHeader
              href={sortHref('season')}
              active={active.field === 'season'}
              descending={active.descending}
              className={`border-r ${SEASON_COLUMN}`}
              title="Price change since the season started, in millions"
            >
              Season
            </SortableHeader>

            {/* Returns: plain numbers, no bars, so kept tight */}
            <SortableHeader
              href={sortHref('points')}
              active={active.field === 'points'}
              descending={active.descending}
              className={TIGHT_COLUMN}
              title="Total points this season"
            >
              Pts
            </SortableHeader>
            <SortableHeader
              href={sortHref('ppg')}
              active={active.field === 'ppg'}
              descending={active.descending}
              className={TIGHT_COLUMN}
              title="Points per game"
            >
              PPG
            </SortableHeader>
            {/* Beside the returns it summarises, and before the bars: it is
                somebody else's conclusion about the columns to its left. */}
            <SortableHeader
              href={sortHref('xp')}
              active={active.field === 'xp'}
              descending={active.descending}
              className={`border-r ${XP_COLUMN}`}
              title="FPL's own expected points for the next gameweek. Their model, not this app's"
            >
              xP
            </SortableHeader>

            {/* The three bar columns, grouped so the only wide columns in the
                table sit together rather than being interleaved with tight
                ones. */}
            <SortableHeader
              href={sortHref('form')}
              active={active.field === 'form'}
              descending={active.descending}
              className={BAR_COLUMN}
              title="Form: average points over recent gameweeks"
            >
              Form
            </SortableHeader>
            <SortableHeader
              href={sortHref('mins')}
              active={active.field === 'mins'}
              descending={active.descending}
              className={BAR_COLUMN}
              title="Average minutes per match their club has played, against the 90 available"
            >
              Mins
            </SortableHeader>
            <SortableHeader
              href={sortHref('xgi')}
              active={active.field === 'xgi'}
              descending={active.descending}
              className={BAR_COLUMN}
              title="Expected goal involvements"
            >
              xGI
            </SortableHeader>
            <SortableHeader
              href={sortHref('defcon')}
              active={active.field === 'defcon'}
              descending={active.descending}
              className={BAR_COLUMN}
              title="Defensive contributions per 90 minutes, against the threshold for the player's position: 10 for a defender, 12 for a midfielder or forward"
            >
              DefCon
            </SortableHeader>

            {/* Absorbs the leftover width, exactly as the Fixtures table does.
                The table is `w-full` so that it starts and ends where Fixtures
                does and switching views does not shift it, but without this the
                spare width is shared out among the real columns and the slim
                numeric ones stop being slim. */}
            <th
              aria-hidden
              className="w-auto border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800"
            />
          </tr>
        </thead>

        <tbody>
          {startingXi.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              scales={scales}
              matchesPlayed={matchesPlayed.get(player.teamId) ?? 0}
              swapHref={swapHref}
              overLimitTeamIds={overLimitTeamIds}
            />
          ))}

          <tr>
            <th
              scope="colgroup"
              colSpan={12}
              className="sticky left-0 border-y border-neutral-200 bg-neutral-100 px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-400"
            >
              Bench
            </th>
          </tr>

          {bench.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              scales={scales}
              matchesPlayed={matchesPlayed.get(player.teamId) ?? 0}
              swapHref={swapHref}
              overLimitTeamIds={overLimitTeamIds}
              isBench
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The denominators the bars are drawn against.
 *
 * Form and xGI are relative to the best in this squad, because the question
 * they answer is comparative. Minutes are not here at all: they are measured
 * per match against the 90 available, which makes that bar a reliability
 * reading rather than a comparison — a player who plays every minute is
 * always full, whoever else is in the squad.
 */
type BarScales = { maxForm: number; maxXgi: number }

/** Minutes in a match: what the Mins bar is measured against. */
export const MINUTES_IN_A_MATCH = 90

function barScales(players: SquadPlayer[]): BarScales {
  return {
    maxForm: Math.max(...players.map((p) => Number(p.form) || 0), 0),
    maxXgi: Math.max(
      ...players.map((p) => Number(p.expectedGoalInvolvements) || 0),
      0
    ),
  }
}

function sortValue(player: SquadPlayer, field: FormSortField): number {
  switch (field) {
    case 'price':
      return player.price
    case 'gw':
      return player.priceChangeEvent
    case 'season':
      return player.priceChangeStart
    case 'form':
      return Number(player.form) || 0
    case 'points':
      return player.totalPoints
    case 'ppg':
      return Number(player.pointsPerGame) || 0
    case 'mins':
      return player.minutes
    case 'xgi':
      return Number(player.expectedGoalInvolvements) || 0
    case 'defcon':
      return player.defensiveContributionPer90
    case 'xp':
      return player.expectedPointsNext
    default:
      return player.squadPosition
  }
}

function sortPlayers(players: SquadPlayer[], sort: FormSort): SquadPlayer[] {
  const { field, descending } = splitFormSort(sort)
  if (field === 'squad') {
    return [...players].sort((a, b) => a.squadPosition - b.squadPosition)
  }

  return [...players].sort((a, b) => {
    const difference = sortValue(a, field) - sortValue(b, field)
    // Ties fall back to squad order, so equal values keep a stable, meaningful
    // order rather than whatever the sort happens to do.
    return difference !== 0
      ? difference * (descending ? -1 : 1)
      : a.squadPosition - b.squadPosition
  })
}

function PlayerRow({
  player,
  scales,
  swapHref,
  overLimitTeamIds,
  matchesPlayed,
  isBench = false,
}: {
  player: SquadPlayer
  scales: BarScales
  matchesPlayed: number
  swapHref: ((playerId: number) => string) | null
  overLimitTeamIds: Set<number>
  isBench?: boolean
}) {
  const availability = availabilityOf(player)
  const isGoalkeeper = player.position === 'GKP'

  // Section 7.3: the row itself carries the flag, so an unavailable player is
  // visible from across the table rather than needing a column to be read.
  // Kept faint: it must not compete with the data bars.
  const rowBackground =
    availability.level === 'out'
      ? 'bg-rose-50 dark:bg-rose-950/30'
      : availability.level === 'doubtful'
        ? 'bg-amber-50 dark:bg-amber-950/25'
        : isBench
          ? 'bg-neutral-50 dark:bg-neutral-900/60'
          : 'bg-white dark:bg-neutral-900'

  const form = Number(player.form) || 0
  const xgi = Number(player.expectedGoalInvolvements) || 0
  const threshold = defconThreshold(player.position)
  // Section 7.3: a season total becomes abstract the moment clubs have played
  // different numbers of matches, which blanks and doubles guarantee. Per
  // match it stays comparable, and the bar is against the 90 available rather
  // than against the squad, so a full bar means every minute played.
  const minutesPerMatch =
    matchesPlayed === 0 ? 0 : player.minutes / matchesPlayed

  return (
    <tr className={MATRIX_ROW_HEIGHT}>
      <th
        scope="row"
        className={`sticky left-0 z-10 border-b border-r border-neutral-200 px-2 py-1 text-left font-normal dark:border-neutral-800 ${rowBackground} ${PLAYER_COLUMN} ${overLimitAccent(player.teamId, overLimitTeamIds)}`}
      >
        <span className="flex items-baseline gap-1.5">
          <PlayerName
            name={player.name}
            href={swapHref === null ? null : swapHref(player.id)}
          />
          <span className="shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
            {player.club}
          </span>
          <AvailabilityDot availability={availability} />
        </span>
        {/* Only rendered when there is news, so in a normal week this line does
            not exist and the rows stay compact. */}
        {player.news && (
          <span className="mt-0.5 block text-[11px] leading-tight text-neutral-500 dark:text-neutral-400">
            {player.news}
            {availability.chance !== null && ` (${availability.chance}%)`}
          </span>
        )}
      </th>

      <NumericCell background={rowBackground} width={PRICE_COLUMN}>
        {formatPrice(player.price)}
      </NumericCell>
      <PriceChangeCell
        change={player.priceChangeEvent}
        background={rowBackground}
        width={TIGHT_COLUMN}
      />
      <PriceChangeCell
        change={player.priceChangeStart}
        background={rowBackground}
        width={SEASON_COLUMN}
        edge
      />

      <NumericCell background={rowBackground} width={TIGHT_COLUMN}>
        {formatPoints(player.totalPoints)}
      </NumericCell>
      <NumericCell background={rowBackground} width={TIGHT_COLUMN}>
        {player.pointsPerGame}
      </NumericCell>
      <NumericCell background={rowBackground} width={XP_COLUMN} edge>
        {player.expectedPointsNext.toFixed(1)}
      </NumericCell>

      {/* The bar columns keep their numbers right-aligned. Centring them would
          set the number adrift from the end of its own bar, which is the one
          place in the table where the value has a length to sit against. */}
      <NumericCell
        background={rowBackground}
        width={BAR_COLUMN}
        align="right"
        bar={ratio(form, scales.maxForm)}
        barTone={BAR_TONE.form}
      >
        {player.form}
      </NumericCell>
      <NumericCell
        background={rowBackground}
        width={BAR_COLUMN}
        align="right"
        bar={ratio(minutesPerMatch, MINUTES_IN_A_MATCH)}
        barTone={BAR_TONE.mins}
      >
        {matchesPlayed === 0 ? <NotApplicable /> : Math.round(minutesPerMatch)}
      </NumericCell>
      <NumericCell
        background={rowBackground}
        width={BAR_COLUMN}
        align="right"
        bar={isGoalkeeper ? undefined : ratio(xgi, scales.maxXgi)}
        barTone={BAR_TONE.xgi}
      >
        {/* A goalkeeper's xGI is always 0.00, and a zero reads as a bad value
            rather than an irrelevant one. */}
        {isGoalkeeper ? <NotApplicable /> : player.expectedGoalInvolvements}
      </NumericCell>
      <NumericCell
        background={rowBackground}
        width={BAR_COLUMN}
        align="right"
        bar={
          defconRatio(player.defensiveContributionPer90, threshold) ?? undefined
        }
        barTone={BAR_TONE.defcon}
      >
        {/* Goalkeepers are outside the rule entirely, so a rate for them would
            be a number with nothing to measure it against. */}
        {threshold === null ? (
          <NotApplicable />
        ) : (
          formatDefcon(player.defensiveContributionPer90)
        )}
      </NumericCell>

      {/* Matches the spacer in the header. */}
      <td
        aria-hidden
        className={`w-auto border-b border-l border-neutral-100 dark:border-neutral-800/70 ${rowBackground}`}
      />
    </tr>
  )
}

/** A stat the rules do not apply to, which a zero would misrepresent. */
function NotApplicable() {
  return (
    <span
      title="Not applicable to goalkeepers"
      className="text-neutral-300 dark:text-neutral-600"
    >
      <span aria-hidden>—</span>
      <span className="sr-only">not applicable</span>
    </span>
  )
}

function ratio(value: number, max: number): number {
  if (max <= 0) {
    return 0
  }
  return Math.max(0, Math.min(1, value / max))
}

/**
 * A numeric cell, optionally with a bar behind the value.
 *
 * The bar is anchored right so it grows out from under its own number rather
 * than starting at the far edge of the cell, which keeps the two read as one
 * thing. It is a single muted tone, deliberately not a red-to-green scale:
 * these bars compare fifteen players in one squad, a narrow range, and a
 * strong scale would imply the lowest is bad in absolute terms.
 */
function NumericCell({
  children,
  background,
  width,
  bar,
  barTone,
  align = 'center',
  edge = false,
  edgeLeft = false,
}: {
  children: React.ReactNode
  background: string
  width: string
  bar?: number
  barTone?: string
  align?: 'center' | 'right'
  edge?: boolean
  /** A heavier rule on the left, separating a column from the group before it. */
  edgeLeft?: boolean
}) {
  return (
    <td
      className={`border-b border-l border-neutral-100 px-1.5 py-1 dark:border-neutral-800/70 ${
        edge ? 'border-r border-r-neutral-200 dark:border-r-neutral-800' : ''
      } ${
        edgeLeft ? 'border-l-neutral-200 dark:border-l-neutral-700' : ''
      } ${background} ${width}`}
    >
      <span
        className={`relative block tabular-nums ${
          align === 'right' ? 'text-right' : 'text-center'
        }`}
      >
        {bar !== undefined && bar > 0 && (
          // Anchored left, not right. Right-anchored, a short bar sits
          // entirely behind its own right-aligned number and vanishes, so the
          // smallest values, the ones worth spotting, showed nothing at all.
          // From the left every value has a visible length.
          <span
            aria-hidden
            className={`absolute inset-y-0 left-0 rounded-sm ${barTone}`}
            style={{ width: `${bar * 100}%` }}
          />
        )}
        <span className="relative px-1 text-neutral-800 dark:text-neutral-200">
          {children}
        </span>
      </span>
    </td>
  )
}

/**
 * One hue per bar column, so the three read as three columns rather than one
 * band of grey, and a row can be scanned across without losing which is which.
 *
 * Still muted, and still not a scale: the constraint that these must not imply
 * good or bad holds, so the hues avoid the three this app uses for meaning —
 * green is good, red is bad and amber is a doubt.
 *
 * They were too close to each other to tell apart, which defeated the point of
 * giving each column its own. These four are one step stronger and spread
 * around the wheel: blue, grey, purple, teal. Teal sits next to green, which
 * is safe here because DefCon is the one bar where a full length really does
 * mean good — clearing the threshold.
 */
const BAR_TONE = {
  form: 'bg-sky-400/55 dark:bg-sky-500/40',
  mins: 'bg-slate-400/45 dark:bg-slate-400/30',
  xgi: 'bg-violet-400/50 dark:bg-violet-500/40',
  defcon: 'bg-teal-400/55 dark:bg-teal-500/40',
} as const

/**
 * A price movement, coloured by direction.
 *
 * Consistent with section 6.4's rule that green means good: a rise lifts the
 * owner's team value. No change renders as nothing at all, so the column shows
 * only what actually moved.
 */
function PriceChangeCell({
  change,
  background,
  width,
  edge = false,
}: {
  change: number
  background: string
  width: string
  edge?: boolean
}) {
  const tone =
    change > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-rose-700 dark:text-rose-400'

  return (
    <td
      className={`border-b border-l border-neutral-100 px-1.5 py-1 text-center tabular-nums dark:border-neutral-800/70 ${
        edge ? 'border-r border-r-neutral-200 dark:border-r-neutral-800' : ''
      } ${background} ${width} ${change === 0 ? '' : tone}`}
    >
      {formatPriceChange(change)}
    </td>
  )
}

/**
 * Availability, immediately after the club, as a dot (section 7.3).
 *
 * It had a column of its own for a while. A column is more legible on a laptop
 * but costs a fixed slice of the width on a phone, where the frozen name cell
 * is already the widest thing on screen, and in a normal week every one of the
 * fifteen is green — a column's worth of space to say "nothing is wrong".
 *
 * A dot is small enough to sit inside the name cell and still be the only
 * coloured thing in it, which is what makes an exception findable. The reason
 * and the chance of playing are on the news line below the name, so nothing is
 * lost by shrinking the marker; colour alone never carries the meaning.
 */
function AvailabilityDot({ availability }: { availability: Availability }) {
  const tone =
    availability.level === 'available'
      ? 'bg-emerald-500'
      : availability.level === 'doubtful'
        ? 'bg-amber-500'
        : 'bg-rose-600'

  return (
    <span
      title={availability.label}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone}`}
    >
      <span className="sr-only">{availability.label}. </span>
    </span>
  )
}

function SortableHeader({
  href,
  active,
  descending,
  align = 'center',
  sortable = true,
  className,
  title,
  children,
}: {
  href: string
  active: boolean
  descending: boolean
  align?: 'left' | 'center'
  sortable?: boolean
  className: string
  title?: string
  children: React.ReactNode
}) {
  return (
    <th
      scope="col"
      title={title}
      aria-sort={!active ? 'none' : descending ? 'descending' : 'ascending'}
      className={`border-b border-neutral-200 bg-neutral-50 p-0 font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${className}`}
    >
      <Link
        href={href}
        scroll={false}
        className={`flex h-full items-center gap-0.5 px-1.5 py-1.5 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700 ${
          align === 'center' ? 'justify-center' : 'justify-start'
        }`}
      >
        <span>{children}</span>
        {sortable && (
          <span
            aria-hidden
            className={`text-[9px] ${
              active
                ? 'text-neutral-900 dark:text-neutral-100'
                : 'text-neutral-300 dark:text-neutral-600'
            }`}
          >
            {active && !descending ? '▴' : '▾'}
          </span>
        )}
      </Link>
    </th>
  )
}
