'use client'

import { useLinkStatus } from 'next/link'

/**
 * Instant feedback on the tab that was just pressed.
 *
 * ## Why this exists
 *
 * Every view is the same route with different search params, so switching one
 * is a server round trip. Measured against production that is about 200ms
 * warm, 350ms on 4G and up to 800ms for Ownership in league mode — and until
 * it returned, **nothing on screen changed at all**. The pressed tab did not
 * highlight, because its highlight comes from `aria-current` in the server's
 * response. A press that produces no reaction for a third of a second does not
 * read as slow, it reads as not having registered, so people press again.
 *
 * ## Why not `loading.tsx`, which the Next docs prefer
 *
 * `loading.tsx` is the better answer when the thing being replaced is the
 * page. Here the header, the scratch strip and the tabs themselves all live in
 * `page.tsx`, so a route-level fallback would blank the tab you just pressed
 * and flash the whole shell on every switch. Moving the shell into a layout is
 * not available either: it is built from `searchParams`, which layouts do not
 * receive.
 *
 * That leaves this route dynamic with no loading file, which is the exact case
 * `useLinkStatus` documents itself for. It also means prefetching is skipped
 * for these links, so the pending phase is always real and never a flicker on
 * an already-prefetched route.
 *
 * ## Shape
 *
 * Always rendered, opacity toggled, absolutely positioned. The docs warn that
 * inline indicators cause layout shift; nothing here participates in layout,
 * so the tab does not move when it starts or stops.
 *
 * It deliberately does **not** paint the pressed tab as selected. The tab that
 * is still selected stays selected until the new view actually arrives, and two
 * tabs looking equally chosen would be a worse lie than a moment of delay. This
 * says "working on it", which is the true statement.
 */
export function TabPending() {
  const { pending } = useLinkStatus()

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden rounded-md transition-opacity duration-100 ${
        pending ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span className="absolute inset-0 rounded-md bg-neutral-900/[0.06] dark:bg-white/[0.08]" />
      {/* An indeterminate sweep: the wait is a network round trip, so there is
          no progress to report, only that something is happening. */}
      <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden">
        <span className="tab-sweep absolute inset-y-0 w-1/3 rounded-full bg-neutral-500 dark:bg-neutral-300" />
      </span>
    </span>
  )
}
