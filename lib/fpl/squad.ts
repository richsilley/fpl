import 'server-only'

import { currentGameweek, getBootstrap, getEntry, getPicks } from './api'
import { FplApiError } from './errors'
import type { FplBootstrap, FplElement, FplEntry } from './types'

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
  /** GKP, DEF, MID or FWD. Column headings and thresholds. */
  position: string
  /** "Goalkeeper", "Defender". Prose that addresses the reader. */
  positionName: string
  /** Club ID, for joining to fixtures and to the three-per-club limit. */
  teamId: number
  /** Club short name, e.g. "ARS". */
  club: string
  clubName: string
  /** Price in tenths (constraint 4). Use `formatPrice` to display. */
  price: number
  /** Price change this gameweek, in tenths. Signed (section 7.3). */
  priceChangeEvent: number
  /** Price change since the season started, in tenths. Signed (section 7.3). */
  priceChangeStart: number
  totalPoints: number
  form: string
  /** Points per game, as the API's string so its precision is preserved. */
  pointsPerGame: string
  minutes: number
  expectedGoals: string
  expectedAssists: string
  expectedGoalInvolvements: string
  /** Qualifying defensive actions this season. */
  defensiveContribution: number
  /** The same per 90 minutes, straight from the API. See DefCon in 7.3. */
  defensiveContributionPer90: number
  /**
   * **FPL's** expected points for the next gameweek, not ours (section 7.3).
   *
   * Parsed on the way in rather than kept as the API's string, because unlike
   * `form` and `pointsPerGame` there is no upstream formatting worth
   * preserving: it is one decimal place either way.
   */
  expectedPointsNext: number
  /**
   * Percentage of all FPL managers owning this player, as the API's string.
   * The global reference population for the Ownership view (section 7.4).
   */
  selectedByPercent: string
  /**
   * Net transfers across every FPL manager this gameweek, in minus out.
   *
   * The market's own opinion, and the only figure on these tables that is not
   * derived from something that has already happened on a pitch. Positive is
   * the market buying.
   */
  netTransfers: number
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
  /** The manager's own FPL entry ID, for finding them in league standings. */
  id: number
  /** The person, e.g. "Rich Silley". */
  managerName: string
  /** The team, e.g. "Troy Story". */
  teamName: string
  /** Overall rank as at the gameweek shown. Null before any is published. */
  overallRank: number | null
  /** Points scored in the gameweek shown. */
  gameweekPoints: number
  /** Rank for that gameweek alone. Null until the gameweek is scored. */
  gameweekRank: number | null
  /** Season points total as at the gameweek shown. */
  overallPoints: number
  /**
   * Money in the bank, in tenths (constraint 4). The starting point for the
   * scratch-squad budget (section 7.7).
   *
   * A **last-deadline** figure: FPL does not republish it as prices move, so
   * it is right at the moment the gameweek locked and drifts from then on.
   * The UI has to say so rather than presenting it as live.
   */
  bank: number
  /** Squad value at that same deadline, in tenths. Same lag as `bank`. */
  squadValue: number
  gameweek: number
  /**
   * The manager's own mini leagues, so the Ownership view can offer them
   * directly instead of asking for a league ID. FPL enrols everyone into
   * global leagues (Overall, their country, sponsors); those are filtered out
   * because comparing against millions of managers is what global mode
   * already does, and each would be capped to its top 50 anyway.
   */
  leagues: { id: number; name: string; size: number | null }[]
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
      id: entry.id,
      managerName:
        `${entry.player_first_name} ${entry.player_last_name}`.trim(),
      teamName: entry.name,
      // From the picks, not the entry summary, so rank and points describe the
      // gameweek whose squad is on screen.
      overallRank: picks.entry_history.overall_rank,
      gameweekPoints: picks.entry_history.points,
      gameweekRank: picks.entry_history.rank,
      bank: picks.entry_history.bank,
      squadValue: picks.entry_history.value,
      overallPoints: picks.entry_history.total_points,
      gameweek,
      leagues: classicLeagues(entry),
    },
    startingXi: players.filter((player) => player.squadPosition <= 11),
    bench: players.filter((player) => player.squadPosition > 11),
  }
}

/**
 * Builds a squad row for a player who is not in the picks payload.
 *
 * The scratch squad (section 7.7) substitutes players the manager has not
 * actually bought, so there is no `pick` for them. Everything else about the
 * row is identical, which is what lets every view render a scratch squad
 * without knowing it is one.
 *
 * Exported so `scratch.ts` can stay free of `server-only` — it is handed this
 * as a callback rather than importing the loader.
 */
export function squadPlayerFrom(
  element: FplElement,
  slot: Pick<SquadPlayer, 'squadPosition' | 'isCaptain' | 'isViceCaptain'>,
  bootstrap: FplBootstrap
): SquadPlayer {
  return toSquadPlayer(
    element,
    {
      position: slot.squadPosition,
      is_captain: slot.isCaptain,
      is_vice_captain: slot.isViceCaptain,
    },
    bootstrap
  )
}

/**
 * `ep_next` as a number.
 *
 * The API sends `"5.0"` today, but the field is numeric by nature and nothing
 * stops it arriving as `5`, so both are accepted. Anything unreadable becomes
 * 0, which renders as a real "0.0" — correct, since FPL genuinely predicts
 * zero for anyone not expected to play.
 */
function parseExpectedPoints(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * The leagues a manager actually joined, as both the Ownership view and the
 * view-as picker offer them.
 *
 * FPL enrols everyone into global leagues (Overall, their country, sponsors)
 * and marks those `s`. Only `x`, the ones people create, are useful here:
 * comparing against a few million managers is what global mode already does,
 * and no one wants to pick a rival out of a list of three million.
 */
export function classicLeagues(entry: FplEntry): SquadManager['leagues'] {
  return (entry.leagues?.classic ?? [])
    .filter((league) => league.league_type === 'x')
    .map((league) => ({
      id: league.id,
      name: league.name,
      size: league.rank_count,
    }))
}

/**
 * The same list for a manager whose squad is not being rendered.
 *
 * The view-as picker offers *your* leagues while showing someone else's squad,
 * so it cannot read them off the loaded squad. `getEntry` is cached, and when
 * you are viewing your own team this is the same call `loadSquad` just made.
 */
export async function loadManagerLeagues(
  managerId: number
): Promise<SquadManager['leagues']> {
  return classicLeagues(await getEntry(managerId))
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
    positionName: position?.singular_name ?? 'player',
    teamId: element.team,
    club: club?.short_name ?? '?',
    clubName: club?.name ?? 'Unknown club',
    price: element.now_cost,
    priceChangeEvent: element.cost_change_event,
    priceChangeStart: element.cost_change_start,
    totalPoints: element.total_points,
    form: element.form,
    pointsPerGame: element.points_per_game,
    minutes: element.minutes,
    expectedGoals: element.expected_goals,
    expectedAssists: element.expected_assists,
    expectedGoalInvolvements: element.expected_goal_involvements,
    defensiveContribution: element.defensive_contribution,
    defensiveContributionPer90: element.defensive_contribution_per_90,
    expectedPointsNext: parseExpectedPoints(element.ep_next),
    selectedByPercent: element.selected_by_percent,
    netTransfers: element.transfers_in_event - element.transfers_out_event,
    squadPosition: pick.position,
    isCaptain: pick.is_captain,
    isViceCaptain: pick.is_vice_captain,
    status: element.status,
    news: element.news,
    chanceOfPlaying: element.chance_of_playing_next_round,
  }
}
