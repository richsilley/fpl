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

/**
 * Assembles what a view renders from the fifteen rows plus its own columns.
 */

export type FixturesView = {
  squad: Squad
  fixtures: FixtureIndex
  /** Leftmost gameweek column, and where the Fixture Score horizon starts. */
  startGameweek: number
  /** Every gameweek column: `startGameweek` through GW38 (section 7.2). */
  columns: number[]
  /** The horizon actually applied, after clamping to the season's end. */
  horizon: Horizon
  /** Gameweeks left to play: the largest horizon the control accepts. */
  maxHorizon: number
}

export async function loadFixturesView(
  managerId: number,
  horizon: Horizon
): Promise<FixturesView> {
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
    startGameweek,
    columns: gameweekColumns(startGameweek),
    // Section 7.6: a horizon past the end of the season clamps to what is
    // left rather than erroring.
    horizon: clampHorizon(horizon, startGameweek),
    maxHorizon: maxHorizon(startGameweek),
  }
}
