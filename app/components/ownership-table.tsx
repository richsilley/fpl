import {
  ownershipBandOf,
  OWNERSHIP_BANDS,
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
 * ## Why the bands are not colour-coded good or bad
 *
 * A differential is not inherently good or bad. Section 7.4 is explicit: ahead
 * of the population it is a risk, behind it is the way to close the gap. The
 * same 4% player means opposite things to two managers, so shading it green or
 * red would be wrong for one of them, and would clash with section 6.4's rule
 * that green means good everywhere.
 *
 * The bands are therefore neutral descriptors, and the single line of guidance
 * above the table carries the direction. Section 7.4 asks for exactly that:
 * guidance "above the table, not as advice per player".
 *
 * The **difference** column is the exception, and only because its sign is not
 * a judgement: it says which way the population leans, not whether that is
 * good. It is rendered with weight rather than colour for the same reason.
 */

const PLAYER_COLUMN = 'w-[9.5rem] min-w-[9.5rem] sm:w-52 sm:min-w-52'
const OWNERSHIP_COLUMN = 'min-w-[10rem]'
/**
 * In a comparison mode the global column moves into the player cell below
 * `sm`. Four columns do not fit a phone, and the two that would scroll off are
 * the reference and the difference, which are the entire point of choosing a
 * league or a rival. The global figure is the one that can be read anywhere.
 */
const GLOBAL_COLUMN_COMPARING = 'hidden sm:table-cell min-w-[10rem]'
const NUMERIC_COLUMN = 'w-[5rem] min-w-[5rem] sm:w-24 sm:min-w-24'
/**
 * Hidden below `sm`, where the chip rides in the player cell instead. As a
 * column it does not fit on a phone, and the flag is the point of the view, so
 * it must not be the thing that scrolls off.
 */
const BAND_COLUMN = 'hidden sm:table-cell w-32 min-w-32'

export function OwnershipTable({
  rows,
  reference,
  teamName,
}: {
  rows: OwnershipRow[]
  reference: ReferencePopulation
  teamName: string
}) {
  // Global mode compares the population against itself, so the reference and
  // difference columns would repeat the ownership figure and a column of
  // zeroes. See 7.4.1.
  const showComparison = reference.mode !== 'global'
  const startingXi = rows.filter((row) => row.player.squadPosition <= 11)
  const bench = rows.filter((row) => row.player.squadPosition > 11)
  const columnCount = showComparison ? 5 : 3

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
            {teamName}: how widely each of the fifteen players is owned
            {showComparison
              ? `, across all FPL managers and within ${reference.label}`
              : ' across all FPL managers'}
            .
          </caption>

          <thead>
            <tr>
              <th
                scope="col"
                className={`sticky left-0 z-20 border-b border-r border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${PLAYER_COLUMN}`}
              >
                Player
              </th>
              <th
                scope="col"
                title="Percentage of all FPL managers who own this player"
                className={`border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${
                  showComparison ? GLOBAL_COLUMN_COMPARING : OWNERSHIP_COLUMN
                }`}
              >
                {showComparison ? 'Global' : 'Owned by'}
              </th>

              {showComparison && (
                <>
                  <th
                    scope="col"
                    title={`Ownership within ${reference.label}`}
                    className={`border-b border-l border-neutral-100 bg-neutral-50 px-2 py-2 text-right font-medium text-neutral-600 dark:border-neutral-800/70 dark:bg-neutral-800 dark:text-neutral-300 ${NUMERIC_COLUMN}`}
                  >
                    <span className="block max-w-full truncate">
                      {reference.mode === 'rival' ? 'Rival' : 'League'}
                    </span>
                  </th>
                  <th
                    scope="col"
                    title="Reference ownership minus global ownership"
                    className={`border-b border-l border-neutral-100 bg-neutral-50 px-2 py-2 text-right font-medium text-neutral-600 dark:border-neutral-800/70 dark:bg-neutral-800 dark:text-neutral-300 ${NUMERIC_COLUMN}`}
                  >
                    Diff
                  </th>
                </>
              )}

              <th
                scope="col"
                className={`border-b border-l border-neutral-100 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800/70 dark:bg-neutral-800 dark:text-neutral-300 ${BAND_COLUMN}`}
              >
                Flag
              </th>
            </tr>
          </thead>

          <tbody>
            {startingXi.map((row) => (
              <PlayerRow
                key={row.player.id}
                row={row}
                reference={reference}
                showComparison={showComparison}
              />
            ))}

            <tr>
              <th
                scope="colgroup"
                colSpan={columnCount}
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
                showComparison={showComparison}
              />
            ))}
          </tbody>
        </table>
      </div>

      <BandKey />
    </div>
  )
}

function PlayerRow({
  row,
  reference,
  showComparison,
}: {
  row: OwnershipRow
  reference: ReferencePopulation
  showComparison: boolean
}) {
  const band = ownershipBandOf(row.globalPercent)
  const isBench = row.player.squadPosition > 11

  const rowBackground = isBench
    ? 'bg-neutral-50 dark:bg-neutral-900/60'
    : 'bg-white dark:bg-neutral-900'

  return (
    <tr>
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
        <span className="mt-0.5 flex items-baseline gap-1.5 sm:hidden">
          <BandChip id={band.id} label={band.label} />
          {/* In a comparison mode the global column is hidden at this width,
              so the figure rides here instead. */}
          {showComparison && (
            <span className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
              {row.globalPercent.toFixed(1)}% global
            </span>
          )}
        </span>
      </th>

      <td
        className={`border-b border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${
          showComparison ? GLOBAL_COLUMN_COMPARING : OWNERSHIP_COLUMN
        }`}
      >
        <OwnershipBar percent={row.globalPercent} />
      </td>

      {showComparison && (
        <>
          <td
            className={`border-b border-l border-neutral-100 px-2 py-1.5 text-right tabular-nums text-neutral-800 dark:border-neutral-800/70 dark:text-neutral-200 ${rowBackground} ${NUMERIC_COLUMN}`}
          >
            {/* A population of one reads better as a yes or no than as 0% or
                100%. The calculation is unchanged; only the wording is. */}
            {reference.mode === 'rival' ? (
              row.referencePercent > 0 ? (
                <span className="font-medium">Owns</span>
              ) : (
                <span className="text-neutral-400 dark:text-neutral-600">
                  No
                </span>
              )
            ) : (
              `${row.referencePercent.toFixed(1)}%`
            )}
          </td>
          <td
            className={`border-b border-l border-neutral-100 px-2 py-1.5 text-right tabular-nums dark:border-neutral-800/70 ${rowBackground} ${NUMERIC_COLUMN}`}
          >
            <Difference value={row.difference} />
          </td>
        </>
      )}

      <td
        className={`border-b border-l border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${BAND_COLUMN}`}
      >
        <BandChip id={band.id} label={band.label} />
      </td>
    </tr>
  )
}

/**
 * Reference minus global.
 *
 * Weight rather than colour: the sign says which way the population leans, and
 * whether leaning that way is good depends entirely on the direction flag.
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

const BAND_STYLE: Record<OwnershipBandId, string> = {
  template:
    'bg-neutral-800 text-neutral-50 dark:bg-neutral-200 dark:text-neutral-900',
  popular:
    'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  low: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  differential:
    'border border-neutral-400 text-neutral-800 dark:border-neutral-500 dark:text-neutral-100',
}

function BandChip({ id, label }: { id: OwnershipBandId; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${BAND_STYLE[id]}`}
    >
      {label}
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
 * These read the same for every player in a band, so as a column they were
 * fifteen rows repeating four sentences. Stated once here they are still
 * available to a first-time reader without crowding the table.
 */
function BandKey() {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <dl className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6">
        {OWNERSHIP_BANDS.map((band, index) => {
          const upper = index === 0 ? null : OWNERSHIP_BANDS[index - 1].min
          return (
            <div key={band.id} className="flex items-baseline gap-2">
              <dt className="shrink-0">
                <BandChip id={band.id} label={band.label} />
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
      <p className="mt-2 text-xs text-neutral-400 dark:text-neutral-500">
        Bands read global ownership, so they mean the same thing whichever
        population is selected.
      </p>
    </div>
  )
}
