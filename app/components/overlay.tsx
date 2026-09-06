import Link from 'next/link'

/**
 * The floating-panel pattern, shared by the menu drawer, the Ownership
 * population picker and the replacement panel (section 7.8).
 *
 * ## Why these float rather than push
 *
 * All three used to sit in the document flow, which meant opening one shoved
 * everything below it down the page — the table you were reading moved out
 * from under you at the moment you asked a question about it. Floating keeps
 * the page still.
 *
 * ## Why it is URL state and not client state
 *
 * Opening is a link and the backdrop is a link, so an overlay needs no client
 * JavaScript, survives the back button, and cannot get stuck open. Clicking
 * anywhere outside the panel lands on the backdrop and navigates back to the
 * closed URL, which is the dismiss-on-click-away behaviour for free.
 */
export function Overlay({
  closeHref,
  label,
  children,
  align = 'centre',
}: {
  /** Where the backdrop and the close button navigate to. */
  closeHref: string
  label: string
  children: React.ReactNode
  /** `drawer` pins to the left edge and fills the height; `centre` floats. */
  align?: 'centre' | 'drawer'
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50"
    >
      {/* A link, not a div: dismissing by clicking away is then the same
          navigation as pressing Close, with nothing to keep in sync. */}
      <Link
        href={closeHref}
        scroll={false}
        aria-label={`Close ${label}`}
        className="absolute inset-0 bg-neutral-900/30 backdrop-blur-[1px] dark:bg-neutral-950/50"
      />

      <div
        className={
          align === 'drawer'
            ? 'absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] flex-col overflow-y-auto border-r border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900'
            : 'absolute left-1/2 top-4 max-h-[calc(100vh-2rem)] w-[min(46rem,94vw)] -translate-x-1/2 overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-2xl sm:top-10 dark:border-neutral-700 dark:bg-neutral-900'
        }
      >
        {children}
      </div>
    </div>
  )
}
