import 'server-only'

import { getBootstrap, getEntry, getLeagueStandings, getPicks } from './api'
import { mapWithConcurrency } from './concurrency'
import { FplApiError } from './errors'
import { fieldStanding, parseOwnership, type FieldStanding } from './ownership'
import type { SquadPlayer } from './squad'
import type { FplEvent } from './types'

/**
 * The reference population for the Ownership view (section 7.4).
 *
 * Section 7.4: "This is one function with three inputs, not three features.
 * The calculation is identical; only the denominator changes." That is taken
 * literally here. `compareOwnership` is the one function, and it never asks
 * which mode it is in. The three loaders below differ only in how they arrive
 * at an ownership lookup and a standing.
 */

export type ReferenceMode = 'global' | 'league' | 'rival'

/** Section 7.4: a mini league costs one API call per manager. */
export const LEAGUE_MANAGER_CAP = 50

/**
 * How many `picks/` calls run at once when building a league population.
 *
 * A single call takes well over a second, so fifty in series is far too slow,
 * and fifty at once is a burst of load on an API section 8.3 exists to
 * protect. Each manager's picks are then cached for the rest of the gameweek,
 * so this cost lands once per league per gameweek, not once per page view.
 */
const PICKS_CONCURRENCY = 8

export type ReferencePopulation = {
  mode: ReferenceMode
  /** Names the population in the UI, e.g. "Clare / Silley FPL". */
  label: string
  /** Managers actually compared against. The denominator. */
  size: number
  /** Ownership of a player within this population, as a percentage. */
  ownershipOf: (playerId: number) => number
  /** Where the manager sits in this population (section 7.4's direction flag). */
  standing: FieldStanding
  /** Shown when the league was bigger than the cap, or a fetch fell short. */
  notice: string | null
}

export type OwnershipRow = {
  player: SquadPlayer
  /** Ownership across all FPL managers. */
  globalPercent: number
  /** Ownership within the reference population. */
  referencePercent: number
  /** Reference minus global. Positive means the population is heavier on them. */
  difference: number
}

/**
 * The one function (section 7.4).
 *
 * It takes a population and returns a row per player. Global, league and rival
 * all come through here unchanged; only `ownershipOf` differs, which is
 * exactly the "only the denominator changes" the section describes.
 */
export function compareOwnership(
  players: SquadPlayer[],
  reference: ReferencePopulation
): OwnershipRow[] {
  return players.map((player) => {
    const globalPercent = parseOwnership(player.selectedByPercent)
    const referencePercent = reference.ownershipOf(player.id)
    return {
      player,
      globalPercent,
      referencePercent,
      difference: referencePercent - globalPercent,
    }
  })
}

/**
 * Global mode: every FPL manager.
 *
 * The population is far too large to enumerate, so ownership comes from
 * `selected_by_percent`, which is the same figure the other modes compute for
 * themselves. That makes the reference identical to the global column, so the
 * difference is always zero and the view collapses those columns (see 7.4.1).
 */
export function globalPopulation(
  playersById: Map<number, SquadPlayer>,
  overallRank: number | null,
  totalPlayers: number
): ReferencePopulation {
  return {
    mode: 'global',
    label: 'All FPL managers',
    size: totalPlayers,
    ownershipOf: (playerId) => {
      const player = playersById.get(playerId)
      return player ? parseOwnership(player.selectedByPercent) : 0
    },
    standing: fieldStanding(overallRank, totalPlayers, {
      subject: 'the field',
      crowd: 'most managers',
    }),
    notice: null,
  }
}

/**
 * League mode: the top managers in a classic league.
 *
 * Section 7.4 caps this at the top 50 by league rank, because it is one
 * `picks/` call per manager. The standings endpoint pages at exactly 50, so
 * page one is the cap, and `has_next` is how we know the league is larger.
 *
 * The manager themselves counts in the population when they are a member. The
 * figure is meant to be that league's ownership, and leaving one squad out
 * would make it neither the league's nor anyone else's.
 */
export async function leaguePopulation(
  leagueId: number,
  managerId: number,
  gameweek: number,
  events: FplEvent[]
): Promise<ReferencePopulation> {
  const standings = await getLeagueStandings(leagueId, 1)
  const entries = standings.standings.results.slice(0, LEAGUE_MANAGER_CAP)

  if (entries.length === 0) {
    throw new FplApiError(
      'not_found',
      `League ${leagueId} has no managers to compare against yet.`
    )
  }

  const { results, failures } = await mapWithConcurrency(
    entries,
    PICKS_CONCURRENCY,
    async (entry) => getPicks(entry.entry, gameweek, events)
  )

  if (results.length === 0) {
    throw new FplApiError(
      'unavailable',
      `Could not load any squads from league ${leagueId}. The FPL API may be busy.`
    )
  }

  const owners = countOwners(results.map((picks) => picks.picks))
  const size = results.length

  const notices: string[] = []
  if (standings.standings.has_next) {
    notices.push(
      `This league has more than ${LEAGUE_MANAGER_CAP} managers. The comparison covers the top ${LEAGUE_MANAGER_CAP} by league rank only.`
    )
  }
  if (failures > 0) {
    notices.push(
      `${failures} squad${failures === 1 ? '' : 's'} could not be loaded and ${failures === 1 ? 'is' : 'are'} left out of the comparison.`
    )
  }

  // The manager's rank inside the compared group, not their rank in the whole
  // league, so the direction flag matches the population actually on screen.
  const position = entries.findIndex((entry) => entry.entry === managerId)

  return {
    mode: 'league',
    label: standings.league.name,
    size,
    ownershipOf: (playerId) => percentOf(owners.get(playerId) ?? 0, size),
    standing: fieldStanding(
      position === -1 ? null : position + 1,
      entries.length,
      { subject: 'this league', crowd: 'most of the league' }
    ),
    notice: notices.length > 0 ? notices.join(' ') : null,
  }
}

/**
 * Rival mode: one manager.
 *
 * A population of one, so ownership is 0 or 100 and the difference against
 * global is the whole signal. Ahead or behind is decided on overall rank,
 * since a two-manager population has no other ordering.
 */
export async function rivalPopulation(
  rivalId: number,
  myOverallRank: number | null,
  gameweek: number,
  events: FplEvent[]
): Promise<ReferencePopulation> {
  const [rivalEntry, rivalPicks] = await Promise.all([
    getEntry(rivalId),
    getPicks(rivalId, gameweek, events),
  ])

  const owners = countOwners([rivalPicks.picks])
  const rivalRank = rivalEntry.summary_overall_rank

  // Lower rank number is better. Unknown on either side means no call.
  const rank =
    myOverallRank === null || rivalRank === null
      ? null
      : myOverallRank <= rivalRank
        ? 1
        : 2

  return {
    mode: 'rival',
    label: rivalEntry.name,
    size: 1,
    ownershipOf: (playerId) => percentOf(owners.get(playerId) ?? 0, 1),
    standing: fieldStanding(rank, 2, {
      subject: 'this rival',
      crowd: 'they',
    }),
    notice: null,
  }
}

function countOwners(squads: { element: number }[][]): Map<number, number> {
  const owners = new Map<number, number>()
  for (const squad of squads) {
    for (const pick of squad) {
      owners.set(pick.element, (owners.get(pick.element) ?? 0) + 1)
    }
  }
  return owners
}

function percentOf(count: number, size: number): number {
  return size < 1 ? 0 : (count / size) * 100
}

/** One entry in the rival dropdown (section 7.4). */
export type LeagueMember = {
  /** Manager ID, which is what the `rival` parameter carries. */
  id: number
  /** The team, e.g. "Troy Story". */
  teamName: string
  /** The person, e.g. "Rich Silley". */
  managerName: string
  rank: number
}

/**
 * The league's managers, for the rival dropdown.
 *
 * **This makes no API call of its own.** `getLeagueStandings` is the same
 * cached request `leaguePopulation` makes, and the standings row already
 * carries `entry`, `entry_name` and `player_name`, which is everything the
 * dropdown shows. Picking a rival from a league you can already compare
 * against therefore costs nothing beyond the one `picks/` call for them.
 *
 * Capped and ordered exactly like the population, so the dropdown offers the
 * managers the league comparison actually covers and nobody else.
 */
export async function leagueMembers(
  leagueId: number,
  excludeManagerId: number
): Promise<LeagueMember[]> {
  const standings = await getLeagueStandings(leagueId, 1)

  return (
    standings.standings.results
      .slice(0, LEAGUE_MANAGER_CAP)
      .filter((entry) => entry.entry !== excludeManagerId)
      .map((entry) => ({
        id: entry.entry,
        teamName: entry.entry_name,
        managerName: entry.player_name,
        rank: entry.rank,
      }))
      // The endpoint returns them ranked already, but the dropdown order is a
      // stated requirement, so it is made explicit rather than inherited.
      .sort((a, b) => a.rank - b.rank)
  )
}

/** Resolves the gameweek and events the picks fan-out needs. */
export async function referenceContext(): Promise<{ events: FplEvent[] }> {
  const bootstrap = await getBootstrap()
  return { events: bootstrap.events }
}
