/**
 * Backtest for Layer 1 of The Edge (section 7.9).
 *
 * Not part of the app. No storage, no cache, no state: it fetches, scores and
 * prints. Run it with `node scripts/backtest-projection.mjs`.
 *
 * ## What it does
 *
 * For each past gameweek it rebuilds what the projection *would have known*
 * before that gameweek kicked off, using only each player's own match history
 * up to that point, then compares the projection against what they actually
 * scored in it.
 *
 * `element-summary/{id}/` is the only endpoint that carries per-gameweek
 * history, so it is the only way to reconstruct a past state: `bootstrap-static`
 * publishes season-to-date totals and nothing else, and there is no archive of
 * what it said last month. Summing a player's history for rounds before N
 * reproduces exactly the totals bootstrap would have carried at that moment.
 *
 * ## What it cannot reconstruct, and why that matters
 *
 * **Availability.** `status` and `chance_of_playing_next_round` describe today
 * and are not in the history. A player who was injured in GW5 looks fit in the
 * reconstruction, so the projection will have expected points from someone who
 * was never going to play. That biases the error *upwards*: the real model,
 * which does see the flag and zeroes them, is better than these numbers say.
 * The run reports both the full set and the subset who actually played, and
 * the gap between them is the size of that effect.
 *
 * **Price and ownership at the time** are likewise only available as of now.
 * Neither is an input to Layer 1, so neither affects the result.
 *
 * ## Why this exists at all
 *
 * Layer 1 is kept separate from Layer 2 precisely so that it can be wrong in a
 * measurable way. This is the measurement. If the projection cannot beat a
 * trivial predictor, nothing built on top of it is worth having, so the run
 * scores a baseline alongside it: season points per game to date.
 *
 * **FPL's own `ep_next` is deliberately not a baseline here.** It is published
 * only for the gameweek about to be played and is not in any history payload,
 * so there is no way to recover what it said before GW5 and no honest way to
 * score it retrospectively. Comparing against today's value would be comparing
 * a forecast made with full knowledge against one made without.
 */

const BASE = 'https://fantasy.premierleague.com/api'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** Matches the app's fan-out cap. Same reasoning: do not hammer the API. */
const CONCURRENCY = 8

/** How many players to sample. One `element-summary` call each. */
const SAMPLE_SIZE = 320

/** Players below this many season minutes are not a meaningful test. */
const MIN_SEASON_MINUTES = 180

// ---------------------------------------------------------------------------
// Layer 1, transcribed from lib/fpl/edge-projection.ts.
//
// Transcribed rather than imported because that file is TypeScript inside a
// Next.js path alias, and this script has to run under plain node with no
// build step. The constants below must be kept in step with it; a divergence
// makes this backtest measure something the app does not do.
// ---------------------------------------------------------------------------

const APPEARANCE_POINTS_FULL = 2
const APPEARANCE_POINTS_PARTIAL = 1
const MINUTES_FOR_FULL_APPEARANCE = 60
const MINUTES_FOR_CERTAIN_START = 70
const GOAL_POINTS = { GKP: 10, DEF: 6, MID: 5, FWD: 4 }
const ASSIST_POINTS = 3
const GOAL_SHARE_OF_INVOLVEMENT = { GKP: 0, DEF: 0.3, MID: 0.45, FWD: 0.7 }
const CLEAN_SHEET_POINTS = { GKP: 4, DEF: 4, MID: 1, FWD: 0 }
const CLEAN_SHEET_PROBABILITY_BEST = 0.55
const CLEAN_SHEET_PROBABILITY_WORST = 0.08
const DEFCON_POINTS = 2
const DEFCON_RATE_FLOOR = 0.6
const DEFCON_RATE_CEILING = 1.3
const FIXTURE_SWING = 0.5
const NEUTRAL_FIXTURE_SCORE = 6
const DEFCON_THRESHOLD = { GKP: null, DEF: 10, MID: 12, FWD: 12 }

const clamp01 = (n) => Math.max(0, Math.min(1, n))

function pointsPerInvolvement(position) {
  const share = GOAL_SHARE_OF_INVOLVEMENT[position] ?? 0.5
  const goal = GOAL_POINTS[position] ?? 5
  return share * goal + (1 - share) * ASSIST_POINTS
}

function fixtureMultiplier(value) {
  const score = value * 2
  return Math.max(
    0,
    1 +
      FIXTURE_SWING * ((score - NEUTRAL_FIXTURE_SCORE) / NEUTRAL_FIXTURE_SCORE)
  )
}

function cleanSheetProbability(value) {
  const eased = clamp01((value - 1) / 4)
  return (
    CLEAN_SHEET_PROBABILITY_WORST +
    eased * (CLEAN_SHEET_PROBABILITY_BEST - CLEAN_SHEET_PROBABILITY_WORST)
  )
}

function defconClearProbability(position, perNinety) {
  const threshold = DEFCON_THRESHOLD[position]
  if (!threshold) return 0
  const rate = perNinety / threshold
  return clamp01(
    (rate - DEFCON_RATE_FLOOR) / (DEFCON_RATE_CEILING - DEFCON_RATE_FLOOR)
  )
}

/** `fixtures` is an array of `{ value }`, one per match in the gameweek. */
function projectPoints(input, fixtures) {
  if (fixtures.length === 0) return 0
  const expectedMinutes =
    input.matchesPlayed > 0 ? input.minutes / input.matchesPlayed : 0
  const startProbability = clamp01(expectedMinutes / MINUTES_FOR_CERTAIN_START)
  if (startProbability === 0) return 0

  const appearancePoints =
    expectedMinutes >= MINUTES_FOR_FULL_APPEARANCE
      ? APPEARANCE_POINTS_FULL
      : APPEARANCE_POINTS_PARTIAL
  const perInvolvement = pointsPerInvolvement(input.position)
  const csPoints = CLEAN_SHEET_POINTS[input.position] ?? 0
  const defcon = defconClearProbability(
    input.position,
    input.defensiveContributionPer90
  )

  let total = 0
  for (const fixture of fixtures) {
    total += startProbability * appearancePoints
    total +=
      startProbability *
      input.expectedGoalInvolvementsPer90 *
      fixtureMultiplier(fixture.value) *
      perInvolvement
    total +=
      startProbability *
      (cleanSheetProbability(fixture.value) * csPoints + defcon * DEFCON_POINTS)
  }
  return total
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

async function get(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA } })
  if (!r.ok) throw new Error(`${r.status} ${path}`)
  return r.json()
}

async function mapLimit(items, limit, worker) {
  const out = []
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const i = next++
      try {
        out.push(await worker(items[i]))
      } catch {
        /* one player's history failing shrinks the sample, nothing more */
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, run))
  return out
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function pearson(xs, ys) {
  const n = xs.length
  if (n < 2) return NaN
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx
    const b = ys[i] - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  return dx === 0 || dy === 0 ? NaN : num / Math.sqrt(dx * dy)
}

/** Rank correlation: the view ranks players, so order matters more than level. */
function spearman(xs, ys) {
  const rank = (values) => {
    const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])
    const out = new Array(values.length)
    let i = 0
    while (i < idx.length) {
      let j = i
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++
      const avg = (i + j) / 2 + 1
      for (let k = i; k <= j; k++) out[idx[k][1]] = avg
      i = j + 1
    }
    return out
  }
  return pearson(rank(xs), rank(ys))
}

const mae = (xs, ys) =>
  xs.reduce((sum, x, i) => sum + Math.abs(x - ys[i]), 0) / xs.length

const rmse = (xs, ys) =>
  Math.sqrt(xs.reduce((sum, x, i) => sum + (x - ys[i]) ** 2, 0) / xs.length)

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

async function main() {
  process.stdout.write('Fetching bootstrap and fixtures... ')
  const [bootstrap, fixtures] = await Promise.all([
    get('/bootstrap-static/'),
    get('/fixtures/'),
  ])
  console.log('done')

  const positionOf = new Map(
    bootstrap.element_types.map((t) => [t.id, t.singular_name_short])
  )

  // Gameweeks with final results. The most recent one is excluded when its
  // bonus is still pending, since actual points would still be moving.
  const settled = bootstrap.events
    .filter((e) => e.finished && e.data_checked)
    .map((e) => e.id)
  // Nothing to reconstruct before a player has any history at all.
  const testable = settled.filter((gw) => gw >= 2)

  if (testable.length === 0) {
    console.log(
      '\nNo settled gameweeks with prior history yet. Nothing to test.'
    )
    return
  }
  console.log(`Settled gameweeks available: ${settled.join(', ')}`)
  console.log(`Testing: ${testable.join(', ')}\n`)

  const sample = bootstrap.elements
    .filter((e) => e.minutes >= MIN_SEASON_MINUTES)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, SAMPLE_SIZE)

  process.stdout.write(
    `Fetching history for ${sample.length} players (concurrency ${CONCURRENCY})... `
  )
  const histories = await mapLimit(sample, CONCURRENCY, async (element) => {
    const summary = await get(`/element-summary/${element.id}/`)
    return { element, history: summary.history }
  })
  console.log(`got ${histories.length}`)

  // Fixture difficulty per club per gameweek. FPL's own FDR is set before the
  // season and never moves, so it is legitimately "data available then".
  const difficulty = new Map()
  const played = new Map()
  for (const f of fixtures) {
    if (f.event === null) continue
    for (const [team, value] of [
      [f.team_h, 6 - f.team_h_difficulty],
      [f.team_a, 6 - f.team_a_difficulty],
    ]) {
      if (!difficulty.has(team)) difficulty.set(team, new Map())
      const byGw = difficulty.get(team)
      if (!byGw.has(f.event)) byGw.set(f.event, [])
      byGw.get(f.event).push({ value })
      if (f.finished) played.set(team, (played.get(team) ?? 0) + 1)
    }
  }

  const clubMatchesBefore = (teamId, gameweek) => {
    let n = 0
    for (const f of fixtures) {
      if (f.event !== null && f.event < gameweek && f.finished) {
        if (f.team_h === teamId || f.team_a === teamId) n++
      }
    }
    return n
  }

  const rows = []
  for (const gameweek of testable) {
    for (const { element, history } of histories) {
      const prior = history.filter((h) => h.round < gameweek)
      if (prior.length === 0) continue

      const minutes = prior.reduce((s, h) => s + h.minutes, 0)
      if (minutes <= 0) continue

      const xgi = prior.reduce(
        (s, h) => s + Number(h.expected_goal_involvements ?? 0),
        0
      )
      const dc = prior.reduce(
        (s, h) => s + Number(h.defensive_contribution ?? 0),
        0
      )
      const actualRounds = history.filter((h) => h.round === gameweek)
      if (actualRounds.length === 0) continue
      const actual = actualRounds.reduce((s, h) => s + h.total_points, 0)
      const actualMinutes = actualRounds.reduce((s, h) => s + h.minutes, 0)

      const position = positionOf.get(element.element_type) ?? '?'
      const gwFixtures = difficulty.get(element.team)?.get(gameweek) ?? []

      const projection = projectPoints(
        {
          position,
          minutes,
          matchesPlayed: clubMatchesBefore(element.team, gameweek),
          expectedGoalInvolvementsPer90: (xgi / minutes) * 90,
          defensiveContributionPer90: (dc / minutes) * 90,
        },
        gwFixtures
      )

      // Baseline 1: season points per game to date. The trivial predictor.
      const priorPoints = prior.reduce((s, h) => s + h.total_points, 0)
      const ppg = priorPoints / prior.length

      rows.push({
        gameweek,
        name: element.web_name,
        position,
        projection,
        ppg,
        actual,
        played: actualMinutes > 0,
      })
    }
  }

  report('ALL SAMPLED PLAYERS', rows)
  report(
    'PLAYERS WHO ACTUALLY PLAYED',
    rows.filter((r) => r.played),
    'excludes the injured and dropped, whose availability the reconstruction cannot see'
  )

  console.log('\nPER GAMEWEEK (players who played)')
  console.log(
    '  gw     n    corr   spearman     MAE    proj mean   actual mean'
  )
  for (const gameweek of testable) {
    const g = rows.filter((r) => r.gameweek === gameweek && r.played)
    if (g.length < 5) continue
    const p = g.map((r) => r.projection)
    const a = g.map((r) => r.actual)
    console.log(
      `  ${String(gameweek).padStart(2)}  ${String(g.length).padStart(4)}  ` +
        `${pearson(p, a).toFixed(3).padStart(6)}  ${spearman(p, a).toFixed(3).padStart(9)}  ` +
        `${mae(p, a).toFixed(2).padStart(6)}  ${(p.reduce((s, x) => s + x, 0) / p.length).toFixed(2).padStart(11)}  ${(a.reduce((s, x) => s + x, 0) / a.length).toFixed(2).padStart(13)}`
    )
  }
}

function report(title, rows, note) {
  if (rows.length === 0) {
    console.log(`\n${title}: no rows`)
    return
  }
  const proj = rows.map((r) => r.projection)
  const ppg = rows.map((r) => r.ppg)
  const actual = rows.map((r) => r.actual)

  console.log(`\n=== ${title} (n = ${rows.length}) ===`)
  if (note) console.log(`    ${note}`)
  console.log('')
  console.log('  model                 corr   spearman     MAE    RMSE   mean')
  const line = (label, xs) =>
    console.log(
      `  ${label.padEnd(18)} ${pearson(xs, actual).toFixed(3).padStart(6)}  ` +
        `${spearman(xs, actual).toFixed(3).padStart(9)}  ${mae(xs, actual).toFixed(2).padStart(6)}  ` +
        `${rmse(xs, actual).toFixed(2).padStart(6)}  ${(xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(2).padStart(5)}`
    )
  line('The Edge (Layer 1)', proj)
  line('baseline: PPG', ppg)
  console.log(
    `  ${'actual'.padEnd(18)} ${''.padStart(6)}  ${''.padStart(9)}  ${''.padStart(6)}  ${''.padStart(6)}  ` +
      `${(actual.reduce((s, x) => s + x, 0) / actual.length).toFixed(2).padStart(5)}`
  )
}

main().catch((error) => {
  console.error('\nBacktest failed:', error.message)
  process.exit(1)
})
