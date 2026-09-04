import { availabilityOf, type Availability } from '@/lib/fpl/availability'
import type { Squad, SquadPlayer } from '@/lib/fpl/squad'
import { formatPoints, formatPrice, formatPriceChange } from '@/lib/format'

/**
 * View 2, Form (section 7.3). "Who is playing well, and who is at risk?"
 *
 * The same fifteen rows as every other view, with the columns section 7.3
 * lists: price and its two movements, returns, expected involvement, and
 * availability.
 *
 * No new data. Every column here comes from `bootstrap-static`, which is
 * already loaded, and every field is in the projection in section 5.3.
 */

const PLAYER_COLUMN = 'w-[9.5rem] min-w-[9.5rem] sm:w-52 sm:min-w-52'
const NUMERIC_COLUMN = 'w-[4.5rem] min-w-[4.5rem]'
const STATUS_COLUMN = 'w-28 min-w-28'
/** The news is prose, so it gets the leftover width rather than a fixed one. */
const NEWS_COLUMN = 'min-w-[14rem]'

export function FormTable({ squad }: { squad: Squad }) {
  return (
    // `relative` for the same reason as the other tables: the absolutely
    // positioned sr-only labels would otherwise escape the scroll container
    // and stretch the whole document sideways.
    <div className="relative overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          {squad.manager.teamName}: price, form, returns, expected involvement
          and availability for each of the fifteen players.
        </caption>

        <thead>
          <tr>
            <th
              scope="col"
              className={`sticky left-0 z-20 border-b border-r border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${PLAYER_COLUMN}`}
            >
              Player
            </th>

            <NumericHeader title="Current price">Price</NumericHeader>
            <NumericHeader title="Price change this gameweek, in millions">
              GW
            </NumericHeader>
            <NumericHeader title="Price change since the season started, in millions">
              Season
            </NumericHeader>

            <NumericHeader title="Form: average points over recent gameweeks">
              Form
            </NumericHeader>
            <NumericHeader title="Total points this season">Pts</NumericHeader>
            <NumericHeader title="Points per game">PPG</NumericHeader>
            <NumericHeader title="Minutes played this season">
              Mins
            </NumericHeader>

            <NumericHeader title="Expected goals">xG</NumericHeader>
            <NumericHeader title="Expected assists">xA</NumericHeader>
            <NumericHeader title="Expected goal involvements">xGI</NumericHeader>

            <th
              scope="col"
              className={`border-b border-l border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${STATUS_COLUMN}`}
            >
              Status
            </th>
            <th
              scope="col"
              className={`border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${NEWS_COLUMN}`}
            >
              News
            </th>
          </tr>
        </thead>

        <tbody>
          {squad.startingXi.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}

          <tr>
            <th
              scope="colgroup"
              colSpan={13}
              className="sticky left-0 border-y border-neutral-200 bg-neutral-100 px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-400"
            >
              Bench
            </th>
          </tr>

          {squad.bench.map((player) => (
            <PlayerRow key={player.id} player={player} isBench />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerRow({
  player,
  isBench = false,
}: {
  player: SquadPlayer
  isBench?: boolean
}) {
  const availability = availabilityOf(player)

  // Sticky cells sit above the scrolling ones, so they need their own opaque
  // background rather than inheriting the row's.
  const rowBackground = isBench
    ? 'bg-neutral-50 dark:bg-neutral-900/60'
    : 'bg-white dark:bg-neutral-900'

  return (
    <tr>
      <th
        scope="row"
        className={`sticky left-0 z-10 border-b border-r border-neutral-200 px-3 py-1.5 text-left font-normal dark:border-neutral-800 ${rowBackground} ${PLAYER_COLUMN}`}
      >
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {player.name}
          </span>
          <span className="shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
            {player.club}
          </span>
          {/* Section 7.3 wants availability visually obvious. The Status
              column is eleven columns to the right and scrolled off screen on
              a phone, so the flag rides in the frozen column where it is
              always in view. */}
          <AvailabilityFlag availability={availability} />
        </span>
      </th>

      <NumericCell background={rowBackground}>
        {formatPrice(player.price)}
      </NumericCell>
      <PriceChangeCell change={player.priceChangeEvent} background={rowBackground} />
      <PriceChangeCell change={player.priceChangeStart} background={rowBackground} />

      <NumericCell background={rowBackground}>{player.form}</NumericCell>
      <NumericCell background={rowBackground}>
        {formatPoints(player.totalPoints)}
      </NumericCell>
      <NumericCell background={rowBackground}>
        {player.pointsPerGame}
      </NumericCell>
      <NumericCell background={rowBackground}>
        {formatPoints(player.minutes)}
      </NumericCell>

      <NumericCell background={rowBackground}>
        {player.expectedGoals}
      </NumericCell>
      <NumericCell background={rowBackground}>
        {player.expectedAssists}
      </NumericCell>
      <NumericCell background={rowBackground}>
        {player.expectedGoalInvolvements}
      </NumericCell>

      <td
        className={`border-b border-l border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${STATUS_COLUMN}`}
      >
        <StatusLabel availability={availability} />
      </td>
      <td
        className={`border-b border-neutral-100 px-3 py-1.5 text-neutral-600 dark:border-neutral-800/70 dark:text-neutral-400 ${rowBackground} ${NEWS_COLUMN}`}
      >
        {player.news ? (
          <span className="text-xs">{player.news}</span>
        ) : (
          <span className="text-xs text-neutral-300 dark:text-neutral-600">
            <span aria-hidden>—</span>
            <span className="sr-only">No news</span>
          </span>
        )}
      </td>
    </tr>
  )
}

function NumericHeader({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <th
      scope="col"
      title={title}
      className={`border-b border-l border-neutral-100 bg-neutral-50 px-2 py-2 text-right font-medium text-neutral-600 dark:border-neutral-800/70 dark:bg-neutral-800 dark:text-neutral-300 ${NUMERIC_COLUMN}`}
    >
      {children}
    </th>
  )
}

function NumericCell({
  children,
  background,
}: {
  children: React.ReactNode
  background: string
}) {
  return (
    <td
      className={`border-b border-l border-neutral-100 px-2 py-1.5 text-right tabular-nums text-neutral-700 dark:border-neutral-800/70 dark:text-neutral-300 ${background} ${NUMERIC_COLUMN}`}
    >
      {children}
    </td>
  )
}

/**
 * A price movement, coloured by direction.
 *
 * Consistent with section 6.4's rule that green means good: a rise is good for
 * the owner, since it lifts team value. No change is left grey so the eye goes
 * to the movements.
 */
function PriceChangeCell({
  change,
  background,
}: {
  change: number
  background: string
}) {
  const tone =
    change > 0
      ? 'text-emerald-700 dark:text-emerald-400'
      : change < 0
        ? 'text-rose-700 dark:text-rose-400'
        : 'text-neutral-300 dark:text-neutral-600'

  return (
    <td
      className={`border-b border-l border-neutral-100 px-2 py-1.5 text-right tabular-nums dark:border-neutral-800/70 ${background} ${NUMERIC_COLUMN} ${tone}`}
    >
      {formatPriceChange(change)}
    </td>
  )
}

/**
 * Section 7.3: "Red for out, amber for doubtful with the percentage chance
 * shown, no flag for available."
 *
 * Colour is not the only signal. The flag carries text too, so it survives
 * greyscale and colour blindness, and the full reason is in the title and the
 * News column.
 */
function AvailabilityFlag({ availability }: { availability: Availability }) {
  if (availability.level === 'available') {
    return null
  }

  const doubtful = availability.level === 'doubtful'

  return (
    <span
      title={availability.label}
      className={`inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[10px] font-semibold uppercase leading-none tabular-nums ${
        doubtful
          ? 'bg-amber-200 text-amber-950 dark:bg-amber-600 dark:text-amber-50'
          : 'bg-rose-200 text-rose-950 dark:bg-rose-700 dark:text-rose-50'
      }`}
    >
      {availability.flag}
      <span className="sr-only"> — {availability.label}</span>
    </span>
  )
}

function StatusLabel({ availability }: { availability: Availability }) {
  if (availability.level === 'available') {
    return (
      <span className="text-xs text-neutral-400 dark:text-neutral-500">
        Available
      </span>
    )
  }

  const doubtful = availability.level === 'doubtful'

  return (
    <span
      className={`text-xs font-medium ${
        doubtful
          ? 'text-amber-800 dark:text-amber-300'
          : 'text-rose-800 dark:text-rose-300'
      }`}
    >
      {availability.label}
      {doubtful && availability.chance !== null && (
        <span className="tabular-nums"> {availability.chance}%</span>
      )}
    </span>
  )
}
