import 'server-only'

import { fplRating, type FixtureRating } from './difficulty'
import { LAST_GAMEWEEK, type Horizon } from './horizon'
import type { FplEvent, FplFixture, FplTeam } from './types'

/**
 * Fixture indexing and the Fixture Score (section 6).
 *
 * Kept apart from rendering because the Club Blocks view (section 7.5) scores
 * the same way over twenty club rows instead of fifteen player rows.
 *
 * The pure horizon arithmetic lives in ./horizon.ts so the Client Component
 * that renders the horizon control can share it without pulling in
 * `server-only`. Re-exported here so server code has one place to import from.
 */

export {
  clampHorizon,
  DEFAULT_HORIZON,
  formatFixtureScore,
  HORIZON_PRESETS,
  LAST_GAMEWEEK,
  maxHorizon,
  NEUTRAL_SCORE,
  parseHorizon,
  type Horizon,
} from './horizon'

/** One fixture, from one club's point of view. */
export type TeamFixture = {
  gameweek: number
  /** Opponent's short name, e.g. "ARS". */
  opponent: string
  opponentName: string
  isHome: boolean
  /**
   * Difficulty for this cell's **colour**, 1 to 5. Low is easy.
   *
   * A whole number under FPL's own rating, a fraction under the derived ones
   * (section 6.7). Never rendered as a number in the cell itself; it is behind
   * hover and tap, because a third figure is unreadable across 36 columns on a
   * phone.
   */
  fdr: number
  /**
   * `6 - scoreFdr`, the inverted value the Fixture Score sums (section 6.1).
   *
   * **Derived from the score rating, not from `fdr`.** In blend mode the two
   * differ on purpose: the cell is blended, the Fixture Score is not, because
   * blending it would double-count team quality against the Team Strength
   * column beside it (section 6.7).
   */
  value: number
  /** The difficulty `value` came from, for anything that needs it back. */
  scoreFdr: number
}

/**
 * Club ID to gameweek to that club's fixtures in it.
 *
 * Section 6.5: neither blanks nor doubles are flagged by the API, and both
 * fall out of this shape. A gameweek with no entry is a blank; a gameweek
 * whose entry holds two fixtures is a double. No special-casing needed.
 */
export type FixtureIndex = Map<number, Map<number, TeamFixture[]>>

/**
 * @param rating which difficulty rating to score with (section 6.7). Injected
 *   rather than chosen here, so a view cannot pick its own and the Fixtures
 *   and Club Blocks views can never disagree about a fixture.
 */
export function buildFixtureIndex(
  fixtures: FplFixture[],
  teams: FplTeam[],
  rating: FixtureRating = {
    colour: fplRating,
    score: fplRating,
    teamStrength: new Map(),
  }
): FixtureIndex {
  const clubsById = new Map(teams.map((team) => [team.id, team]))
  const index: FixtureIndex = new Map(teams.map((team) => [team.id, new Map()]))

  for (const fixture of fixtures) {
    // A postponed fixture with no gameweek yet belongs to no column. It shows
    // as a blank for both clubs until the rearranged date is confirmed.
    if (fixture.event === null) {
      continue
    }

    addFixture(index, clubsById, fixture, true, rating)
    addFixture(index, clubsById, fixture, false, rating)
  }

  return index
}

function addFixture(
  index: FixtureIndex,
  clubsById: Map<number, FplTeam>,
  fixture: FplFixture,
  forHome: boolean,
  rating: FixtureRating
): void {
  const teamId = forHome ? fixture.team_h : fixture.team_a
  const opponentId = forHome ? fixture.team_a : fixture.team_h
  const fdr = rating.colour(fixture, forHome)
  const scoreFdr = rating.score(fixture, forHome)

  const byGameweek = index.get(teamId)
  const opponent = clubsById.get(opponentId)
  if (!byGameweek || !opponent) {
    return
  }

  const gameweek = fixture.event as number
  const existing = byGameweek.get(gameweek) ?? []

  existing.push({
    gameweek,
    opponent: opponent.short_name,
    opponentName: opponent.name,
    isHome: forHome,
    fdr,
    scoreFdr,
    value: 6 - scoreFdr,
  })

  byGameweek.set(gameweek, existing)
}

/** A club's fixtures in one gameweek. Empty means a blank. */
export function fixturesFor(
  index: FixtureIndex,
  teamId: number,
  gameweek: number
): TeamFixture[] {
  return index.get(teamId)?.get(gameweek) ?? []
}

export type FixtureScore = {
  /**
   * Normalised to a 0 to 10 range. Higher is better. Section 6.1 allows values
   * above 10 for double gameweeks, and they are not capped.
   */
  score: number
  /** How many fixtures made up the score. Shown in brackets, section 6.3. */
  count: number
}

/**
 * Section 6.1:
 *
 * ```
 * fixtureScore = ( sum(6 - FDR) / gameweeksInHorizon ) x 2
 * ```
 *
 * Divided by **gameweeks, never fixtures**. Gameweeks is a constant for a
 * given horizon, so dividing by it only rescales and every comparison
 * survives. Dividing by fixture count would be the averaging rejected in 6.2:
 * it would wipe out the blanks and doubles handling, since a blank would stop
 * lowering the score and a double would stop raising it.
 *
 * Section 6.2 is why the sum inverts first: a blank contributes nothing and so
 * lowers the score, and each half of a double contributes, so the score rises.
 * Both fall out with no special cases.
 *
 * Section 6.1: scores above 10 are valid and informative, not an error, so
 * nothing here caps them. A double gameweek can beat what single fixtures can.
 *
 * Section 6.6: no distance decay in v1.
 */
export function fixtureScore(
  index: FixtureIndex,
  teamId: number,
  startGameweek: number,
  horizon: Horizon
): FixtureScore {
  const gameweeks = horizonGameweeks(startGameweek, horizon)

  let total = 0
  let count = 0

  for (const gameweek of gameweeks) {
    for (const fixture of fixturesFor(index, teamId, gameweek)) {
      total += fixture.value
      count += 1
    }
  }

  // Past the end of the season the horizon holds no gameweeks at all. Dividing
  // would be NaN, and there is nothing ahead to score.
  if (gameweeks.length === 0) {
    return { score: 0, count: 0 }
  }

  return { score: (total / gameweeks.length) * 2, count }
}

/**
 * The gameweeks the horizon covers, clipped at the end of the season, so a
 * 10-gameweek horizon from GW34 scores the five that exist.
 */
export function horizonGameweeks(
  startGameweek: number,
  horizon: Horizon
): number[] {
  const end = Math.min(startGameweek + horizon - 1, LAST_GAMEWEEK)
  return rangeInclusive(startGameweek, end)
}

/** Every column the fixtures view shows: the start gameweek through GW38. */
export function gameweekColumns(startGameweek: number): number[] {
  return rangeInclusive(startGameweek, LAST_GAMEWEEK)
}

/**
 * The first gameweek still to be played, which is where the columns start.
 *
 * Section 7.2 says "from the current one through GW38". The API's `is_current`
 * advances at each deadline, so once a gameweek finishes it stays current
 * until the next deadline: taking it literally would lead with a column of
 * results nobody can act on, and worse, would fold a finished gameweek into
 * the Fixture Score, which is meant to describe the run ahead. The first
 * unfinished gameweek is the current one in the sense a manager means it. Mid
 * gameweek that is the one being played; once it finishes it is the next one.
 */
export function firstUpcomingGameweek(events: FplEvent[]): number {
  return events.find((event) => !event.finished)?.id ?? LAST_GAMEWEEK
}

function rangeInclusive(from: number, to: number): number[] {
  if (to < from) {
    return []
  }
  return Array.from({ length: to - from + 1 }, (_, offset) => from + offset)
}
