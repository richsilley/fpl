import type { FplFixture, FplTeam } from './types'

/**
 * Fixture difficulty: FPL's own rating, or one derived from results (§6.7).
 *
 * Not `server-only`: pure arithmetic over data the caller already fetched.
 *
 * ## Why an alternative exists
 *
 * FPL's FDR is set before a ball is kicked and never moves. A promoted side
 * that turns out to be decent keeps its easy rating all season, and a big club
 * in freefall keeps its hard one.
 *
 * ## Three modes
 *
 * | Mode    | Matrix colour | Fixture Score | Team Strength |
 * |---------|---------------|---------------|---------------|
 * | `fpl`   | FPL integers  | FPL FDR       | ours          |
 * | `form`  | plain         | plain         | ours          |
 * | `blend` | blended       | **plain**     | ours          |
 *
 * **Fixture Score never uses the blend, in any mode.** In blend mode it is
 * identical to form mode. If it blended, it and the Team Strength column
 * beside it would both carry team quality and the view would be counting the
 * same thing twice. Blend mode changes matrix colours and nothing else.
 *
 * That is why a rating is a *pair* of functions rather than one: making the
 * separation structural means it cannot be lost by someone reading `fdr` where
 * they meant the score.
 *
 * Team Strength is always this app's calculation, in every mode including
 * `fpl`, because FPL publishes nothing form-aware to put there.
 *
 * ## Everything comes from `fixtures/`
 *
 * `team_h_score`, `team_a_score` and `finished` reconstruct both the table and
 * recent form. **The `teams` array's own `played`, `points` and `position` are
 * never populated by FPL** — they sit at zero all season — so results are
 * counted here instead. `strength` is likewise null; `strength_overall_home`
 * and `strength_overall_away` are populated, and are the pre-season prior.
 */

// ---------------------------------------------------------------------------
// Constants
//
// Every tunable number in the model, named and gathered, because these are
// what will be revisited once a few gameweeks have been watched. None of them
// is inlined anywhere below.
// ---------------------------------------------------------------------------

/**
 * How much a club's own strength counts against its opponent's when blending.
 *
 * 0.5 means an opponent's quality matters twice as much as your own, which is
 * the right order: who you play swings a fixture more than who you are.
 */
const ALPHA = 0.5

/**
 * Shrinkage constant for club strength, in matches.
 *
 * The observed form only reaches parity with the prior at `PRIOR_WEIGHT`
 * matches, and the window caps at six, so the prior always keeps the larger
 * share. That is deliberate: six matches is a real signal but not a big one.
 */
const PRIOR_WEIGHT = 10

/** Historical Premier League home advantage, in points per game. */
const HOME_ADVANTAGE_PRIOR = 0.33

/**
 * Shrinkage constant for home advantage, in matches.
 *
 * Much larger than `PRIOR_WEIGHT` because the historical figure is genuinely
 * well established, while a season's own home-advantage number is noisy for a
 * long time: 20 matches in it read 0.60, roughly double the long-run value.
 */
const HA_PRIOR_WEIGHT = 60

/** How many recent matches the observed form reads. */
const FORM_WINDOW = 6

/**
 * Weight on goal difference against points, within the window.
 *
 * Points per game over six matches has few possible values and throws away the
 * margin. Two clubs on three points after two matches are not the same club if
 * one scored seven and conceded four and the other four and eight.
 */
const GD_BLEND = 0.6

/** Converts goal difference per game onto the points-per-game scale. */
const GD_TO_PPG = 0.55

/**
 * Matches a club must have played before its prior becomes its own
 * season-to-date form rather than FPL's pre-season strength.
 */
const SEASON_PRIOR_MIN = 8

/**
 * The points-per-game spread FPL's pre-season strength is stretched across,
 * centred on the league's measured mean.
 *
 * A Premier League season usually runs from about 0.6 points per game at the
 * bottom to about 2.4 at the top, so 1.8 puts the weakest and strongest clubs
 * at roughly those ends.
 */
const PRIOR_SPREAD = 1.8

/** Fallback mean before any match has been played. */
const DEFAULT_MEAN_PPG = 1.4

/** FDR runs 1 to 5, and the colour bands in `fixture-visuals` assume it. */
const MIN_FDR = 1
const MAX_FDR = 5
/** The middle of that scale: an average opponent, and the blend's pivot. */
const NEUTRAL_FDR = 3

/** Team Strength is published on the same 0 to 10 scale as Fixture Score. */
const MAX_TEAM_STRENGTH = 10

export type RatingSource = 'fpl' | 'form' | 'blend'

/** The difficulty one club faces in one fixture. */
export type RatingFn = (fixture: FplFixture, forHome: boolean) => number

/**
 * A mode, as the fixture index consumes it.
 *
 * Two functions, not one, so that "Fixture Score never blends" is enforced by
 * the shape rather than by everyone remembering it.
 */
export type FixtureRating = {
  /** Difficulty for the matrix cell's colour and its hover readout. */
  colour: RatingFn
  /** Difficulty the Fixture Score sums. Never the blend. */
  score: RatingFn
  /** Team Strength per club on a 0 to 10 scale. Always this app's figure. */
  teamStrength: Map<number, number>
}

/** What the model worked out about one club, for the legend and for testing. */
export type ClubStrength = {
  teamId: number
  shortName: string
  /** Completed matches this season. */
  played: number
  /** Matches in the form window, capped at `FORM_WINDOW`. */
  windowMatches: number
  /** Goal difference per match, within the window. */
  goalDifferencePerGame: number
  /** Points per match, within the window. */
  pointsPerGame: number
  /** The goal-difference-and-points blend, in points per game. */
  observed: number
  /** Pre-season strength, or season-to-date form once there is enough. */
  prior: number
  /** Which of those the prior is. */
  priorSource: 'fpl-strength' | 'season-form'
  /** How much of the rating is `observed`, 0 to 1. Caps with the window. */
  weight: number
  /** The blend, in points per game. */
  strength: number
  /** That strength on the 1 to 5 scale, before any venue adjustment. */
  difficulty: number
  /** That strength on the 0 to 10 scale. */
  teamStrength: number
}

export type DerivedRating = {
  clubs: ClubStrength[]
  /** Home advantage after shrinkage, in points per game. */
  homeAdvantagePpg: number
  /** The same on the 1 to 5 difficulty scale, before halving. */
  homeAdvantageFdr: number
  /** Completed matches the rating is built from. */
  matchesUsed: number
  leagueMeanPpg: number
}

/** FPL's own pre-season figures, straight off the fixture. */
export const fplRating: RatingFn = (fixture, forHome) =>
  forHome ? fixture.team_h_difficulty : fixture.team_a_difficulty

export function buildRating(
  source: RatingSource,
  fixtures: FplFixture[],
  teams: FplTeam[]
): FixtureRating {
  const derived = deriveRating(fixtures, teams)
  const teamStrength = new Map(
    derived.clubs.map((club) => [club.teamId, club.teamStrength])
  )

  const plain = venueAdjusted(derived, 'plain')
  const blended = venueAdjusted(derived, 'blend')

  if (source === 'fpl') {
    return { colour: fplRating, score: fplRating, teamStrength }
  }
  if (source === 'blend') {
    // The one asymmetric case, and the reason this type has two fields.
    return { colour: blended, score: plain, teamStrength }
  }
  return { colour: plain, score: plain, teamStrength }
}

/**
 * Stage 3: a club's difficulty for one fixture, with venue applied.
 *
 * The blend re-centres on `NEUTRAL_FDR` so an average fixture stays average:
 * both terms are distances from the middle, and dividing by `1 + ALPHA` keeps
 * the result on the same scale rather than compressing it toward 3.
 */
function venueAdjusted(
  derived: DerivedRating,
  kind: 'plain' | 'blend'
): RatingFn {
  const difficulty = new Map(
    derived.clubs.map((club) => [club.teamId, club.difficulty])
  )
  const half = derived.homeAdvantageFdr / 2

  return (fixture, forHome) => {
    const opponentId = forHome ? fixture.team_a : fixture.team_h
    const ownId = forHome ? fixture.team_h : fixture.team_a

    const oppFdr = difficulty.get(opponentId)
    const ownFdr = difficulty.get(ownId)
    if (oppFdr === undefined || ownFdr === undefined) {
      return NEUTRAL_FDR
    }

    const base =
      kind === 'plain'
        ? oppFdr
        : NEUTRAL_FDR +
          (oppFdr - NEUTRAL_FDR - ALPHA * (ownFdr - NEUTRAL_FDR)) / (1 + ALPHA)

    // Playing the away side is easier by as much as playing the home side is
    // harder, so the league's mean difficulty is unchanged.
    const adjusted = base + (forHome ? -half : half)

    // Clamped because FDR is defined on 1 to 5 and the colour bands read it as
    // such. The cost is that the strongest club reads 5 whether at home or
    // away; widening the scale to fit the offset instead would mean no club
    // ever reached either end of it.
    return Math.min(MAX_FDR, Math.max(MIN_FDR, adjusted))
  }
}

/** Stages 1 and 2, computed once per request for all twenty clubs. */
export function deriveRating(
  fixtures: FplFixture[],
  teams: FplTeam[]
): DerivedRating {
  const played = completedFixtures(fixtures)
  const leagueMeanPpg = leagueMeanPpgOf(played)
  const results = resultsByClub(played, teams)
  const fplPriors = fplStrengthAsPpg(teams, leagueMeanPpg)

  const partial = teams.map((team) => {
    const record = results.get(team.id) ?? []
    const window = record.slice(-FORM_WINDOW)
    const windowMatches = window.length

    const goalDifferencePerGame =
      windowMatches === 0
        ? 0
        : window.reduce((total, match) => total + match.goalDifference, 0) /
          windowMatches
    const pointsPerGame =
      windowMatches === 0
        ? leagueMeanPpg
        : window.reduce((total, match) => total + match.points, 0) /
          windowMatches

    // Goal difference recentred on the league mean so it lands on the same
    // points-per-game scale the other half of the blend is already on.
    const observed =
      GD_BLEND * (leagueMeanPpg + GD_TO_PPG * goalDifferencePerGame) +
      (1 - GD_BLEND) * pointsPerGame

    // Once a club has a season of its own, that is a better anchor than a
    // pre-season guess that will never update again.
    const seasonForm =
      record.length === 0
        ? leagueMeanPpg
        : record.reduce((total, match) => total + match.points, 0) /
          record.length
    const useSeasonPrior = record.length >= SEASON_PRIOR_MIN
    const prior = useSeasonPrior
      ? seasonForm
      : (fplPriors.get(team.id) ?? leagueMeanPpg)

    // Matches *in the window*, which caps at `FORM_WINDOW`, so the weight caps
    // too. Counting every match played instead would keep raising confidence
    // in evidence that stopped growing at GW7 — trusting the same six matches
    // more in May than in October.
    const weight = windowMatches / (windowMatches + PRIOR_WEIGHT)

    return {
      teamId: team.id,
      shortName: team.short_name,
      played: record.length,
      windowMatches,
      goalDifferencePerGame,
      pointsPerGame,
      observed,
      prior,
      priorSource: (useSeasonPrior ? 'season-form' : 'fpl-strength') as
        'season-form' | 'fpl-strength',
      weight,
      strength: weight * observed + (1 - weight) * prior,
    }
  })

  const strengths = partial.map((club) => club.strength)
  const lowest = Math.min(...strengths)
  const highest = Math.max(...strengths)
  const span = highest - lowest

  const clubs: ClubStrength[] = partial.map((club) => ({
    ...club,
    // Linear across the twenty clubs, so the scale always spans 1 to 5. Not
    // inverted: a strong opponent is a *high* number, FPL's convention and
    // what `6 - fdr` expects.
    difficulty:
      span === 0
        ? (MIN_FDR + MAX_FDR) / 2
        : MIN_FDR + ((club.strength - lowest) / span) * (MAX_FDR - MIN_FDR),
    teamStrength:
      span === 0
        ? MAX_TEAM_STRENGTH / 2
        : ((club.strength - lowest) / span) * MAX_TEAM_STRENGTH,
  }))

  const homeAdvantagePpg = homeAdvantage(played)

  return {
    clubs,
    homeAdvantagePpg,
    // Onto the difficulty scale: a points-per-game gap is worth the same
    // fraction of the 1-to-5 range as it is of the strength range.
    homeAdvantageFdr:
      span === 0 ? 0 : (homeAdvantagePpg / span) * (MAX_FDR - MIN_FDR),
    matchesUsed: played.length,
    leagueMeanPpg,
  }
}

/**
 * Stage 2: one home advantage for the division, shrunk toward the historical
 * figure.
 *
 * League-wide rather than per club: half a season gives a club nine or ten
 * home games, far too few to separate a real home effect from noise, and
 * splitting each record by venue halves the sample for no gain.
 *
 * Shrunk for the same reason club strength is. A season's first twenty matches
 * produced 0.60 points per game, roughly double the long-run value, and a
 * rating that took that at face value would overstate every home fixture.
 */
function homeAdvantage(played: FplFixture[]): number {
  if (played.length === 0) {
    return HOME_ADVANTAGE_PRIOR
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

  const observed = (home - away) / played.length
  const weight = played.length / (played.length + HA_PRIOR_WEIGHT)
  return weight * observed + (1 - weight) * HOME_ADVANTAGE_PRIOR
}

type MatchResult = { points: number; goalDifference: number }

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
 * Each club's results, oldest first, so the last six are the recent ones.
 *
 * Ordered by gameweek rather than by the order the API happens to return, so a
 * rearranged fixture counts as recent according to when it was played rather
 * than when it was originally scheduled.
 */
function resultsByClub(
  played: FplFixture[],
  teams: FplTeam[]
): Map<number, MatchResult[]> {
  const byClub = new Map<number, MatchResult[]>(
    teams.map((team) => [team.id, []])
  )

  const inOrder = [...played].sort(
    (a, b) => (a.event ?? 0) - (b.event ?? 0) || a.id - b.id
  )

  for (const fixture of inOrder) {
    const home = fixture.team_h_score as number
    const away = fixture.team_a_score as number
    const drawn = home === away
    const homePoints = drawn ? 1 : home > away ? 3 : 0

    byClub
      .get(fixture.team_h)
      ?.push({ points: homePoints, goalDifference: home - away })
    byClub.get(fixture.team_a)?.push({
      points: drawn ? 1 : 3 - homePoints,
      goalDifference: away - home,
    })
  }

  return byClub
}

/**
 * Mean points per game across every club.
 *
 * Not a constant: the draw rate decides it, since a draw puts two points into
 * a match and a win three. Measuring it keeps the prior and the
 * goal-difference term on the same scale as the observed record.
 */
function leagueMeanPpgOf(played: FplFixture[]): number {
  if (played.length === 0) {
    return DEFAULT_MEAN_PPG
  }

  let total = 0
  for (const fixture of played) {
    total += fixture.team_h_score === fixture.team_a_score ? 2 : 3
  }

  // Two clubs take part in each match, so team-matches is twice the fixtures.
  return total / (played.length * 2)
}

/**
 * FPL's pre-season strength, on the points-per-game scale.
 *
 * `strength_overall_home` and `strength_overall_away` are averaged into one
 * venue-neutral figure, because home advantage is applied separately as a
 * league-wide offset and taking it from both places would count it twice.
 *
 * Normalised across the twenty clubs rather than read as an absolute, since
 * FPL's scale is a small integer range whose meaning is relative anyway.
 */
function fplStrengthAsPpg(
  teams: FplTeam[],
  meanPpg: number
): Map<number, number> {
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
      const position = (strength - lowest) / span - 0.5
      return [teamId, meanPpg + position * PRIOR_SPREAD]
    })
  )
}
