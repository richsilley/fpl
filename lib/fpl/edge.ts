import 'server-only'

import { projectPoints, type Projection } from './edge-projection'
import {
  meanOwnership,
  strategyValue,
  type RiskLevel,
  type StrategyValue,
} from './edge-strategy'
import { fixturesFor, horizonGameweeks, type FixtureIndex } from './fixtures'
import type { Horizon } from './horizon'
import { parseOwnership, type FieldPosition } from './ownership'
import type { ReferencePopulation } from './reference'
import type { SquadPlayer } from './squad'
import type { FplBootstrap, FplElement } from './types'

/**
 * The Edge (section 7.9): ranked buy and sell suggestions.
 *
 * This module only *assembles*. The two decisions live in `edge-projection.ts`
 * (how many points) and `edge-strategy.ts` (what they are worth here), and
 * nothing in this file adjusts either. Adding a weight or a fudge factor here
 * would defeat the separation both files exist to protect.
 */

/**
 * Minimum projected points per gameweek before a player is worth suggesting.
 *
 * Section 7.9 asks for a quality threshold rather than a fixed list length,
 * and for the buy list to be honestly empty in a settled week. This is that
 * threshold: below it a suggestion is noise, and padding the list to look
 * useful is how a recommendation view loses trust.
 */
const BUY_THRESHOLD_PER_GAMEWEEK = 3.4

/**
 * Minutes per match below which a player is not a real option, whatever the
 * arithmetic says.
 *
 * A fringe player with a good xGI per 90 off twenty minutes a week projects
 * respectably and is not a transfer anyone should make. The rate is per match
 * their club played, so it already accounts for rotation.
 */
const MIN_MINUTES_PER_MATCH = 45

/** Never render more than this. Beyond it the list stops being a shortlist. */
const MAX_BUY_SUGGESTIONS = 40

export type EdgeRow = {
  playerId: number
  name: string
  club: string
  clubShort: string
  teamId: number
  position: string
  /** Price in tenths (constraint 4). */
  price: number
  projection: Projection
  strategy: StrategyValue
  /** Fixture Score over the horizon, so fixtures can be seen as the cause. */
  fixtureScore: number
  fixtureCount: number
  /** Season form, as FPL publishes it. */
  form: number
  /** Ownership within the selected scope. */
  ownership: number
  /** Ownership across all FPL managers, for contrast in league or rival mode. */
  globalOwnership: number
}

export type EdgeLists = {
  buy: EdgeRow[]
  sell: EdgeRow[]
  /** Mean ownership of the ranked candidates: Layer 2's reference point. */
  populationMean: number
  /** How many candidates were considered before the threshold cut them down. */
  considered: number
}

export function buildEdgeLists({
  bootstrap,
  fixtures,
  squad,
  startGameweek,
  horizon,
  matchesPlayed,
  reference,
  risk,
}: {
  bootstrap: FplBootstrap
  fixtures: FixtureIndex
  squad: SquadPlayer[]
  startGameweek: number
  horizon: Horizon
  matchesPlayed: Map<number, number>
  reference: ReferencePopulation
  risk: RiskLevel
}): EdgeLists {
  const gameweeks = horizonGameweeks(startGameweek, horizon)
  const owned = new Set(squad.map((player) => player.id))
  const positionOf = new Map(
    bootstrap.element_types.map((type) => [type.id, type.singular_name_short])
  )
  const clubOf = new Map(bootstrap.teams.map((team) => [team.id, team]))
  const standing = reference.standing.position

  // Every player in the game is a candidate, and every one is projected. The
  // cost is arithmetic over about 650 rows, which is nothing next to the
  // fetches that produced them.
  const projected = bootstrap.elements.map((element) => {
    const position = positionOf.get(element.element_type) ?? '?'
    const played = matchesPlayed.get(element.team) ?? 0
    const teamFixtures = gameweeks.flatMap((gameweek) =>
      fixturesFor(fixtures, element.team, gameweek)
    )

    return {
      element,
      position,
      played,
      teamFixtures,
      projection: projectPoints(
        {
          position,
          minutes: element.minutes,
          matchesPlayed: played,
          status: element.status,
          chanceOfPlayingNextRound: element.chance_of_playing_next_round,
          expectedGoalInvolvementsPer90: perNinety(
            element.expected_goal_involvements,
            element.minutes
          ),
          defensiveContributionPer90: element.defensive_contribution_per_90,
        },
        teamFixtures
      ),
    }
  })

  // Layer 2 measures each player against the mean of the field being ranked,
  // so it is computed once over every candidate rather than per list. Ranking
  // the buy list against its own mean and the sell list against another would
  // make the two incomparable, and a swap is a comparison between them.
  const populationMean = meanOwnership(
    projected.map((row) => reference.ownershipOf(row.element.id))
  )

  const toRow = (entry: (typeof projected)[number]): EdgeRow => {
    const { element, position, teamFixtures, projection } = entry
    const club = clubOf.get(element.team)
    const ownership = reference.ownershipOf(element.id)

    return {
      playerId: element.id,
      name: element.web_name,
      club: club?.name ?? '',
      clubShort: club?.short_name ?? '',
      teamId: element.team,
      position,
      price: element.now_cost,
      projection,
      strategy: strategyValue({
        projectedPoints: projection.points,
        ownership,
        populationMean,
        position: standing,
        risk,
      }),
      fixtureScore: fixtureScoreOver(teamFixtures, gameweeks.length),
      fixtureCount: teamFixtures.length,
      form: Number(element.form) || 0,
      ownership,
      globalOwnership: parseOwnership(element.selected_by_percent),
    }
  }

  const threshold = BUY_THRESHOLD_PER_GAMEWEEK * Math.max(1, gameweeks.length)

  const buy = projected
    .filter((entry) => !owned.has(entry.element.id))
    .filter(
      (entry) =>
        minutesRate(entry.element, entry.played) >= MIN_MINUTES_PER_MATCH
    )
    .map(toRow)
    .filter((row) => row.projection.points >= threshold)
    .sort((a, b) => b.strategy.value - a.strategy.value)
    .slice(0, MAX_BUY_SUGGESTIONS)

  // The sell list is the fifteen, worst first, and is never filtered: the
  // squad is the squad, and a view that hid a player because he scored badly
  // would be hiding exactly the row the reader came for.
  const byId = new Map(projected.map((entry) => [entry.element.id, entry]))
  const sell = squad
    .map((player) => byId.get(player.id))
    .filter((entry) => entry !== undefined)
    .map(toRow)
    .sort((a, b) => a.strategy.value - b.strategy.value)

  return {
    buy,
    sell,
    populationMean,
    considered: projected.length - owned.size,
  }
}

/** Section 6.1's score, over the fixtures already gathered for the horizon. */
function fixtureScoreOver(
  fixtures: TeamFixtureLike[],
  gameweeks: number
): number {
  if (gameweeks === 0) {
    return 0
  }
  const total = fixtures.reduce((sum, fixture) => sum + fixture.value, 0)
  return (total / gameweeks) * 2
}

type TeamFixtureLike = { value: number }

/** Per 90 from a season total, which is how the projection carries xGI. */
function perNinety(total: string | number, minutes: number): number {
  const value = typeof total === 'number' ? total : Number(total)
  if (!Number.isFinite(value) || minutes <= 0) {
    return 0
  }
  return (value / minutes) * 90
}

function minutesRate(element: FplElement, matchesPlayed: number): number {
  return matchesPlayed <= 0 ? 0 : element.minutes / matchesPlayed
}

/** Re-exported so the page does not need to know which layer owns what. */
export type { FieldPosition }
