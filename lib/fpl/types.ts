/**
 * Types for the parts of the FPL API v1 consumes.
 *
 * Verified against the live API on 3 September 2026. Constraint 5 (section 5)
 * warns that response shapes occasionally change over the summer, so these
 * need a re-check each August.
 *
 * The route handlers proxy the upstream payloads unchanged, so responses carry
 * more fields than are typed here. Only what the app reads is described.
 */

/** A gameweek. */
export type FplEvent = {
  id: number
  name: string
  deadline_time: string
  /** Deadline as a Unix timestamp in seconds. */
  deadline_time_epoch: number
  finished: boolean
  data_checked: boolean
  is_previous: boolean
  /** The gameweek whose deadline has most recently passed. */
  is_current: boolean
  is_next: boolean
  average_entry_score: number
  highest_score: number | null
}

/** A Premier League club. Rows of the Club Blocks view (section 7.5). */
export type FplTeam = {
  id: number
  code: number
  name: string
  short_name: string
  /**
   * Null on the live API all season, despite the name. Kept typed so nothing
   * reads it expecting a number; use the overall strengths below instead.
   */
  strength: number | null
  /**
   * FPL's pre-season assessment of the club, roughly 1 to 5. These *are*
   * populated, unlike `strength`, `played`, `points` and `position`, which the
   * API leaves at zero or null. The custom difficulty rating uses them as its
   * prior (section 6.7).
   *
   * `teams` is passed through the bootstrap projection whole (section 5.3), so
   * these were already in the payload; only the type had not named them.
   */
  strength_overall_home: number
  strength_overall_away: number
}

/**
 * A player, as `/api/bootstrap` serves it.
 *
 * This is a projection. The upstream object carries about 100 fields; these
 * twenty are what sections 7.2 to 7.5 name. See lib/fpl/projection.ts for why
 * the endpoint trims, and CLAUDE.md for the field list.
 */
export type FplElement = {
  id: number
  web_name: string
  first_name: string
  second_name: string
  /** Club ID, joins to `FplTeam.id`. */
  team: number
  /** Position ID, joins to `FplElementType.id`. */
  element_type: number

  /** Constraint 4 (section 5): in tenths. `75` means £7.5m. */
  now_cost: number
  /** Price change this gameweek, in tenths (section 7.3). */
  cost_change_event: number
  /** Price change since season start, in tenths (section 7.3). */
  cost_change_start: number

  form: string
  total_points: number
  points_per_game: string
  minutes: number

  expected_goals: string
  expected_assists: string
  expected_goal_involvements: string

  /**
   * Defensive contribution: the count of qualifying defensive actions, and
   * the same figure per 90 minutes. Verified present on the live API on
   * 4 September 2026, and the per-90 field is a number, not a string like the
   * expected-goals fields, so it needs no derivation from minutes.
   */
  defensive_contribution: number
  defensive_contribution_per_90: number

  /**
   * FPL's own expected points for the next gameweek (section 7.3).
   *
   * Typed as either, and parsed rather than read: it arrives as a string
   * today, like `form` and `points_per_game`, but it is a number by nature and
   * nothing stops FPL sending it as one. Every element carries a value, so a
   * missing one would be a change worth noticing rather than a normal case.
   */
  ep_next: string | number

  /** Global ownership, for the Ownership view (section 7.4). */
  selected_by_percent: string

  /** Availability (section 7.3). `a` available, `d` doubtful, `i`/`o`/`s`/`u`. */
  status: string
  /** Injury news text (section 7.3). */
  news: string
  /** Percentage chance, shown alongside an amber doubtful flag (section 7.3). */
  chance_of_playing_next_round: number | null
}

/** A position: GKP, DEF, MID, FWD. */
export type FplElementType = {
  id: number
  singular_name_short: string
  plural_name: string
}

/**
 * What `/api/bootstrap` returns, and what the Data Cache holds.
 *
 * `events`, `teams` and `element_types` are passed through whole; they total
 * about 35KB. Only `elements` is projected.
 */
export type FplBootstrap = {
  events: FplEvent[]
  teams: FplTeam[]
  elements: FplElement[]
  element_types: FplElementType[]
  total_players: number
}

/**
 * The upstream `bootstrap-static/` payload.
 *
 * Structurally the same, but its `elements` carry every upstream field. Typed
 * as `FplElement` because the projection is the only thing that reads them and
 * it reads nothing else; the extra fields are present at runtime and dropped.
 */
export type FplBootstrapRaw = FplBootstrap

/**
 * One of the 380 season fixtures.
 *
 * Section 6.5: blanks and doubles are not flagged. A team with no fixture
 * object for an `event` has a blank; two objects sharing an `event` for the
 * same team is a double. `event` is null while a postponed fixture is
 * unscheduled.
 */
export type FplFixture = {
  id: number
  code: number
  event: number | null
  kickoff_time: string | null
  finished: boolean
  started: boolean
  /** Home club ID. */
  team_h: number
  /** Away club ID. */
  team_a: number
  team_h_score: number | null
  team_a_score: number | null
  /** FDR for the home side, 1 to 5. Low is easy. See section 6.4. */
  team_h_difficulty: number
  /** FDR for the away side, 1 to 5. */
  team_a_difficulty: number
}

/** One of the fifteen picks. */
export type FplPick = {
  /** Player ID, joins to `FplElement.id`. */
  element: number
  /** 1 to 15. 1 to 11 are the starting XI, 12 to 15 the bench in order. */
  position: number
  /** 0 benched, 1 playing, 2 captain, 3 triple captain. */
  multiplier: number
  is_captain: boolean
  is_vice_captain: boolean
  element_type: number
}

/** A manager's gameweek summary, for the header in section 7.1. */
export type FplEntryHistory = {
  event: number
  points: number
  total_points: number
  rank: number | null
  overall_rank: number | null
  /** In tenths, like prices. */
  bank: number
  value: number
  event_transfers: number
  event_transfers_cost: number
  points_on_bench: number
}

export type FplPicks = {
  active_chip: string | null
  automatic_subs: unknown[]
  entry_history: FplEntryHistory
  picks: FplPick[]
}

/**
 * A manager's account summary.
 *
 * The only source of the manager's own name and their team name, both of which
 * the section 7.1 header shows. The `picks/` payload has neither.
 */
export type FplEntry = {
  id: number
  /** The team name, e.g. "Troy Story". */
  name: string
  player_first_name: string
  player_last_name: string
  player_region_name: string
  started_event: number
  current_event: number | null
  summary_overall_points: number
  summary_overall_rank: number | null
  summary_event_points: number
  summary_event_rank: number | null
  /**
   * The manager's leagues (section 5.1). Used to offer their own mini leagues
   * in the Ownership view rather than making them find a league ID.
   */
  leagues: {
    classic: FplEntryLeague[]
  }
}

/** One of the manager's classic leagues, from `entry/{id}/`. */
export type FplEntryLeague = {
  id: number
  name: string
  /** The manager's rank in this league. */
  entry_rank: number | null
  /** How many managers are in it. */
  rank_count: number | null
  /**
   * `s` for the global leagues FPL enrols everyone into (Overall, a country,
   * a sponsor), `x` for ones people actually create and join.
   */
  league_type: string
}

/** One manager's row in a classic league table. */
export type FplLeagueStanding = {
  /** Manager ID, for the per-manager `picks/` call in section 7.4. */
  entry: number
  entry_name: string
  player_name: string
  rank: number
  last_rank: number
  event_total: number
  total: number
}

export type FplLeagueStandings = {
  league: {
    id: number
    name: string
    created: string
    closed: boolean
    league_type: string
    start_event: number
  }
  standings: {
    has_next: boolean
    page: number
    results: FplLeagueStanding[]
  }
  new_entries: {
    has_next: boolean
    page: number
    results: unknown[]
  }
  last_updated_data: string | null
}
