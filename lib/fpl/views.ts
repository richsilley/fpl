import 'server-only'

import { getBootstrap, getFixtures } from './api'
import {
  buildFixtureIndex,
  clampHorizon,
  firstUpcomingGameweek,
  gameweekColumns,
  maxHorizon,
  type FixtureIndex,
  type Horizon,
} from './fixtures'
import { loadSquad, type Squad } from './squad'
import type { FplTeam } from './types'

/**
 * The data every view is built from: the fifteen rows (section 4) plus the
 * reference data the columns are drawn from.
 *
 * One loader for all views rather than one each. The Fixtures view and Club
 * Blocks read the same fixture index over the same horizon, so sharing it
 * means one fetch, and means the two can never disagree about a score.
 */
export type MatrixData = {
  squad: Squad
  fixtures: FixtureIndex
  /** All twenty clubs: the row set for Club Blocks (sections 4 and 7.5). */
  teams: FplTeam[]
  /** Leftmost gameweek column, and where the Fixture Score horizon starts. */
  startGameweek: number
  /** Every gameweek column: `startGameweek` through GW38 (section 7.2). */
  columns: number[]
  /** The horizon actually applied, after clamping to the season's end. */
  horizon: Horizon
  /** Gameweeks left to play: the largest horizon the control accepts. */
  maxHorizon: number
}

export async function loadMatrixData(
  managerId: number,
  horizon: Horizon
): Promise<MatrixData> {
  // `getBootstrap` is cached, so asking for it alongside `loadSquad` costs a
  // cache read rather than a second trip to the FPL API, and the fixtures
  // fetch overlaps both.
  const [squad, fixtures, bootstrap] = await Promise.all([
    loadSquad(managerId),
    getFixtures(),
    getBootstrap(),
  ])

  const startGameweek = firstUpcomingGameweek(bootstrap.events)

  return {
    squad,
    fixtures: buildFixtureIndex(fixtures, bootstrap.teams),
    teams: bootstrap.teams,
    startGameweek,
    columns: gameweekColumns(startGameweek),
    // Section 7.6: a horizon past the end of the season clamps to what is
    // left rather than erroring.
    horizon: clampHorizon(horizon, startGameweek),
    maxHorizon: maxHorizon(startGameweek),
  }
}
