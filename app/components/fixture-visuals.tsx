import {
  formatFixtureScore,
  NEUTRAL_SCORE,
  type FixtureScore,
  type TeamFixture,
} from '@/lib/fpl/fixtures'

/**
 * The shading and cell rendering shared by the Fixtures view (7.2) and Club
 * Blocks (7.5).
 *
 * Both views draw the same fixtures over the same horizon, so they share these
 * rather than each having their own. A club reading green in one view and
 * amber in the other would be a bug the reader could see.
 *
 * ## Colour
 *
 * Section 6.4: green means good everywhere, and the number under it changes
 * meaning. A fixture cell shows raw FDR, so green is a *low* number. A score
 * badge shows Fixture Score, so green is a *high* number. Keeping the colour
 * constant is the point; the two scales below are deliberately inverted
 * relative to each other.
 */

/** Fixture cell shading: raw FDR, so green is a low number (section 6.4). */
export const FDR_TONE: Record<number, string> = {
  1: 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50',
  2: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100',
  3: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  4: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
  5: 'bg-rose-200 text-rose-950 dark:bg-rose-800 dark:text-rose-50',
}

/**
 * Summary shading: Fixture Score, so green is a high number (section 6.4).
 *
 * Normalising (section 6.1) made this simple. The score no longer scales with
 * the horizon, so the thresholds are fixed points on the 0 to 10 scale rather
 * than ratios against a moving baseline, and a band means the same thing at a
 * horizon of 1 as at 10. They sit symmetrically around `NEUTRAL_SCORE`, the
 * all-FDR-3 run: a whole horizon of FDR 2 scores 8.0 and lands in the top
 * band, a whole horizon of FDR 4 scores 4.0 and lands in the bottom one.
 *
 * Scores over 10 from a double gameweek simply fall in the top band. Section
 * 6.1 says not to cap them, and nothing here does.
 */
export function scoreTone(score: number): string {
  if (score >= NEUTRAL_SCORE + 1.5) {
    return 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50'
  }
  if (score >= NEUTRAL_SCORE + 0.5) {
    return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100'
  }
  if (score >= NEUTRAL_SCORE - 0.5) {
    return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
  }
  if (score >= NEUTRAL_SCORE - 1.5) {
    return 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100'
  }
  return 'bg-rose-200 text-rose-950 dark:bg-rose-800 dark:text-rose-50'
}

/**
 * One gameweek for one club.
 *
 * Sections 6.5 and 7.2: no fixtures is a blank and renders as an empty cell;
 * two fixtures is a double and splits the cell, each half shaded by its own
 * FDR since the two opponents are rarely of equal difficulty.
 */
export function FixtureCell({ fixtures }: { fixtures: TeamFixture[] }) {
  // `h-full` makes the cell fill the row, which matters below the sm
  // breakpoint where the first column carries a second line and so sets a
  // taller row. `min-h-11` keeps a sensible floor above that.
  if (fixtures.length === 0) {
    return (
      <div className="h-full min-h-11">
        <span className="sr-only">Blank gameweek</span>
      </div>
    )
  }

  const split = fixtures.length > 1

  return (
    <div className="flex h-full min-h-11 flex-col gap-px">
      {fixtures.map((fixture, position) => (
        <div
          key={`${fixture.opponent}-${position}`}
          className={`flex flex-1 items-center justify-center gap-0.5 leading-none ${
            split ? 'text-[10px]' : 'text-xs'
          } ${FDR_TONE[fixture.fdr] ?? FDR_TONE[3]}`}
          title={`${fixture.isHome ? 'Home to' : 'Away at'} ${fixture.opponentName} (difficulty ${fixture.fdr})`}
        >
          <span className="font-medium">{fixture.opponent}</span>
          <span className="text-[9px] uppercase opacity-70">
            {fixture.isHome ? 'H' : 'A'}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * Section 6.3: the score to one decimal place, then the fixture count in
 * brackets, e.g. "7.2 (5)".
 *
 * Under normalisation the count matters more, not less: dividing by gameweeks
 * compresses the range, so the count is what explains a surprising score. It
 * is also what lets the reader decide what a double is worth, rather than the
 * app deciding for them.
 */
export function ScoreBadge({
  summary,
  compact = false,
}: {
  summary: FixtureScore
  compact?: boolean
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded px-1.5 py-0.5 tabular-nums ${
        compact ? 'text-[11px]' : 'text-sm'
      } ${scoreTone(summary.score)}`}
    >
      <span className="font-semibold">{formatFixtureScore(summary.score)}</span>
      <span className="text-[11px] opacity-70">({summary.count})</span>
    </span>
  )
}
