/**
 * Explains the two scales (section 6.4) and the three difficulty modes (6.7).
 *
 * Worth the space because the convention is deliberately counter-intuitive:
 * users are trained that a low FDR is good, and Fixture Score inverts that.
 * Colour is the constant, the number is not, so the legend says so directly
 * rather than leaving the reader to infer it from the shading.
 *
 * ## It describes all three modes, always
 *
 * It used to swap its last paragraph for whichever mode was selected, which
 * meant the reader could only learn what a mode did by first switching to it.
 * The whole point of the paragraph is to help someone choose. All three stay
 * on screen and the text never moves, so nothing reflows on a mode switch;
 * which one is live is the selector's job to show, and it does.
 *
 * ## It is half its old length
 *
 * The removed material explained that a fixture cell's number and the summary
 * number meant opposite things. Cells no longer print a number at all — only
 * colour, opponent and venue — so the mismatch it warned about cannot happen,
 * and the warning was the longest thing here.
 */
export function FixturesLegend({ showOwned = false }: { showOwned?: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-neutral-200 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
      {/* One entry per row, each free to run the full width of the table above.
          These were three narrow columns under a full-width table, which broke
          every definition into fragments a third of the page wide while the
          rest of the line sat empty. */}
      <p>
        <Term>Fixture cells</Term> how hard each fixture is.
        <span className="ml-2 inline-flex items-center gap-1 align-middle">
          <span className="text-[11px]">easy</span>
          <Swatch className="bg-emerald-200 dark:bg-emerald-800" />
          <Swatch className="bg-emerald-100 dark:bg-emerald-900/60" />
          <Swatch className="bg-neutral-100 dark:bg-neutral-800" />
          <Swatch className="bg-rose-100 dark:bg-rose-900/50" />
          <Swatch className="bg-rose-200 dark:bg-rose-800" />
          <span className="text-[11px]">hard</span>
        </span>
      </p>

      <p>
        <Term>Fixture Score</Term> the run ahead, 0 to 10. Higher is better, 6.0
        is average. It measures the opposition only, not how good your own club
        is. The bracket is the number of fixtures:{' '}
        <span className="whitespace-nowrap tabular-nums">7.2 (5)</span> means
        7.2 across five games.
      </p>

      <p>
        <Term>Team Strength</Term> how in form the club is right now, 0 to 10.
      </p>

      {/* Teams only: the Fixtures view has no Owned column to explain. */}
      {showOwned && (
        <p>
          <Term>Owned</Term> which of your players come from each club. FPL
          allows three per club, so a club showing three is closed to you until
          you sell one.
        </p>
      )}

      <p>
        The two are separate on purpose. Coventry have easy fixtures but are
        bottom of the form table. Chelsea have hard fixtures and are flying.
        Those are different bets, and one number would hide that.
      </p>

      <div className="space-y-1 pt-1">
        <p className="font-medium text-neutral-700 dark:text-neutral-300">
          Difficulty modes
        </p>
        {/* All three are described whichever is selected, so nothing below
            this block moves when the mode changes. */}
        <p>
          <Term>FPL</Term> the official rating, set before the season and never
          updated.
        </p>
        <p>
          <Term>Form</Term> our rating, built from results so far and updated
          weekly.
        </p>
        <p>
          <Term>Blended</Term> the form rating adjusted for how good each club
          is. It changes the cell colours only; Fixture Score and Team Strength
          stay the same.
        </p>
      </div>
    </div>
  )
}

/** The thing being defined, picked out so the definitions scan as a list. */
function Term({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-medium text-neutral-700 dark:text-neutral-300">
      {children}
    </span>
  )
}

function Swatch({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 w-4 rounded-sm ${className}`}
    />
  )
}
