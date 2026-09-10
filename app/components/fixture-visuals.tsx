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

/** Fixture cell shading: difficulty, so green is a low number (section 6.4). */
export const FDR_TONE: Record<number, string> = {
  1: 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50',
  2: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100',
  3: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  4: 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
  5: 'bg-rose-200 text-rose-950 dark:bg-rose-800 dark:text-rose-50',
}

/**
 * The band a difficulty falls in.
 *
 * The five bands above are unchanged; this only decides which one a number
 * lands in. FPL's own rating is always a whole number and lands on its band
 * exactly. The custom rating (section 6.7) is a fraction, so it is rounded to
 * the nearest band rather than missing every key and falling through to the
 * neutral one.
 */
export function fdrTone(fdr: number): string {
  const band = Math.min(5, Math.max(1, Math.round(fdr)))
  return FDR_TONE[band]
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
/**
 * A whole number stays whole, a fraction gets one decimal. FPL's ratings are
 * integers and printing "3.0" for them would imply a precision they do not
 * have; the custom rating's "2.7" is real.
 */
function formatDifficulty(fdr: number): string {
  return Number.isInteger(fdr) ? String(fdr) : fdr.toFixed(1)
}

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
          className={`group flex flex-1 cursor-default items-center justify-center gap-0.5 leading-none outline-none ${
            split ? 'text-[10px]' : 'text-xs'
          } ${fdrTone(fixture.fdr)}`}
          title={`${fixture.isHome ? 'Home to' : 'Away at'} ${fixture.opponentName} (difficulty ${formatDifficulty(fixture.fdr)})`}
          // Focusable by click and tap but skipped by the keyboard. A cell is
          // not a control, and a full fixture list is 540 of them; putting
          // every one in the tab order would wreck keyboard navigation of the
          // table for the sake of a number the `title` and screen-reader text
          // already give.
          tabIndex={-1}
        >
          {/* The number is never printed in the cell. Opponent and venue are
              already two pieces of information, and a third is unreadable
              across 36 columns at 380px. It appears on hover, and on tap,
              which is what the focus state is for. */}
          <span className="font-medium group-hover:hidden group-focus:hidden">
            {fixture.opponent}
          </span>
          <span className="text-[9px] uppercase opacity-70 group-hover:hidden group-focus:hidden">
            {fixture.isHome ? 'H' : 'A'}
          </span>
          <span
            aria-hidden
            className="hidden font-semibold tabular-nums group-hover:inline group-focus:inline"
          >
            {formatDifficulty(fixture.fdr)}
          </span>
          <span className="sr-only">
            {fixture.isHome ? 'Home to' : 'Away at'} {fixture.opponentName},
            difficulty {formatDifficulty(fixture.fdr)}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * The weakest club in the league, displayed.
 *
 * Team Strength is a linear scale across the twenty clubs, so whoever sits at
 * the bottom lands on exactly 0.0 by construction — and "0.0" reads as a
 * figure that failed to load rather than as the lowest one there is. Floored
 * for display only: nothing that ranks, sorts or colours a club sees this, so
 * the bottom club is still bottom and still shaded as such.
 */
const MIN_DISPLAYED_STRENGTH = 0.5

/**
 * Team Strength gets its own colour bands, not Fixture Score's.
 *
 * The two share a 0-to-10 axis and nothing else. **Fixture Score clusters**:
 * it is built from FDR, an all-average run scores exactly 6.0, and real runs
 * sit close to that, so bands at 6.0 +/- 0.5 and +/- 1.5 put most of the table
 * in the middle and pick out the genuine outliers.
 *
 * **Team Strength is uniform by construction.** It is a linear rescale of the
 * twenty clubs between the weakest and the strongest, so the values are spread
 * evenly across the range and its midpoint is 5.0, not 6.0. Read through
 * Fixture Score's bands, a one-point-wide neutral zone sitting half a point
 * above the true middle caught almost nothing: eighteen of twenty clubs came
 * out either green or red, which says only "above or below average" and hides
 * the difference between a mid-table side and a genuinely strong one.
 *
 * Wider middle, centred on 5.0. Roughly a fifth of the league now reads as
 * unremarkable, which is the honest answer for a mid-table club.
 */
const STRENGTH_BANDS = { high: 7.5, mid: 6, low: 4, bottom: 2.5 }

export function strengthTone(strength: number): string {
  if (strength >= STRENGTH_BANDS.high) {
    return 'bg-emerald-200 text-emerald-950 dark:bg-emerald-800 dark:text-emerald-50'
  }
  if (strength >= STRENGTH_BANDS.mid) {
    return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-100'
  }
  if (strength >= STRENGTH_BANDS.low) {
    return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'
  }
  if (strength >= STRENGTH_BANDS.bottom) {
    return 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100'
  }
  return 'bg-rose-200 text-rose-950 dark:bg-rose-800 dark:text-rose-50'
}

/**
 * Team Strength: how in form a club is, 0 to 10, on the same colour bands as
 * Fixture Score.
 *
 * Shared rather than one copy per view, which is what the two had. They were
 * identical, and the floor above is exactly the kind of rule that would have
 * been applied to one of them.
 */
export function StrengthBadge({
  value,
  compact = false,
}: {
  value: number
  compact?: boolean
}) {
  const shown = Math.max(value, MIN_DISPLAYED_STRENGTH).toFixed(1)
  return (
    <span
      title={`Team Strength ${shown} of 10`}
      className={`inline-flex items-baseline rounded px-1.5 py-0.5 tabular-nums ${
        compact ? 'text-[11px]' : 'text-sm'
      } ${strengthTone(value)}`}
    >
      <span className="font-semibold">{shown}</span>
      <span className="sr-only"> team strength out of 10</span>
    </span>
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
