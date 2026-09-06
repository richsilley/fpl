import Link from 'next/link'

import { OverlayKeys } from '@/app/components/overlay-keys'

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
 *
 * `OverlayKeys` adds Escape and focus return on top, which are the two things
 * a link cannot express. Every overlay gets them, so all of them dismiss
 * identically.
 *
 * ## Every overlay is centred
 *
 * The menu used to be a left drawer while the other two floated in the middle,
 * which made one settings panel look like a different kind of thing from the
 * others. `width` is the only axis they differ on now, because their contents
 * genuinely differ in how much room they need.
 */
export function Overlay({
  closeHref,
  label,
  children,
  width = 'wide',
}: {
  /** Where the backdrop and the close button navigate to. */
  closeHref: string
  label: string
  children: React.ReactNode
  /** `wide` suits a table of candidates; `narrow` a short stack of controls. */
  width?: 'wide' | 'narrow'
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50"
    >
      <OverlayKeys closeHref={closeHref} />

      {/* A link, not a div: dismissing by clicking away is then the same
          navigation as pressing Close, with nothing to keep in sync. */}
      <Link
        href={closeHref}
        scroll={false}
        aria-label={`Close ${label}`}
        className="absolute inset-0 bg-neutral-900/30 backdrop-blur-[1px] dark:bg-neutral-950/50"
      />

      <div
        className={`absolute left-1/2 top-4 flex max-h-[calc(100vh-2rem)] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-2xl sm:top-10 dark:border-neutral-700 dark:bg-neutral-900 ${
          width === 'narrow' ? 'w-[min(30rem,94vw)]' : 'w-[min(46rem,94vw)]'
        }`}
      >
        {children}
      </div>
    </div>
  )
}
