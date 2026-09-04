/**
 * Explains the two scales (section 6.4).
 *
 * Worth the space because the convention is deliberately counter-intuitive:
 * users are trained that a low FDR is good, and Fixture Score inverts that.
 * Colour is the constant, the number is not, so the legend says so directly
 * rather than leaving the reader to infer it from the shading.
 */
export function FixturesLegend() {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            Fixture cells
          </span>
          <span className="flex items-center gap-1">
            <span className="text-[11px]">easy</span>
            <Swatch className="bg-emerald-200 dark:bg-emerald-800" />
            <Swatch className="bg-emerald-100 dark:bg-emerald-900/60" />
            <Swatch className="bg-neutral-100 dark:bg-neutral-800" />
            <Swatch className="bg-rose-100 dark:bg-rose-900/50" />
            <Swatch className="bg-rose-200 dark:bg-rose-800" />
            <span className="text-[11px]">hard</span>
          </span>
        </div>

        <p className="max-w-prose">
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            Green is good in both,
          </span>{' '}
          but the number under it is not the same. A fixture cell shows
          difficulty, where low is good. The summary shows Fixture Score on a{' '}
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            0 to 10 scale where high is good
          </span>
          , with 6.0 an average run. Because it is per gameweek rather than a
          total, a score means the same thing at any horizon. It reads as score
          then fixture count, so{' '}
          <span className="whitespace-nowrap font-medium text-neutral-700 dark:text-neutral-300">
            7.2 (5)
          </span>{' '}
          is 7.2 from 5 fixtures. A blank shows as an empty cell and drags the
          score down; a double splits the cell and pushes it up, and can take
          the score past 10.
        </p>
      </div>
    </div>
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
