import 'server-only'

import { currentGameweek, getBootstrap, getEntry, getPicks } from './api'
import { FplApiError } from './errors'
import type { FplBootstrap, FplElement } from './types'

/**
 * Loads a manager's fifteen players and joins them to the player, club and
 * position reference data.
 *
 * Section 4: "Rows are always the fifteen players. They load once and never
 * change within a session." This is that row set. Views change the columns
 * around it, so anything here should be what every view needs, not what one
 * view needs.
 */

export type SquadPlayer = {
  /** Player ID, `element` in the picks payload. */
  id: number
  /** Short display name, e.g. "Saka". */
  name: string
  fullName: string
  /** GKP, DEF, MID or FWD. */
  position: string
  /** Club ID, for joining to fixtures and to the three-per-club limit. */
  teamId: number
  /** Club short name, e.g. "ARS". */
  club: string
  clubName: string
  /** Price in tenths (constraint 4). Use `formatPrice` to display. */
  price: number
  totalPoints: number
  form: string
  /** 1 to 15. 1 to 11 start, 12 to 15 are the bench in order. */
  squadPosition: number
  isCaptain: boolean
  isViceCaptain: boolean
  /** `a` available, `d` doubtful, `i`/`o`/`s`/`u` unavailable. */
  status: string
  news: string
  chanceOfPlaying: number | null
}

export type SquadManager = {
  /** The person, e.g. "Rich Silley". */
  managerName: string
  /** The team, e.g. "Troy Story". */
  teamName: string
  /** Overall rank as at the gameweek shown. Null before any is published. */
  overallRank: number | null
  /** Points scored in the gameweek shown. */
  gameweekPoints: number
  gameweek: number
}

export type Squad = {
  manager: SquadManager
  /** Squad positions 1 to 11, in order. */
  startingXi: SquadPlayer[]
  /** Squad positions 12 to 15, in bench order. */
  bench: SquadPlayer[]
}

export async function loadSquad(managerId: number): Promise<Squad> {
  // Independent of each other, and both are needed before the picks call, so
  // the two round trips overlap. An invalid ID fails at `getEntry`.
  const [entry, bootstrap] = await Promise.all([
    getEntry(managerId),
    getBootstrap(),
  ])

  const gameweek = currentGameweek(bootstrap.events)
  const picks = await getPicks(managerId, gameweek, bootstrap.events)

  const players = picks.picks
    .map((pick) => {
      const element = bootstrap.elements.find(
        (candidate) => candidate.id === pick.element
      )
      if (!element) {
        // Only reachable if bootstrap and picks disagree, which happens
        // briefly when a player is removed from the game mid-gameweek.
        throw new FplApiError(
          'unavailable',
          `Player ${pick.element} is in the squad but missing from the player list. This usually clears within the hour.`
        )
      }
      return toSquadPlayer(element, pick, bootstrap)
    })
    // The API returns picks in squad order already, but section 7.1 depends on
    // that order, so make it explicit rather than inherited.
    .sort((a, b) => a.squadPosition - b.squadPosition)

  return {
    manager: {
      managerName:
        `${entry.player_first_name} ${entry.player_last_name}`.trim(),
      teamName: entry.name,
      // From the picks, not the entry summary, so rank and points describe the
      // gameweek whose squad is on screen.
      overallRank: picks.entry_history.overall_rank,
      gameweekPoints: picks.entry_history.points,
      gameweek,
    },
    startingXi: players.filter((player) => player.squadPosition <= 11),
    bench: players.filter((player) => player.squadPosition > 11),
  }
}

function toSquadPlayer(
  element: FplElement,
  pick: { position: number; is_captain: boolean; is_vice_captain: boolean },
  bootstrap: FplBootstrap
): SquadPlayer {
  const club = bootstrap.teams.find((team) => team.id === element.team)
  const position = bootstrap.element_types.find(
    (type) => type.id === element.element_type
  )

  return {
    id: element.id,
    name: element.web_name,
    fullName: `${element.first_name} ${element.second_name}`.trim(),
    position: position?.singular_name_short ?? '?',
    teamId: element.team,
    club: club?.short_name ?? '?',
    clubName: club?.name ?? 'Unknown club',
    price: element.now_cost,
    totalPoints: element.total_points,
    form: element.form,
    squadPosition: pick.position,
    isCaptain: pick.is_captain,
    isViceCaptain: pick.is_vice_captain,
    status: element.status,
    news: element.news,
    chanceOfPlaying: element.chance_of_playing_next_round,
  }
}
