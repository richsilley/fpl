import Link from 'next/link'

import { overLimitAccent, PlayerName } from '@/app/components/player-cell'
import {
  MATRIX_HEADER_HEIGHT,
  MATRIX_PLAYER_COLUMN,
  MATRIX_ROW_HEIGHT,
} from '@/app/components/table-metrics'
import {
  bandStrategyStep,
  ownershipBandOf,
  OWNERSHIP_BANDS,
  type BandStrategyStep,
  type FieldPosition,
  type OwnershipBandId,
} from '@/lib/fpl/ownership'
import type { ReferencePopulation } from '@/lib/fpl/reference'
import type { SquadPlayer } from '@/lib/fpl/squad'

/**
 * View 3, Ownership (section 7.4).
 *
 * See what your rivals own, and build a strategy that fits your objective.
 *
 * ## Columns follow the comparison, and the first column never moves
 *
 * The player column is the shared width from `table-metrics`, identical to
 * Fixtures and Form, so switching view leaves it exactly where it was.
 *
 * The comparison columns are the ones that change, and they change by
 * appearing rather than by filling with dashes:
 *
 * | Mode   | Columns |
 * |--------|---------|
 * | global | Global, Flag |
 * | league | Global, League, Diff, Flag |
 * | rival  | Global, League, Rival, Diff, Flag |
 *
 * An earlier version kept all six always and dashed the unused ones, to stop
 * the table reflowing. That traded a reflow for four dead columns on the view
 * most people open first. Now that the player column is pinned by the shared
 * width, the part that must not move does not, and the rest is free to say
 * only what it has.
 *
 * **League stays visible in rival mode.** A rival is picked out of a league,
 * and "they own him, and so does half the league" is a different fact from
 * "they own him and nobody else does".
 *
 * ## The flag colour is relative to your position, not to the band
 *
 * The label carries the band and never changes. The colour carries whether
 * being in that band helps or hurts you *right now*, and reverses with the
 * direction flag: ahead of the population a differential is a risk and
 * convergence protects the lead; behind, the reverse. So the same Template
 * chip is the best thing on the table when you are ahead and the worst when
 * you are behind.
 *
 * Diverging green-to-red with no amber: the split between helping and hurting
 * is the whole message and has to be visible without reading a word. With no
 * rank to read against there is no direction, so the chips stay grey rather
 * than inventing advice.
 */

const PLAYER_COLUMN = MATRIX_PLAYER_COLUMN
/** The bar columns. Wide, because there the space is the data. */
const PERCENT_COLUMN = 'w-56 min-w-56'
const NUMERIC_COLUMN = 'w-20 min-w-20'
const BAND_COLUMN = 'w-32 min-w-32'

/**
 * One row's figures, gathered across up to three populations.
 *
 * `leaguePercent` and `rivalOwns` are null when that population is not
 * selected, which is also when its column is absent.
 */
export type OwnershipView = {
  player: SquadPlayer
  globalPercent: number
  leaguePercent: number | null
  rivalOwns: boolean | null
  /** The active population's ownership minus global. */
  difference: number | null
}

export function OwnershipTable({
  rows,
  reference,
  teamName,
  leagueLabel,
  rivalLabel,
  swapHref,
  overLimitTeamIds,
  populationHref,
}: {
  rows: OwnershipView[]
  reference: ReferencePopulation
  teamName: string
  /** Non-null when a league is selected, which is when its column shows. */
  leagueLabel: string | null
  rivalLabel: string | null
  swapHref: ((playerId: number) => string) | null
  overLimitTeamIds: Set<number>
  /** Opens the population picker (section 7.8). */
  populationHref: string
}) {
  const startingXi = rows.filter((row) => row.player.squadPosition <= 11)
  const bench = rows.filter((row) => row.player.squadPosition > 11)
  const position = reference.standing.position

  const showLeague = leagueLabel !== null
  const showRival = rivalLabel !== null
  const showDifference = showLeague || showRival
  const columnCount =
    3 + (showLeague ? 1 : 0) + (showRival ? 1 : 0) + (showDifference ? 1 : 0)

  return (
    <div className="space-y-4">
      {/* Its own row, under the view's question and above the guidance, rather
          than floated to the right of the guidance: beside it, the button and
          a paragraph of prose fought for the same line and neither survived a
          phone. */}
      <PopulationButton href={populationHref} label={reference.label} />
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
            {teamName}: how widely each of the fifteen players is owned.
          </caption>

          <thead>
            <tr className={MATRIX_HEADER_HEIGHT}>
              <HeaderCell
                className={`sticky left-0 z-20 border-r ${PLAYER_COLUMN}`}
                align="left"
              >
                Player
              </HeaderCell>
              {/* Every column carries a tooltip. The two that name a selection
                  say so, since "the selected league" is answerable from the
                  header only if you already know which one is selected. */}
              <HeaderCell
                className={PERCENT_COLUMN}
                align="left"
                title="Share of all FPL managers who own this player."
              >
                Global
              </HeaderCell>
              {showLeague && (
                <HeaderCell
                  className={PERCENT_COLUMN}
                  align="left"
                  title={`Share of the selected league who own this player. Currently ${leagueLabel}.`}
                >
                  League
                </HeaderCell>
              )}
              {showRival && (
                <HeaderCell
                  className={NUMERIC_COLUMN}
                  title={`Whether this manager owns the player. Currently ${rivalLabel}.`}
                >
                  Rival
                </HeaderCell>
              )}
              {showDifference && (
                <HeaderCell
                  className={NUMERIC_COLUMN}
                  title="The selected population's ownership minus global. Positive means your league backs them more than the wider field does."
                >
                  Diff
                </HeaderCell>
              )}
              <HeaderCell
                className={BAND_COLUMN}
                align="left"
                title="Ownership band, coloured by whether it helps or hurts your current position."
              >
                Flag
              </HeaderCell>

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
                position={position}
                showLeague={showLeague}
                showRival={showRival}
                showDifference={showDifference}
                swapHref={swapHref}
                overLimitTeamIds={overLimitTeamIds}
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
                position={position}
                showLeague={showLeague}
                showRival={showRival}
                showDifference={showDifference}
                swapHref={swapHref}
                overLimitTeamIds={overLimitTeamIds}
              />
            ))}
          </tbody>
        </table>
      </div>

      <BandKey position={position} />
    </div>
  )
}

/**
 * The way into the population picker (section 7.8).
 *
 * The picker used to be a bordered card of links and two ID forms sitting
 * permanently above the table, which was the untidiest thing on the page and
 * pushed the table down on the one view where the table *is* the comparison.
 * It floats now, and this button names what is currently selected so the state
 * stays legible with the panel shut.
 */
function PopulationButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      className="inline-flex w-full items-center gap-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 sm:w-auto dark:border-neutral-600 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      <span className="text-neutral-500 dark:text-neutral-400">
        Compare against
      </span>
      <span className="max-w-[14rem] truncate font-semibold">{label}</span>
      <span aria-hidden className="text-[10px]">
        &#9662;
      </span>
    </Link>
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
  position,
  showLeague,
  showRival,
  showDifference,
  swapHref,
  overLimitTeamIds,
}: {
  row: OwnershipView
  position: FieldPosition
  showLeague: boolean
  showRival: boolean
  showDifference: boolean
  swapHref: ((playerId: number) => string) | null
  overLimitTeamIds: Set<number>
}) {
  const band = ownershipBandOf(row.globalPercent)
  const isBench = row.player.squadPosition > 11

  // In rival mode the question is "which of mine do they also have", and that
  // is a property of the whole row rather than of one cell. Lifting it to the
  // row means the answer is visible while scanning names, without reading
  // across to a column of yes and no.
  const rivalMisses = showRival && row.rivalOwns === false

  const rowBackground = rivalMisses
    ? 'bg-neutral-100/70 dark:bg-neutral-950/60'
    : isBench
      ? 'bg-neutral-50 dark:bg-neutral-900/60'
      : 'bg-white dark:bg-neutral-900'

  const dim = rivalMisses ? 'opacity-55' : ''

  return (
    <tr className={MATRIX_ROW_HEIGHT}>
      <th
        scope="row"
        className={`sticky left-0 z-10 border-b border-r border-neutral-200 px-3 py-1.5 text-left font-normal dark:border-neutral-800 ${rowBackground} ${PLAYER_COLUMN} ${overLimitAccent(row.player.teamId, overLimitTeamIds)}`}
      >
        <span className={`flex items-baseline gap-1.5 ${dim}`}>
          <PlayerName
            name={row.player.name}
            href={swapHref === null ? null : swapHref(row.player.id)}
          />
          <span className="shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
            {row.player.club}
          </span>
        </span>
      </th>

      <td
        className={`border-b border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${PERCENT_COLUMN}`}
      >
        <span className={dim}>
          <OwnershipBar percent={row.globalPercent} tone={BAR_TONE.global} />
        </span>
      </td>

      {showLeague && (
        <td
          className={`border-b border-l border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${PERCENT_COLUMN}`}
        >
          <span className={dim}>
            <OwnershipBar
              percent={row.leaguePercent ?? 0}
              tone={BAR_TONE.league}
            />
          </span>
        </td>
      )}

      {showRival && (
        <td
          className={`border-b border-l border-neutral-100 px-2 py-1.5 text-center dark:border-neutral-800/70 ${rowBackground} ${NUMERIC_COLUMN}`}
        >
          {row.rivalOwns ? (
            <span className="inline-flex items-center rounded bg-neutral-900 px-1.5 py-0.5 text-xs font-semibold text-white dark:bg-neutral-100 dark:text-neutral-900">
              Owns
            </span>
          ) : (
            <span className="text-xs text-neutral-400 dark:text-neutral-600">
              &mdash;
            </span>
          )}
        </td>
      )}

      {showDifference && (
        <td
          className={`border-b border-l border-neutral-100 px-2 py-1.5 text-center tabular-nums dark:border-neutral-800/70 ${rowBackground} ${NUMERIC_COLUMN}`}
        >
          <span className={dim}>
            <Difference value={row.difference} />
          </span>
        </td>
      )}

      <td
        className={`border-b border-l border-neutral-100 px-3 py-1.5 dark:border-neutral-800/70 ${rowBackground} ${BAND_COLUMN}`}
      >
        <span className={dim}>
          <BandChip id={band.id} label={band.label} position={position} />
        </span>
      </td>

      <td
        aria-hidden
        className={`w-auto border-b border-l border-neutral-100 dark:border-neutral-800/70 ${rowBackground}`}
      />
    </tr>
  )
}

/**
 * One hue per bar column, chosen for contrast rather than prettiness: the two
 * percentage columns sit side by side and the whole point is telling them
 * apart at a glance. Neither implies good or bad — that is the Flag column's
 * job, and it reverses with the direction flag.
 */
const BAR_TONE = {
  global: 'bg-slate-400/60 dark:bg-slate-400/40',
  league: 'bg-violet-400/60 dark:bg-violet-500/45',
} as const

/**
 * Reference minus global.
 *
 * Weight rather than colour: the sign says which way the population leans, and
 * whether leaning that way is good depends entirely on the direction flag,
 * which the Flag column already carries.
 */
function Difference({ value }: { value: number | null }) {
  const rounded = value === null ? 0 : Math.round(value * 10) / 10
  if (value === null || rounded === 0) {
    return (
      <span className="text-neutral-300 dark:text-neutral-600">
        <span aria-hidden>&mdash;</span>
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
function OwnershipBar({ percent, tone }: { percent: number; tone: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-right font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
        {percent.toFixed(1)}%
      </span>
      <span
        aria-hidden
        className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
      >
        <span
          className={`block h-full rounded-full ${tone}`}
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

/** Section 7.4's direction flag: one line, above the table, never per player. */
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

  // A null rank means the manager is not among the compared managers: either a
  // league they are not in, or one they are in but rank outside the top 50 of.
  const where =
    standing.rank === null
      ? 'You are outside the compared group'
      : `You are ${standing.rank} of ${standing.of}`
  return `${where}. Ownership measured across ${reference.size} squad${reference.size === 1 ? '' : 's'} in ${reference.label}.`
}

/**
 * What the columns and the flags mean, once, below the table.
 *
 * ## The bands are listed by ownership, not by strategy
 *
 * They used to be ordered best-first for the current position, so the list
 * re-ordered when the direction flipped. Splitting the two ideas reads better:
 * the list says what a band *is*, which is a fixed property running from most
 * owned to least, and the paragraph under it says what each is *worth to you*,
 * which is the part that moves. The chips are still coloured by position, so
 * the reversal is still visible — it is carried by colour rather than by
 * shuffling four rows the reader has just learned the order of.
 */
function BandKey({ position }: { position: FieldPosition }) {
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
      <p>
        <Term>Global</Term> the share of all FPL managers who own each player.
      </p>

      <div>
        <p>
          <Term>Flag</Term> how widely owned a player is.
        </p>
        {/* Most owned to least, which is the order the thresholds run in and
            the order the labels are learned in. One band per row: wrapped
            across the width they broke apart and the descriptions had to be
            hidden below `lg` to fit, which is most of the point of a legend. */}
        <dl className="mt-1.5 space-y-1">
          {OWNERSHIP_BANDS.map((band, index) => {
            const upper = index === 0 ? null : OWNERSHIP_BANDS[index - 1].min
            return (
              <div key={band.id} className="flex items-baseline gap-2">
                {/* A fixed width so the four chips line up and the ranges
                    beside them read as a column. */}
                <dt className="w-24 shrink-0">
                  <BandChip
                    id={band.id}
                    label={band.label}
                    position={position}
                  />
                </dt>
                <dd>
                  <span className="tabular-nums">
                    {upper === null ? `${band.min}%+` : `${band.min}–${upper}%`}
                  </span>{' '}
                  &middot; {band.description}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>

      <p className="max-w-prose">
        {position === 'unknown' ? (
          <>
            Bands read global ownership and mean the same thing whichever
            population is selected. There is no rank to read you against, so
            none of them is marked as helping or hurting.
          </>
        ) : (
          <>
            <span className="font-medium text-neutral-700 dark:text-neutral-200">
              Green marks the bands helping your current position
            </span>
            , red the ones working against it.{' '}
            {position === 'ahead' ? (
              <>
                You&rsquo;re ahead of this population, so owning what the crowd
                owns protects your lead and differentials risk it. Fall behind
                and the colours reverse, because matching the field can&rsquo;t
                close a gap.
              </>
            ) : (
              // The mirror image, because the sentence above is a claim about
              // where the reader actually sits and would be false here.
              <>
                You&rsquo;re behind this population, so differentials are how
                you close the gap and matching the crowd preserves it. Move
                ahead and the colours reverse, because a lead is protected by
                owning what the crowd owns.
              </>
            )}
          </>
        )}
      </p>
    </div>
  )
}

/** The thing being defined, picked out so the definitions scan as a list. */
function Term({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-neutral-700 dark:text-neutral-300">
      {children} &mdash;
    </span>
  )
}
