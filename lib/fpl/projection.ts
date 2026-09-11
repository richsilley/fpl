import 'server-only'

import type { FplBootstrap, FplBootstrapRaw, FplElement } from './types'

/**
 * Trims `bootstrap-static/` down to what v1 reads.
 *
 * Two reasons, in order of importance:
 *
 *  1. **It makes the endpoint cacheable at all.** A Next.js cache entry is
 *     capped at 2MB. The upstream payload serialises to about 2.31MB, so it
 *     was rejected outright and every request fell through to the FPL API,
 *     which is exactly what section 8.3 exists to prevent. Caching the
 *     projection instead puts the entry an order of magnitude under the
 *     ceiling.
 *  2. **Mobile is the primary target** (section 8.5), and the untrimmed
 *     payload is a 1.65MB download.
 *
 * Practically all of the weight is `elements`: about 100 fields for each of
 * ~700 players, of which sections 7.2 to 7.5 name the twenty below. `events`,
 * `teams` and `element_types` are passed through whole, since together they
 * are around 35KB and it is not worth guessing what the views want from them.
 *
 * Adding a field here is cheap. If a view needs one, add it to `FplElement`
 * and to the pick below, and update the list in CLAUDE.md.
 */
export function projectBootstrap(raw: FplBootstrapRaw): FplBootstrap {
  return {
    events: raw.events,
    teams: raw.teams,
    element_types: raw.element_types,
    total_players: raw.total_players,
    elements: raw.elements.map(projectElement),
  }
}

/**
 * Picks fields explicitly rather than deleting unwanted ones, so a new
 * upstream field cannot silently reappear in the response, and so TypeScript
 * fails the build if `FplElement` and this function drift apart.
 */
function projectElement(element: FplElement): FplElement {
  return {
    // Identity and joins
    id: element.id,
    web_name: element.web_name,
    first_name: element.first_name,
    second_name: element.second_name,
    team: element.team,
    element_type: element.element_type,

    // Price, in tenths (constraint 4). Form view, section 7.3.
    now_cost: element.now_cost,
    cost_change_event: element.cost_change_event,
    cost_change_start: element.cost_change_start,

    // Form and returns, section 7.3
    form: element.form,
    total_points: element.total_points,
    points_per_game: element.points_per_game,
    minutes: element.minutes,
    expected_goals: element.expected_goals,
    expected_assists: element.expected_assists,
    expected_goal_involvements: element.expected_goal_involvements,

    // Defensive contribution, section 7.3
    defensive_contribution: element.defensive_contribution,
    defensive_contribution_per_90: element.defensive_contribution_per_90,

    // FPL's own expected points for the next gameweek, section 7.3
    ep_next: element.ep_next,

    // Ownership, section 7.4
    selected_by_percent: element.selected_by_percent,

    // Market momentum, section 7.9's second gate.
    transfers_in_event: element.transfers_in_event,
    transfers_out_event: element.transfers_out_event,

    // Availability, section 7.3
    status: element.status,
    news: element.news,
    chance_of_playing_next_round: element.chance_of_playing_next_round,
  }
}
