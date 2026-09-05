/**
 * A short note under the Form table (section 7.3).
 *
 * The view had no legend, and most of it needs none: the columns are labelled
 * and the bars are self-evident once you know they are bars. The xP column is
 * the exception, because a number in this app's table is naturally read as
 * this app's number, and that one is not. Saying so is the whole reason this
 * exists, and the bar scales ride along because the box is already there.
 */
export function FormLegend() {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
      <p className="max-w-prose">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          xP (FPL) is Fantasy Premier League&rsquo;s own expected points for the
          next gameweek, not this app&rsquo;s.
        </span>{' '}
        It is their model&rsquo;s summary of the columns to its left, so it gets
        no bar: it is a conclusion drawn from them rather than another input
        competing with them. Everything else on this table is measured, not
        predicted.
      </p>
      <p className="mt-2 max-w-prose">
        The bars are scaled differently on purpose.{' '}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Form
        </span>{' '}
        and{' '}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          xGI
        </span>{' '}
        run against the highest in this squad, so they compare these fifteen
        players.{' '}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Mins
        </span>{' '}
        runs against the minutes available, so a full bar means every minute
        played whoever else is in the squad.{' '}
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          DefCon
        </span>{' '}
        runs against the player&rsquo;s own threshold for the two defensive
        contribution points, 10 for a defender and 12 for a midfielder or
        forward, so a full bar means they clear it on average.
      </p>
    </div>
  )
}
