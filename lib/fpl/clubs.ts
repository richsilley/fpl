import 'server-only'

import {
  fixtureScore,
  fixturesFor,
  horizonGameweeks,
  type FixtureIndex,
  type FixtureScore,
  type Horizon,
  type TeamFixture,
} from './fixtures'
import { splitClubSort, type ClubSort } from './params'
import type { Squad, SquadPlayer } from './squad'
import type { FplTeam } from './types'

/**
 * View 4, Club Blocks (section 7.5). "Who should I buy?"
 *
 * Section 4 calls this the one deliberate exception to the fifteen-player row
 * set: it needs twenty club rows, because a squad-shaped table structurally
 * cannot answer a question about players you do not own.
 *
 * The scoring is the same Fixture Score as the Fixtures view, over the same
 * horizon and the same prebuilt index, so the two views can never disagree.
 */

export type ClubBlock = {
  teamId: number
  name: string
  shortName: string
  score: FixtureScore
  /**
   * Fixtures per gameweek in the horizon, so a reader can see where the score
   * came from. Empty is a blank, two is a double (section 6.5).
   */
  fixtures: TeamFixture[][]
  /** Squad players from this club. At most three can be held (section 7.5). */
  owned: SquadPlayer[]
}

/**
 * The FPL rule the owned count exists to surface (section 7.5).
 *
 * Re-exported from `scratch.ts`, which needs it too and, unlike this module,
 * must stay importable from the client.
 */
export { MAX_PLAYERS_PER_CLUB } from './scratch'

export function buildClubBlocks({
  teams,
  fixtures,
  squad,
  startGameweek,
  horizon,
  sort,
}: {
  teams: FplTeam[]
  fixtures: FixtureIndex
  squad: Squad
  startGameweek: number
  horizon: Horizon
  sort: ClubSort
}): ClubBlock[] {
  // The horizon selects the columns, exactly as it does in the Fixtures view,
  // so the two stay the same shape and the cells on screen are always the ones
  // the score is computed from.
  const columns = horizonGameweeks(startGameweek, horizon)
  // Bench players count towards the three-per-club limit just as starters do,
  // so this walks the whole fifteen rather than the starting eleven.
  const squadByClub = new Map<number, SquadPlayer[]>()
  for (const player of [...squad.startingXi, ...squad.bench]) {
    const held = squadByClub.get(player.teamId) ?? []
    held.push(player)
    squadByClub.set(player.teamId, held)
  }

  const blocks = teams.map((team) => ({
    teamId: team.id,
    name: team.name,
    shortName: team.short_name,
    score: fixtureScore(fixtures, team.id, startGameweek, horizon),
    fixtures: columns.map((gameweek) =>
      fixturesFor(fixtures, team.id, gameweek)
    ),
    owned: squadByClub.get(team.id) ?? [],
  }))

  return sortClubBlocks(blocks, sort)
}

function sortClubBlocks(blocks: ClubBlock[], sort: ClubSort): ClubBlock[] {
  const { field, descending } = splitClubSort(sort)
  const direction = descending ? -1 : 1

  return [...blocks].sort((a, b) => {
    const primary =
      field === 'club'
        ? a.name.localeCompare(b.name)
        : field === 'owned'
          ? a.owned.length - b.owned.length
          : a.score.score - b.score.score

    if (primary !== 0) {
      return primary * direction
    }

    // Ties are common: two clubs often share a score, and most clubs have no
    // players owned at all. Falling back to the club name keeps the order
    // stable rather than leaving it to the sort implementation.
    return a.name.localeCompare(b.name)
  })
}
