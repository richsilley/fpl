import {
  fixtureScore,
  fixturesFor,
  formatFixtureScore,
  horizonGameweeks,
  NEUTRAL_SCORE,
  type FixtureScore,
  type TeamFixture,
} from '@/lib/fpl/fixtures'
import type { SquadPlayer } from '@/lib/fpl/squad'
import type { FixturesView } from '@/lib/fpl/views'

/**
 * View 1, Fixtures (section 7.2). "Where are my fixture problems?"
 *
 * Columns are gameweeks from the first unplayed one through GW38, plus the
 * Fixture Score summary. The player column is frozen and the gameweeks scroll,
 * which is the section 8.5 pattern.
 *
 * ## Colour
 *
 * Section 6.4: green means good everywhere, and the number under it changes
 * meaning. A fixture cell shows raw FDR, so green is a *low* number. The
 * summary shows Fixture Score, so green is a *high* number. Keeping the colour
 * constant is the point; the two scales below are deliberately inverted
 * relative to each other.
 */

/**
 * Cell widths, so the header and body columns line up as one grid.
 *
 * The gameweek column is sized to "MCI a" and no wider. At 52px roughly twenty
 * gameweeks are on screen at 1440, against thirteen at a more comfortable
 * 80px: for a view whose job is spotting a bad run several gameweeks out,
 * seeing more of the season at once is worth more than the extra padding.
 */
const GW_COLUMN = 'w-[3.25rem] min-w-[3.25rem]'
const PLAYER_COLUMN = 'w-[7.5rem] min-w-[7.5rem] sm:w-44 sm:min-w-44'
const SCORE_COLUMN = 'w-24 min-w-24'

export function FixturesTable({ view }: { view: FixturesView }) {
  const { squad, columns, startGameweek, horizon } = view
  const inHorizon = new Set(horizonGameweeks(startGameweek, horizon))

  // `relative` on the scroll container is load-bearing, not decoration. The
  // sr-only labels in the cells are absolutely positioned, so without a
  // positioned ancestor their containing block is the viewport:
  // `overflow-x-auto` does not clip them, the ones in the far-right gameweeks
  // stretch the document to the full width of the table, and the whole page
  // scrolls sideways instead of just the table. Section 8.5 rules that out.
  return (
    <div className="relative overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">
          {squad.manager.teamName}: opponent and fixture difficulty for each of
          the fifteen players from gameweek {startGameweek} to 38, with a
          Fixture Score over the next {horizon} gameweeks.
        </caption>

        <thead>
          <tr>
            <th
              scope="col"
              className={`sticky left-0 z-20 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${PLAYER_COLUMN}`}
            >
              Player
            </th>
            <th
              scope="col"
              className={`sticky left-[7.5rem] z-20 hidden border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-right font-medium text-neutral-600 sm:left-44 sm:table-cell dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${SCORE_COLUMN}`}
            >
              {/* Section 6.4: labelled Fixture Score, never FDR. */}
              <span title="Sum of 6 minus difficulty across the horizon, then the number of fixtures. Higher is better.">
                Fixture Score
              </span>
            </th>
            {columns.map((gameweek) => (
              <th
                key={gameweek}
                scope="col"
                className={`border-b border-neutral-200 px-1 py-2 text-center text-xs font-medium tabular-nums dark:border-neutral-800 ${GW_COLUMN} ${
                  inHorizon.has(gameweek)
                    ? 'bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100'
                    : 'bg-neutral-50 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                }`}
              >
                <span className="sr-only">Gameweek </span>
                {gameweek}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {squad.startingXi.map((player) => (
            <PlayerRow key={player.id} player={player} view={view} />
          ))}

          <tr>
            <th
              scope="colgroup"
              colSpan={columns.length + 2}
              className="sticky left-0 border-y border-neutral-200 bg-neutral-100 px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-400"
            >
              Bench
            </th>
          </tr>

          {squad.bench.map((player) => (
            <PlayerRow key={player.id} player={player} view={view} isBench />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function PlayerRow({
  player,
  view,
  isBench = false,
}: {
  player: SquadPlayer
  view: FixturesView
  isBench?: boolean
}) {
  const { fixtures, columns, startGameweek, horizon } = view
  const summary = fixtureScore(fixtures, player.teamId, startGameweek, horizon)

  // Sticky cells sit above the scrolling ones, so they need their own opaque
  // background rather than inheriting the row's.
  const rowBackground = isBench
    ? 'bg-neutral-50 dark:bg-neutral-900/60'
    : 'bg-white dark:bg-neutral-900'

  return (
    <tr>
      <th
        scope="row"
        className={`sticky left-0 z-10 border-b border-neutral-100 px-3 py-1.5 text-left font-normal dark:border-neutral-800/70 ${rowBackground} ${PLAYER_COLUMN}`}
      >
        <span className="flex items-baseline gap-1.5">
          <span className="truncate font-medium text-neutral-900 dark:text-neutral-100">
            {player.name}
          </span>
          <span className="shrink-0 text-[10px] uppercase text-neutral-400 dark:text-neutral-500">
            {player.club}
          </span>
        </span>
        {/* Below the sm breakpoint the score column is hidden to leave room
            for gameweeks, so the score rides along with the name instead. */}
        <span className="mt-0.5 flex sm:hidden">
          <ScoreBadge summary={summary} compact />
        </span>
      </th>

      <td
        className={`sticky left-[7.5rem] z-10 hidden border-b border-r border-neutral-200 px-2 py-1.5 text-right sm:left-44 sm:table-cell dark:border-neutral-800 ${rowBackground} ${SCORE_COLUMN}`}
      >
        <ScoreBadge summary={summary} />
      </td>

      {columns.map((gameweek) => (
        // `h-px` is not a real height: a table cell always stretches to its
        // row. Declaring any definite height is what lets the shaded block
        // inside resolve `h-full` against the row rather than falling back to
        // its own content height, which otherwise leaves the shading short of
        // the row on narrow screens, where the player cell is two lines tall.
        <td
          key={gameweek}
          className={`h-px border-b border-l border-neutral-100 p-0 dark:border-neutral-800/70 ${GW_COLUMN}`}
        >
          <FixtureCell fixtures={fixturesFor(fixtures, player.teamId, gameweek)} />
        </td>
      ))}
    </tr>
  )
}

/**
 * One gameweek for one player.
 *
 * Section 6.5 and 7.2: no fixtures is a blank and renders as an empty cell;
 * two fixtures is a double and splits the cell, each half shaded by its own
 * FDR since the two opponents are rarely of equal difficulty.
 */
function FixtureCell({ fixtures }: { fixtures: TeamFixture[] }) {
  // `h-full` makes the cell fill the row, which matters below the sm
  // breakpoint where the player cell carries the score on a second line and so
  // sets a taller row. `min-h-11` keeps a sensible floor above that.
  if (fixtures.length === 0) {
    return (
      <div className="h-full min-h-11">
        <span className="sr-only">Blank gameweek</span>
      </div>
    )
  }

  const split = fixtures.length > 1

  return (
    <div className="flex h-full min-h-11 flex-col gap-px">
      {fixtures.map((fixture, position) => (
        <div
          key={`${fixture.opponent}-${position}`}
          className={`flex flex-1 items-center justify-center gap-0.5 leading-none ${
            split ? 'text-[10px]' : 'text-xs'
          } ${FDR_TONE[fixture.fdr] ?? FDR_TONE[3]}`}
          title={`${fixture.isHome ? 'Home to' : 'Away at'} ${fixture.opponentName} (difficulty ${fixture.fdr})`}
        >
          <span className="font-medium">{fixture.opponent}</span>
          <span className="text-[9px] uppercase opacity-70">
            {fixture.isHome ? 'H' : 'A'}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Section 6.3: the score to one decimal place, then the fixture count in
 * brackets, e.g. "7.2 (5)".
 *
 * Under normalisation the count matters more, not less: dividing by gameweeks
 * compresses the range, so the count is what explains a surprising score. It
 * is also what lets the reader decide what a double is worth, rather than the
 * app deciding for them.
 */
function ScoreBadge({
  summary,
  compact = false,
}: {
  summary: FixtureScore
  compact?: boolean
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 tabular-nums ${
        compact ? 'text-[11px]' : 'text-sm'
      } ${scoreTone(summary.score)}`}
    >
      <span className="font-semibold">
        {formatFixtureScore(summary.score)}
      </span>
      <span className="text-[11px] opacity-70">({summary.count})</span>
    </span>
  )
}

/**
 * Fixture cell shading: raw FDR, so green is a low number (section 6.4).
 */
const FDR_TONE: Record<number, string> = {
  1: 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50',
  2: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100',
  3: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  4: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
  5: 'bg-rose-200 text-rose-950 dark:bg-rose-800 dark:text-rose-50',
}

/**
 * Summary shading: Fixture Score, so green is a high number (section 6.4).
 *
 * Normalising (section 6.1) made this simple. The score no longer scales with
 * the horizon, so the thresholds are fixed points on the 0 to 10 scale rather
 * than ratios against a moving baseline, and a band means the same thing at a
 * horizon of 1 as at 10. They sit symmetrically around `NEUTRAL_SCORE`, the
 * all-FDR-3 run: a whole horizon of FDR 2 scores 8.0 and lands in the top
 * band, a whole horizon of FDR 4 scores 4.0 and lands in the bottom one.
 *
 * Scores over 10 from a double gameweek simply fall in the top band. Section
 * 6.1 says not to cap them, and nothing here does.
 */
function scoreTone(score: number): string {
  if (score >= NEUTRAL_SCORE + 1.5) {
    return 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50'
  }
  if (score >= NEUTRAL_SCORE + 0.5) {
    return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100'
  }
  if (score >= NEUTRAL_SCORE - 0.5) {
    return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
  }
  if (score >= NEUTRAL_SCORE - 1.5) {
    return 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100'
  }
  return 'bg-rose-200 text-rose-950 dark:bg-rose-800 dark:text-rose-50'
}
