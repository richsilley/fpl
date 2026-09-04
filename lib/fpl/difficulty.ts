import type { FplFixture, FplTeam } from './types'

/**
 * Fixture difficulty: FPL's own rating, or one derived from results so far.
 *
 * Not `server-only`: pure arithmetic over data the caller already fetched.
 *
 * ## Why an alternative exists
 *
 * FPL's FDR is set before a ball is kicked and never moves. A promoted side
 * that turns out to be decent keeps its easy rating all season, and a big club
 * in freefall keeps its hard one. The custom rating is the same idea measured
 * from what has actually happened.
 *
 * ## Where the numbers come from
 *
 * Everything is derived from `fixtures/`, which every view already loads:
 * `team_h_score`, `team_a_score` and `finished` are enough to reconstruct the
 * table and recent form. **The `teams` array's own `played`, `points` and
 * `position` fields are not populated by FPL** — they are zeroes all season —
 * so they are ignored, and the results are counted here instead.
 *
 * ## The model
 *
 * For each club:
 *
 * ```
 * observed = points per game over their last 6 completed matches
 * prior    = FPL's overall strength, mapped onto the same points-per-game scale
 * weight   = played / (played + 6)
 * strength = weight x observed + (1 - weight) x prior
 * ```
 *
 * **Early in the season the rating is mostly the prior, by design.** After two
 * matches `weight` is 0.25, so three quarters of a club's rating is still
 * FPL's pre-season opinion. That is the intended behaviour, not a warm-up
 * period to be skipped: two results are not evidence, and a rating that swung
 * wildly on them would be worse than the static one it replaces. Confidence in
 * the observed record grows as the season does, reaching two thirds by GW12
 * and six sevenths by GW38.
 *
 * **The six-match window is what lets a rating fall when form does.** `weight`
 * only ever rises, so if `observed` were the whole season a club's rating
 * would converge and then freeze, which is the very problem with the static
 * FDR. Reading form over a rolling window instead means a good side on a bad
 * run gets easier to play, and the rating keeps saying something current right
 * up to GW38.
 *
 * Home advantage is measured once across the whole league rather than by
 * splitting each club's record in two. Half a season gives a club nine or ten
 * home games, which is far too few to separate a real home effect from noise,
 * while the league-wide figure has hundreds of matches behind it.
 */

/** How many recent matches the observed form is read over. */
const FORM_WINDOW = 6

/**
 * The points-per-game spread the prior is stretched across, centred on the
 * league's actual mean.
 *
 * The one tuned constant here. A Premier League season usually runs from about
 * 0.6 points per game at the bottom to about 2.4 at the top, so a spread of
 * 1.8 puts FPL's weakest and strongest clubs at roughly those ends. Only the
 * spread is a constant: the centre is measured, so the prior cannot drift away
 * from the scale the observed record is on.
 */
const PRIOR_SPREAD = 1.8

/**
 * Fallback mean before any match has been played, when there is nothing to
 * measure. The long-run Premier League average, slightly under 1.5 because
 * draws put two points into a match rather than three.
 */
const DEFAULT_MEAN_PPG = 1.4

/** FDR runs 1 to 5, and the colour bands in `fixture-visuals` assume it. */
const MIN_FDR = 1
const MAX_FDR = 5

export type RatingSource = 'fpl' | 'custom'

/**
 * The difficulty a club faces in one fixture.
 *
 * `forHome` picks which side of the fixture is being asked about, matching
 * `team_h_difficulty` / `team_a_difficulty`. Both ratings are this shape, so
 * the fixture index does not know which one it was handed.
 */
export type Rating = (fixture: FplFixture, forHome: boolean) => number

/** What the custom rating worked out about one club, for the legend. */
export type ClubStrength = {
  teamId: number
  shortName: string
  /** Completed matches this season. */
  played: number
  /** Points per game over the last `FORM_WINDOW` matches. */
  observed: number
  /** FPL's pre-season strength on the points-per-game scale. */
  prior: number
  /** How much of the rating is `observed` rather than `prior`, 0 to 1. */
  weight: number
  /** The blend, in points per game. */
  strength: number
  /** That strength on the 1 to 5 scale, before any venue adjustment. */
  difficulty: number
}

export type CustomRating = {
  rate: Rating
  clubs: ClubStrength[]
  /** Points-per-game gap between home and away sides, league wide. */
  homeAdvantage: number
  /** Completed matches the rating is built from. */
  matchesUsed: number
}

/** FPL's own pre-season figures, straight off the fixture. */
export const fplRating: Rating = (fixture, forHome) =>
  forHome ? fixture.team_h_difficulty : fixture.team_a_difficulty

export function buildRating(
  source: RatingSource,
  fixtures: FplFixture[],
  teams: FplTeam[]
): Rating {
  return source === 'custom' ? customRating(fixtures, teams).rate : fplRating
}

export function customRating(
  fixtures: FplFixture[],
  teams: FplTeam[]
): CustomRating {
  const played = completedFixtures(fixtures)
  const homeAdvantage = leagueHomeAdvantage(played)
  const meanPpg = leagueMeanPpg(played)

  const points = pointsByClub(played, teams)
  const priors = priorPpg(teams, meanPpg)

  const clubs: Omit<ClubStrength, 'difficulty'>[] = teams.map((team) => {
    const record = points.get(team.id) ?? []
    const recent = record.slice(-FORM_WINDOW)
    const observed =
      recent.length === 0
        ? meanPpg
        : recent.reduce((total, p) => total + p, 0) / recent.length

    // Confidence grows with the whole season's evidence even though the
    // estimate itself only reads the recent window. Played, not the window
    // length: capping this at six would freeze the prior at half the rating
    // for the rest of the season.
    const weight = record.length / (record.length + FORM_WINDOW)
    const prior = priors.get(team.id) ?? meanPpg

    return {
      teamId: team.id,
      shortName: team.short_name,
      played: record.length,
      observed,
      prior,
      weight,
      strength: weight * observed + (1 - weight) * prior,
    }
  })

  // Linear across the twenty clubs, so the scale always spans 1 to 5 whatever
  // the spread of strengths happens to be. Not inverted: a strong opponent is
  // a *high* number, which is FPL's convention and what `6 - fdr` expects.
  const strengths = clubs.map((club) => club.strength)
  const lowest = Math.min(...strengths)
  const highest = Math.max(...strengths)
  const span = highest - lowest

  const toDifficulty = (strength: number): number =>
    span === 0
      ? (MIN_FDR + MAX_FDR) / 2
      : MIN_FDR + ((strength - lowest) / span) * (MAX_FDR - MIN_FDR)

  const rated: ClubStrength[] = clubs.map((club) => ({
    ...club,
    difficulty: toDifficulty(club.strength),
  }))

  const difficultyById = new Map(
    rated.map((club) => [club.teamId, club.difficulty])
  )

  // Home advantage as a constant offset on the finished 1-to-5 scale, split
  // evenly so the league's average difficulty is unchanged: playing the away
  // side is easier by as much as playing the home side is harder.
  const venueOffset =
    span === 0 ? 0 : (homeAdvantage / 2 / span) * (MAX_FDR - MIN_FDR)

  const rate: Rating = (fixture, forHome) => {
    // The difficulty a club faces is the *opponent's* strength, adjusted for
    // where the opponent is playing. When this row is the home side, the
    // opponent is away and therefore weaker.
    const opponentId = forHome ? fixture.team_a : fixture.team_h
    const base = difficultyById.get(opponentId)
    if (base === undefined) {
      return (MIN_FDR + MAX_FDR) / 2
    }
    const adjusted = base + (forHome ? -venueOffset : venueOffset)
    // Clamped because FDR is defined on 1 to 5 and the colour bands read it as
    // such. The cost is that the strongest club reads 5 whether at home or
    // away; the alternative, widening the scale to fit the offset, would mean
    // no club ever reached either end.
    return Math.min(MAX_FDR, Math.max(MIN_FDR, adjusted))
  }

  return { rate, clubs: rated, homeAdvantage, matchesUsed: played.length }
}

/**
 * Fixtures with a result. `finished` alone is not enough: a fixture can be
 * marked finished before its scores are attached, and a null score would count
 * as a nil-nil draw.
 */
function completedFixtures(fixtures: FplFixture[]): FplFixture[] {
  return fixtures.filter(
    (fixture) =>
      fixture.finished &&
      fixture.team_h_score !== null &&
      fixture.team_a_score !== null
  )
}

/**
 * Points each club has taken, oldest first, so the last six are the recent
 * ones.
 *
 * Ordered by gameweek rather than by the order the API happens to return, and
 * a rearranged fixture therefore counts as recent according to when it was
 * played rather than when it was originally scheduled.
 */
function pointsByClub(
  played: FplFixture[],
  teams: FplTeam[]
): Map<number, number[]> {
  const byClub = new Map<number, number[]>(teams.map((team) => [team.id, []]))

  const inOrder = [...played].sort(
    (a, b) => (a.event ?? 0) - (b.event ?? 0) || a.id - b.id
  )

  for (const fixture of inOrder) {
    const home = fixture.team_h_score as number
    const away = fixture.team_a_score as number
    const drawn = home === away
    const homePoints = drawn ? 1 : home > away ? 3 : 0

    byClub.get(fixture.team_h)?.push(homePoints)
    byClub.get(fixture.team_a)?.push(drawn ? 1 : 3 - homePoints)
  }

  return byClub
}

/**
 * The league-wide home advantage, in points per game.
 *
 * Total points taken by home sides minus total taken by away sides, over the
 * same set of matches. One figure for the division, per the reasoning in the
 * module note.
 */
function leagueHomeAdvantage(played: FplFixture[]): number {
  if (played.length === 0) {
    return 0
  }

  let home = 0
  let away = 0
  for (const fixture of played) {
    const h = fixture.team_h_score as number
    const a = fixture.team_a_score as number
    if (h > a) home += 3
    else if (a > h) away += 3
    else {
      home += 1
      away += 1
    }
  }

  return (home - away) / played.length
}

/**
 * Mean points per game across every club.
 *
 * Not a constant: the draw rate decides it, since a draw puts two points into
 * a match and a win three. Measuring it keeps the prior on the same scale as
 * the observed record however the season is going.
 */
function leagueMeanPpg(played: FplFixture[]): number {
  if (played.length === 0) {
    return DEFAULT_MEAN_PPG
  }

  let total = 0
  for (const fixture of played) {
    const h = fixture.team_h_score as number
    const a = fixture.team_a_score as number
    total += h === a ? 2 : 3
  }

  // Two clubs take part in each match, so the per-club appearance count is
  // twice the number of matches.
  return total / (played.length * 2)
}

/**
 * FPL's pre-season strength, on the points-per-game scale.
 *
 * `strength_overall_home` and `strength_overall_away` are averaged into one
 * venue-neutral figure, because home advantage is applied separately as a
 * league-wide offset and taking it from both places would count it twice.
 *
 * The pair is normalised across the twenty clubs rather than read as an
 * absolute, since FPL's scale is a small integer range whose meaning is
 * relative anyway.
 */
function priorPpg(teams: FplTeam[], meanPpg: number): Map<number, number> {
  const overall = new Map(
    teams.map((team) => [
      team.id,
      (team.strength_overall_home + team.strength_overall_away) / 2,
    ])
  )

  const values = [...overall.values()]
  const lowest = Math.min(...values)
  const highest = Math.max(...values)
  const span = highest - lowest

  return new Map(
    [...overall].map(([teamId, strength]) => {
      if (span === 0) {
        return [teamId, meanPpg]
      }
      // -0.5 to +0.5 around the measured mean, stretched by the spread.
      const position = (strength - lowest) / span - 0.5
      return [teamId, meanPpg + position * PRIOR_SPREAD]
    })
  )
}
