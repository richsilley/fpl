import {
  MATRIX_HEADER_HEIGHT,
  MATRIX_PLAYER_COLUMN,
  MATRIX_ROW_HEIGHT,
} from '@/app/components/table-metrics'
import {
  bandStrategyOrder,
  bandStrategyStep,
  ownershipBandOf,
  OWNERSHIP_BANDS,
  type BandStrategyStep,
  type FieldPosition,
  type OwnershipBandId,
} from '@/lib/fpl/ownership'
import type { OwnershipRow, ReferencePopulation } from '@/lib/fpl/reference'

/**
 * View 3, Ownership (section 7.4).
 *
 * "Is this player worth owning, given who else owns them and where I sit?"
 *
 * The rows come from `compareOwnership`, which is the same function for all
 * three populations. This renders them; it does not know how the population
 * was built, only how big it is and what it is called.
 *
 * ## The columns are fixed, not per mode
 *
 * Player, Global, League, Rival, Diff, Flag — always all six, in that order,
 * whichever population is selected. Only the cells that the selected mode can
 * fill carry a value; the rest are em dashes. Rendering three different column
 * sets meant the table reflowed on every mode switch, which made comparing two
 * populations a matter of re-finding the columns each time. A dash is also an
 * honest answer: it says this mode does not measure that, which is different
 * from measuring it as zero.
 *
 * ## The flag colour is relative to your position, not to the band
 *
 * The label carries the band and never changes. The colour carries whether
 * being in that band helps or hurts you *right now*, and reverses with the
 * direction flag. Section 7.4: ahead of the population a differential is a
 * risk and convergence protects the lead; behind, the reverse. So the same
 * Template chip is the best thing on the table when you are ahead and the
 * worst when you are behind.
 *
 * This is why the scale is diverging green-to-red with no amber in the middle:
 * the split between helping and hurting is the whole message and has to be
 * visible without reading a word. Two greens and two reds, never a gradient
 * through neutral.
 *
 * With no rank to read against there is no direction, so the chips stay grey.
 * Colouring them anyway would be inventing advice.
 */

const PLAYER_COLUMN = MATRIX_PLAYER_COLUMN
/** The one wide column: it carries a bar as well as a number. */
const GLOBAL_COLUMN = 'w-40 min-w-40'
const NUMERIC_COLUMN = 'w-20 min-w-20'
const BAND_COLUMN = 'w-32 min-w-32'

/** Player, Global, League, Rival, Diff, Flag, plus the trailing spacer. */
const COLUMN_COUNT = 7

export function OwnershipTable({
  rows,
  reference,
  teamName,
}: {
  rows: OwnershipRow[]
  reference: ReferencePopulation
  teamName: string
}) {
  const startingXi = rows.filter((row) => row.player.squadPosition <= 11)
  const bench = rows.filter((row) => row.player.squadPosition > 11)
  const position = reference.standing.position

  return (
    <div className="space-y-4">
      <DirectionFlag reference={reference} />

      {reference.notice && (
        <p
          role="status"
          className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          {reference.notice}
        </p>
      )}

      {/* `relative` for the same reason as the other tables: the absolutely
          positioned sr-only labels would otherwise escape the scroll container
          and stretch the whole document sideways. */}
      <div className="relative overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">
            {teamName}: how widely each of the fifteen players is owned, across
            all FPL managers and within {reference.label}.
          </caption>

          <thead>
            <tr className={MATRIX_HEADER_HEIGHT}>
              <HeaderCell
                className={`sticky left-0 z-20 border-r ${PLAYER_COLUMN}`}
                align="left"
              >
                Player
              </HeaderCell>
              <HeaderCell
                className={GLOBAL_COLUMN}
                align="left"
                title="Percentage of all FPL managers who own this player"
              >
                Global
              </HeaderCell>
              <HeaderCell
                className={NUMERIC_COLUMN}
                title={
                  reference.mode === 'league'
                    ? `Ownership within ${reference.label}`
                    : 'Ownership within the selected league. Select a league to fill this column'
                }
              >
                League
              </HeaderCell>
              <HeaderCell
                className={NUMERIC_COLUMN}
                title={
                  reference.mode === 'rival'
                    ? `Whether ${reference.label} owns this player`
                    : 'Whether the selected rival owns this player. Select a rival to fill this column'
                }
              >
                Rival
              </HeaderCell>
              <HeaderCell
                className={NUMERIC_COLUMN}
                title="Ownership in the selected population, minus global ownership"
              >
                Diff
              </HeaderCell>
              <HeaderCell className={BAND_COLUMN} align="left">
                Flag
              </HeaderCell>

              {/* Absorbs the leftover width, as in Fixtures and Form, so the
                  columns keep the widths set above instead of sharing out the
                  surplus. */}
              <th
                aria-hidden
                className="w-auto border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800"
              />
            </tr>
          </thead>

          <tbody>
            {startingXi.map((row) => (
              <PlayerRow
                key={row.player.id}
                row={row}
                reference={reference}
                position={position}
              />
            ))}

            <tr>
              <th
                scope="colgroup"
                colSpan={COLUMN_COUNT}
                className="sticky left-0 border-y border-neutral-200 bg-neutral-100 px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-400"
              >
                Bench
              </th>
            </tr>

            {bench.map((row) => (
              <PlayerRow
                key={row.player.id}
                row={row}
                reference={reference}
                position={position}
              />
            ))}
          </tbody>
        </table>
      </div>

      <BandKey position={position} />
    </div>
  )
}

function HeaderCell({
  children,
  className,
  align = 'center',
  title,
}: {
  children: React.ReactNode
  className: string
  align?: 'left' | 'center'
  title?: string
}) {
  return (
    <th
      scope="col"
      title={title}
      className={`border-b border-neutral-200 bg-neutral-50 px-3 py-2 font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${
        align === 'left' ? 'text-left' : 'text-center'
      } ${className}`}
    >
      {children}
    </th>
  )
}

function PlayerRow({
  row,
  reference,
  position,
}: {
  row: OwnershipRow
  reference: ReferencePopulation
  position: FieldPosition
}) {
  const band = ownershipBandOf(row.globalPercent)
  const isBench = row.player.squadPosition > 11

  const rowBackground = isBench
    ? 'bg-neutral-50 dark:bg-neutral-900/60'
    : 'bg-white dark:bg-neutral-900'

  const isLeague = reference.mode === 'league'
  const isRival = reference.mode === 'rival'

  return (
    <tr className={MATRIX_ROW_HEIGHT}>
      <th
        scope="row"
        className={`sticky left-0 z-10 border-b border-r border-neutral-200 px-3 py-1.5 text-left font-normal dark:border-neutral-800 ${rowBackground} ${PLAYER_COLUMN}`}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {row.player.name}
          </span>
          <span className="shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
            {row.player.club}
          </span>
        </span>
      </th>

      <td
        className={`border-b border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${GLOBAL_COLUMN}`}
      >
        <OwnershipBar percent={row.globalPercent} />
      </td>

      <DataCell background={rowBackground}>
        {isLeague ? `${row.referencePercent.toFixed(1)}%` : <NotMeasured />}
      </DataCell>

      <DataCell background={rowBackground}>
        {/* A population of one reads better as a yes or no than as 0% or 100%.
            The calculation is unchanged; only the wording is. */}
        {isRival ? (
          row.referencePercent > 0 ? (
            <span className="font-medium">Owns</span>
          ) : (
            <span className="text-neutral-400 dark:text-neutral-600">No</span>
          )
        ) : (
          <NotMeasured />
        )}
      </DataCell>

      <DataCell background={rowBackground}>
        {/* Global mode compares the population against itself, so the
            difference would be a column of zeroes rather than a measurement.
            See 7.4.1. */}
        {isLeague || isRival ? (
          <Difference value={row.difference} />
        ) : (
          <NotMeasured />
        )}
      </DataCell>

      <td
        className={`border-b border-l border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${BAND_COLUMN}`}
      >
        <BandChip id={band.id} label={band.label} position={position} />
      </td>

      {/* Matches the spacer in the header. */}
      <td
        aria-hidden
        className={`w-auto border-b border-l border-neutral-100 dark:border-neutral-800/70 ${rowBackground}`}
      />
    </tr>
  )
}

function DataCell({
  children,
  background,
}: {
  children: React.ReactNode
  background: string
}) {
  return (
    <td
      className={`border-b border-l border-neutral-100 px-2 py-1.5 text-center tabular-nums text-neutral-800 dark:border-neutral-800/70 dark:text-neutral-200 ${background} ${NUMERIC_COLUMN}`}
    >
      {children}
    </td>
  )
}

/**
 * A column this mode does not measure.
 *
 * Deliberately not a zero: "no rival selected" and "the rival does not own
 * them" are different answers and must not look alike.
 */
function NotMeasured() {
  return (
    <span className="text-neutral-300 dark:text-neutral-600">
      <span aria-hidden>—</span>
      <span className="sr-only">not measured in this mode</span>
    </span>
  )
}

/**
 * Reference minus global.
 *
 * Weight rather than colour: the sign says which way the population leans, and
 * whether leaning that way is good depends entirely on the direction flag,
 * which the Flag column already carries.
 */
function Difference({ value }: { value: number }) {
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) {
    return (
      <span className="text-neutral-300 dark:text-neutral-600">
        <span aria-hidden>—</span>
        <span className="sr-only">no difference</span>
      </span>
    )
  }
  return (
    <span className="font-medium text-neutral-900 dark:text-neutral-100">
      {rounded > 0 ? '+' : '−'}
      {Math.abs(rounded).toFixed(1)}
    </span>
  )
}

/**
 * The percentage, with a bar behind it.
 *
 * Fifteen percentages are hard to compare as bare numbers. The bar is scaled
 * to 100, not to the highest value in the squad, so the same player looks the
 * same in any squad and the reader is not misled by a relative scale.
 */
function OwnershipBar({ percent }: { percent: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-right tabular-nums font-medium text-neutral-900 dark:text-neutral-100">
        {percent.toFixed(1)}%
      </span>
      <span
        aria-hidden
        className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
      >
        <span
          className="block h-full rounded-full bg-neutral-400 dark:bg-neutral-500"
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </span>
    </span>
  )
}

/**
 * The four-step diverging scale.
 *
 * Two greens and two reds, no amber: an amber middle would read as "neutral",
 * and there is no neutral here. Every band either helps or hurts the position
 * you are in, and the step from `good` to `weak` is the line between the two.
 * Keeping the pale pair adjacent makes that line the strongest edge in the
 * column, which is what has to be legible without reading the labels.
 */
const STEP_STYLE: Record<BandStrategyStep, string> = {
  best: 'bg-emerald-200 text-emerald-950 dark:bg-emerald-500/35 dark:text-emerald-50',
  good: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  weak: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  worst: 'bg-rose-200 text-rose-950 dark:bg-rose-500/35 dark:text-rose-50',
}

/** No direction to read against, so no claim about whether the band helps. */
const NO_DIRECTION_STYLE =
  'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'

const STEP_WORDING: Record<BandStrategyStep, string> = {
  best: 'best for your position',
  good: 'helps your position',
  weak: 'works against your position',
  worst: 'worst for your position',
}

function BandChip({
  id,
  label,
  position,
}: {
  id: OwnershipBandId
  label: string
  position: FieldPosition
}) {
  const step = bandStrategyStep(id, position)

  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${
        step === null ? NO_DIRECTION_STYLE : STEP_STYLE[step]
      }`}
    >
      {label}
      {/* Colour alone would carry the entire helps-or-hurts message, so the
          same thing is said in words for anyone who cannot read the hues. */}
      {step !== null && <span className="sr-only">, {STEP_WORDING[step]}</span>}
    </span>
  )
}

/**
 * Section 7.4's direction flag: one line, above the table, never per player.
 */
function DirectionFlag({ reference }: { reference: ReferencePopulation }) {
  const { standing } = reference

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm text-neutral-700 dark:text-neutral-300">
        {standing.guidance}
      </p>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {describePopulation(reference)}
      </p>
    </div>
  )
}

function describePopulation(reference: ReferencePopulation): string {
  const { standing } = reference

  if (reference.mode === 'global') {
    return standing.rank === null
      ? `Compared against all ${reference.size.toLocaleString('en-GB')} FPL managers.`
      : `Rank ${standing.rank.toLocaleString('en-GB')} of ${standing.of.toLocaleString('en-GB')}, ahead of ${standing.betterThanPercent?.toFixed(1)}% of managers.`
  }

  if (reference.mode === 'rival') {
    return `Compared against ${reference.label}.`
  }

  // A null rank means the manager is not among the compared managers. That
  // covers both a league they are not in and, on a big league, one they are in
  // but rank outside the top 50 of. Wording that fits both.
  const where =
    standing.rank === null
      ? 'You are outside the compared group'
      : `You are ${standing.rank} of ${standing.of}`
  return `${where}. Ownership measured across ${reference.size} squad${reference.size === 1 ? '' : 's'} in ${reference.label}.`
}

/**
 * What the flags mean, once, below the table.
 *
 * Ordered best-first for the current position and coloured to match, so the
 * key is a legend for the table as it stands rather than a fixed glossary. It
 * re-orders when the direction flips, which is the clearest possible statement
 * that the ordering is a consequence of where the manager sits and not a
 * property of the bands.
 */
function BandKey({ position }: { position: FieldPosition }) {
  const ordered = bandStrategyOrder(position)
    .map((id) => OWNERSHIP_BANDS.find((band) => band.id === id))
    .filter((band) => band !== undefined)

  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <dl className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {ordered.map((band) => {
          const index = OWNERSHIP_BANDS.indexOf(band)
          const upper = index === 0 ? null : OWNERSHIP_BANDS[index - 1].min
          return (
            <div key={band.id} className="flex items-baseline gap-2">
              <dt className="shrink-0">
                <BandChip id={band.id} label={band.label} position={position} />
              </dt>
              <dd className="text-xs text-neutral-500 dark:text-neutral-400">
                <span className="tabular-nums">
                  {upper === null ? `${band.min}%+` : `${band.min}–${upper}%`}
                </span>
                <span className="hidden lg:inline"> · {band.description}</span>
              </dd>
            </div>
          )
        })}
      </dl>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        {position === 'unknown' ? (
          <>
            Bands read global ownership and mean the same thing whichever
            population is selected. There is no rank to read you against, so
            none of them is marked as helping or hurting.
          </>
        ) : (
          <>
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              Green marks the bands that help your current position
            </span>{' '}
            and red the ones that work against it, best first. Because you are{' '}
            {position === 'ahead' ? 'ahead of' : 'behind'} this population,{' '}
            {position === 'ahead'
              ? 'owning what the crowd owns protects your lead and differentials risk it'
              : 'differentials are how you close the gap and matching the crowd preserves it'}
            . The bands themselves read global ownership, so they mean the same
            thing whichever population is selected.
          </>
        )}
      </p>
    </div>
  )
}
