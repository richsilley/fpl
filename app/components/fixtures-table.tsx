import { FixtureCell, ScoreBadge } from '@/app/components/fixture-visuals'
import { overLimitAccent, PlayerName } from '@/app/components/player-cell'
import {
  MATRIX_HEADER_HEIGHT,
  MATRIX_PLAYER_COLUMN,
  MATRIX_PLAYER_COLUMN_END,
  MATRIX_ROW_HEIGHT,
} from '@/app/components/table-metrics'
import { fixtureScore, fixturesFor, horizonGameweeks } from '@/lib/fpl/fixtures'
import type { SquadPlayer } from '@/lib/fpl/squad'
import type { MatrixData } from '@/lib/fpl/views'

/**
 * View 1, Fixtures (section 7.2). "Where are my fixture problems?"
 *
 * Columns are the gameweeks in the selected horizon, plus the Fixture Score
 * summary. The player column is frozen and the gameweeks scroll, which is the
 * section 8.5 pattern.
 *
 * The cell and badge rendering, and the two colour scales, live in
 * ./fixture-visuals so Club Blocks (7.5) draws the same fixtures the same way.
 */

/** Cell widths, so the header and body columns line up as one grid. */
const PLAYER_COLUMN = MATRIX_PLAYER_COLUMN
const SCORE_COLUMN = 'w-24 min-w-24'

/**
 * Gameweek columns are sized to the number on show. A short horizon leaves
 * room to breathe; a long one packs down to "MCI a" so more of the season
 * stays on screen at once.
 */
function gameweekColumnWidth(count: number): string {
  if (count <= 6) return 'w-24 min-w-24'
  if (count <= 12) return 'w-[4.5rem] min-w-[4.5rem]'
  return 'w-[3.25rem] min-w-[3.25rem]'
}

export function FixturesTable({
  view,
  swapHref,
  overLimitTeamIds,
}: {
  view: MatrixData
  /** Opens the replacement panel for a player (section 7.7). Null disables it. */
  swapHref: ((playerId: number) => string) | null
  /** Clubs over the three-per-club limit, for the row accent (section 7.7). */
  overLimitTeamIds: Set<number>
}) {
  const { squad, startGameweek, horizon } = view

  // The horizon drives the columns, not just the score: selecting five
  // gameweeks shows five columns. Gameweeks outside the window are not dimmed
  // or banded, they are simply not rendered, so the matrix only ever shows the
  // run being scored. "All" is a horizon covering the rest of the season.
  const columns = horizonGameweeks(startGameweek, horizon)
  const GW_COLUMN = gameweekColumnWidth(columns.length)

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
          the fifteen players over gameweeks {startGameweek} to{' '}
          {columns[columns.length - 1] ?? startGameweek}, with a Fixture Score
          across that run.
        </caption>

        <thead>
          <tr className={MATRIX_HEADER_HEIGHT}>
            <th
              scope="col"
              className={`sticky left-0 z-20 border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-left font-medium text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${PLAYER_COLUMN}`}
            >
              Player
            </th>
            <th
              scope="col"
              className={`sticky z-20 hidden border-b border-r border-neutral-200 bg-neutral-50 px-2 py-2 text-right font-medium text-neutral-600 sm:table-cell dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${MATRIX_PLAYER_COLUMN_END} ${SCORE_COLUMN}`}
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
                className={`border-b border-neutral-200 bg-neutral-50 px-1 py-2 text-center text-xs font-medium tabular-nums text-neutral-600 dark:border-neutral-800 dark:bg-neutral-800 dark:text-neutral-300 ${GW_COLUMN}`}
              >
                <span className="sr-only">Gameweek </span>
                <span aria-hidden>GW</span>
                {gameweek}
              </th>
            ))}
            {/* Absorbs whatever width is left over. Without it a short horizon
                stretches the real columns to fill the page, which leaves a
                one-gameweek view with a 500px fixture cell. When the table is
                wider than its container this collapses to nothing. */}
            <th
              aria-hidden
              className="w-auto border-b border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-800"
            />
          </tr>
        </thead>

        <tbody>
          {squad.startingXi.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              view={view}
              columns={columns}
              gwColumn={GW_COLUMN}
              swapHref={swapHref}
              overLimitTeamIds={overLimitTeamIds}
            />
          ))}

          <tr>
            <th
              scope="colgroup"
              colSpan={columns.length + 3}
              className="sticky left-0 border-y border-neutral-200 bg-neutral-100 px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/70 dark:text-neutral-400"
            >
              Bench
            </th>
          </tr>

          {squad.bench.map((player) => (
            <PlayerRow
              key={player.id}
              player={player}
              view={view}
              columns={columns}
              gwColumn={GW_COLUMN}
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

function PlayerRow({
  player,
  view,
  columns,
  gwColumn,
  swapHref,
  overLimitTeamIds,
  isBench = false,
}: {
  player: SquadPlayer
  view: MatrixData
  /** The horizon window, not every gameweek. Set by the table. */
  columns: number[]
  gwColumn: string
  swapHref: ((playerId: number) => string) | null
  overLimitTeamIds: Set<number>
  isBench?: boolean
}) {
  const { fixtures, startGameweek, horizon } = view
  const summary = fixtureScore(fixtures, player.teamId, startGameweek, horizon)

  // Sticky cells sit above the scrolling ones, so they need their own opaque
  // background rather than inheriting the row's.
  const rowBackground = isBench
    ? 'bg-neutral-50 dark:bg-neutral-900/60'
    : 'bg-white dark:bg-neutral-900'

  return (
    <tr className={MATRIX_ROW_HEIGHT}>
      <th
        scope="row"
        className={`sticky left-0 z-10 border-b border-neutral-100 px-3 py-1.5 text-left font-normal dark:border-neutral-800/70 ${rowBackground} ${PLAYER_COLUMN} ${overLimitAccent(player.teamId, overLimitTeamIds)}`}
      >
        <span className="flex items-baseline gap-1.5">
          <PlayerName
            name={player.name}
            href={swapHref === null ? null : swapHref(player.id)}
          />
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
        className={`sticky z-10 hidden border-b border-r border-neutral-200 px-2 py-1.5 text-right sm:table-cell dark:border-neutral-800 ${rowBackground} ${MATRIX_PLAYER_COLUMN_END} ${SCORE_COLUMN}`}
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
          className={`h-px border-b border-l border-neutral-100 p-0 dark:border-neutral-800/70 ${gwColumn}`}
        >
          <FixtureCell
            fixtures={fixturesFor(fixtures, player.teamId, gameweek)}
          />
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
