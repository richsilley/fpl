'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

/**
 * Escape-to-dismiss and focus return for every overlay (section 7.8).
 *
 * ## Why this exists at all
 *
 * The overlays are URL state, so opening, the backdrop and Close are all plain
 * links and none of them needs JavaScript. Two things a dialog owes a keyboard
 * user cannot be expressed that way: Escape is a key press, not a link, and
 * returning focus to whatever opened the dialog is something only the browser
 * can be told to do. This is the fourth and smallest Client Component, and it
 * renders nothing.
 *
 * ## It is an enhancement, never a requirement
 *
 * Without JavaScript the backdrop and the Close button still dismiss, which is
 * the behaviour section 7.8 actually specifies. This adds the keyboard path on
 * top. Nothing here is the only way to do anything.
 *
 * ## Focus return
 *
 * The trigger is captured on mount rather than looked up by selector on close,
 * because by then the URL has changed and the element may have been
 * re-rendered. Dismissing navigates within the same route, so React keeps the
 * header's DOM nodes and the captured button is still the live one — hence the
 * `isConnected` check rather than a blind `focus()`, which would throw away the
 * user's place if the node had in fact been replaced.
 */
export function OverlayKeys({ closeHref }: { closeHref: string }) {
  const router = useRouter()
  const opener = useRef<HTMLElement | null>(null)

  useEffect(() => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const onKeyDown = (event: KeyboardEvent) => {
      // `defaultPrevented` leaves Escape to anything that has already claimed
      // it — an open native select inside the dialog, most obviously.
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        router.push(closeHref, { scroll: false })
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      const trigger = opener.current
      if (trigger?.isConnected) {
        trigger.focus()
      }
    }
  }, [router, closeHref])

  return null
}
