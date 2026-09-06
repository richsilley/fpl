import 'server-only'

import { fixtureScore, type FixtureIndex } from './fixtures'
import type { Horizon } from './horizon'
import { MAX_PLAYERS_PER_CLUB } from './scratch'
import { parseOwnership } from './ownership'
import type { FieldPosition } from './ownership'
import { splitFormSort, type FormSort, type ViewId } from './params'
import type { SquadPlayer } from './squad'
import type { FplBootstrap, FplElement } from './types'

/**
 * Candidate replacements for one squad player (section 7.7).
 *
 * ## Ranked by whatever the reader is already looking at
 *
 * Section 7.7: "ranked by the metric of the view I am currently in", reusing
 * the column sort when one is applied. The point is that the panel opens
 * already ordered by the question the reader was asking a moment ago. Someone
 * who has just sorted Form by minutes is looking for a starter, and should not
 * have to say so twice.
 *
 * Only the three player views open a panel. Club Blocks has club rows, so
 * there is no player to replace.
 *
 * ## Everyone in the game, in position
 *
 * Section 7.7 requires the full list, not a shortlist, and requires that
 * unaffordable players and three-per-club breaches still appear. Filtering
 * either out would make the panel a validator, which is the opposite of what
 * it is for: the reader may be part-way through funding a move, and the app
 * has no way to know which of several clubs they intend to drop from.
 */

export type Replacement = {
  id: number
  /** Display name, e.g. "Saka". */
  name: string
  /** First and last name, which is what the panel shows (section 7.7). */
  fullName: string
  club: string
  clubName: string
  teamId: number
  /** In tenths (constraint 4). */
  price: number
  /** Price minus the outgoing player's, in tenths. Signed. */
  costDifference: number
  /** FPL's expected points next gameweek (section 7.3). */
  expectedPointsNext: number
  /** The metric the list is ranked on, already formatted for display. */
  rankValue: string
  /** True when `costDifference` is within the funds available. */
  affordable: boolean
  /** True when taking them would put the squad over the club limit. */
  breachesClubLimit: boolean
  /** Already in the squad, so not a real option. */
  alreadyOwned: boolean
  /** Lowercased name and club, for the search box to match against. */
  haystack: string
}

/**
 * What the list is ordered by.
 *
 * Two names, because the panel says it twice in places of different width.
 * `label` is the sentence form for the description line ("ranked by fixture
 * score over the next 7 gameweeks"); `column` is the metric's bare name for
 * the heading above the values ("Fixture Score"). That heading used to read
 * "Ranked by", which spent a column on saying nothing the values below did
 * not already say.
 */
export type ReplacementRanking = {
  label: string
  column: string
  metric: string
}

export function rankingFor(
  view: ViewId,
  sort: FormSort,
  horizon: Horizon,
  position: FieldPosition
): ReplacementRanking {
  if (view === 'form') {
    const { field } = splitFormSort(sort)
    const label = field === 'squad' ? 'Form' : (FORM_LABELS[field] ?? 'Form')
    return { label, column: label, metric: field === 'squad' ? 'form' : field }
  }

  if (view === 'ownership') {
    // Section 7.4's direction decides which end of the ownership scale helps.
    // Ahead of the population, the crowd's players protect a lead; behind,
    // differentials are how the gap closes. The panel opens on whichever end
    // that is, so the ranking agrees with the guidance above the table.
    return position === 'behind'
      ? {
          label: 'Ownership, differentials first',
          column: 'Ownership',
          metric: 'ownership-low',
        }
      : {
          label: 'Ownership, most owned first',
          column: 'Ownership',
          metric: 'ownership-high',
        }
  }

  return {
    label: `Fixture Score over the next ${horizon} gameweek${horizon === 1 ? '' : 's'}`,
    column: 'Fixture Score',
    metric: 'fixtures',
  }
}

const FORM_LABELS: Record<string, string> = {
  price: 'Price',
  gw: 'Price change this gameweek',
  season: 'Price change this season',
  form: 'Form',
  points: 'Total points',
  ppg: 'Points per game',
  mins: 'Minutes',
  xgi: 'Expected goal involvements',
  defcon: 'Defensive contribution per 90',
  xp: 'FPL expected points',
}

export function buildReplacements({
  outgoing,
  squad,
  bootstrap,
  fixtures,
  startGameweek,
  horizon,
  ranking,
  available,
  overLimitTeamIds,
}: {
  outgoing: SquadPlayer
  /** The scratch squad as it stands, for ownership and club-limit checks. */
  squad: SquadPlayer[]
  bootstrap: FplBootstrap
  fixtures: FixtureIndex
  startGameweek: number
  horizon: Horizon
  ranking: ReplacementRanking
  /** Funds available before this swap, in tenths. */
  available: number
  overLimitTeamIds: Set<number>
}): Replacement[] {
  const clubs = new Map(bootstrap.teams.map((team) => [team.id, team]))
  const positionId = bootstrap.element_types.find(
    (type) => type.singular_name_short === outgoing.position
  )?.id

  const owned = new Set(squad.map((player) => player.id))

  // The club count the squad would have *after* the outgoing player leaves, so
  // a like-for-like swap within a club is not reported as a new breach.
  const clubCounts = new Map<number, number>()
  for (const player of squad) {
    if (player.id === outgoing.id) {
      continue
    }
    clubCounts.set(player.teamId, (clubCounts.get(player.teamId) ?? 0) + 1)
  }

  const scoreOf = rankScorer(ranking.metric, fixtures, startGameweek, horizon)

  const rows = bootstrap.elements
    .filter((element) => element.element_type === positionId)
    .map((element) => {
      const club = clubs.get(element.team)
      const costDifference = element.now_cost - outgoing.price
      const wouldHold = (clubCounts.get(element.team) ?? 0) + 1

      return {
        element,
        row: {
          id: element.id,
          name: element.web_name,
          fullName:
            `${element.first_name} ${element.second_name}`.trim() ||
            element.web_name,
          club: club?.short_name ?? '?',
          clubName: club?.name ?? 'Unknown club',
          teamId: element.team,
          price: element.now_cost,
          costDifference,
          expectedPointsNext: toNumber(element.ep_next),
          rankValue: '',
          affordable: costDifference <= available,
          // Reported, never used to filter. Includes clubs already over the
          // limit, since adding to them makes a bad situation worse.
          breachesClubLimit:
            wouldHold > MAX_PLAYERS_PER_CLUB ||
            overLimitTeamIds.has(element.team),
          alreadyOwned: owned.has(element.id),
          haystack:
            `${element.web_name} ${element.first_name} ${element.second_name} ${club?.name ?? ''} ${club?.short_name ?? ''}`.toLowerCase(),
        } satisfies Replacement,
      }
    })

  const scored = rows.map((entry) => ({
    ...entry,
    score: scoreOf(entry.element),
  }))

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      // Ties break on price, cheapest first: at equal merit the one that frees
      // money is the more useful suggestion.
      a.element.now_cost - b.element.now_cost ||
      a.row.name.localeCompare(b.row.name)
  )

  return scored.map((entry) => ({
    ...entry.row,
    rankValue: formatRank(ranking.metric, entry.element, entry.score),
  }))
}

/**
 * Higher is always better here, whatever the metric, so one comparator can
 * order every list. Metrics where low is good are negated rather than given
 * their own sort direction.
 */
function rankScorer(
  metric: string,
  fixtures: FixtureIndex,
  startGameweek: number,
  horizon: Horizon
): (element: FplElement) => number {
  switch (metric) {
    case 'fixtures':
      return (element) =>
        fixtureScore(fixtures, element.team, startGameweek, horizon).score
    case 'ownership-high':
      return (element) => parseOwnership(element.selected_by_percent)
    case 'ownership-low':
      return (element) => -parseOwnership(element.selected_by_percent)
    case 'price':
      return (element) => element.now_cost
    case 'gw':
      return (element) => element.cost_change_event
    case 'season':
      return (element) => element.cost_change_start
    case 'points':
      return (element) => element.total_points
    case 'ppg':
      return (element) => toNumber(element.points_per_game)
    case 'mins':
      return (element) => element.minutes
    case 'xgi':
      return (element) => toNumber(element.expected_goal_involvements)
    case 'defcon':
      return (element) => element.defensive_contribution_per_90
    case 'xp':
      return (element) => toNumber(element.ep_next)
    default:
      return (element) => toNumber(element.form)
  }
}

function formatRank(
  metric: string,
  element: FplElement,
  score: number
): string {
  switch (metric) {
    case 'fixtures':
      return `${score.toFixed(1)} fixture score`
    case 'ownership-high':
    case 'ownership-low':
      return `${parseOwnership(element.selected_by_percent).toFixed(1)}% owned`
    case 'price':
      return `£${(element.now_cost / 10).toFixed(1)}m`
    case 'gw':
    case 'season':
      return `${score > 0 ? '+' : ''}${(score / 10).toFixed(1)} this ${metric === 'gw' ? 'gameweek' : 'season'}`
    case 'points':
      return `${element.total_points} pts`
    case 'ppg':
      return `${element.points_per_game} per game`
    case 'mins':
      return `${element.minutes} mins`
    case 'xgi':
      return `${element.expected_goal_involvements} xGI`
    case 'defcon':
      return `${element.defensive_contribution_per_90.toFixed(1)} DefCon`
    case 'xp':
      return `${toNumber(element.ep_next).toFixed(1)} xP`
    default:
      return `${element.form} form`
  }
}

function toNumber(value: string | number): number {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}
