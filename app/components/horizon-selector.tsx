'use client'

import Link from 'next/link'
import { useState } from 'react'

// From ./horizon and ./params rather than ./fixtures: this is a Client
// Component, and fixtures.ts is `server-only`.
import { HORIZON_PRESETS, type Horizon } from '@/lib/fpl/horizon'
import {
  buildHref,
  carriedFields,
  type CarriedState,
  type ViewId,
} from '@/lib/fpl/params'

/**
 * The horizon control (section 7.6), shared with Club Blocks when that lands.
 *
 * Both the presets and the input drive the same `horizon` URL parameter
 * (section 8.2), so the horizon survives a view switch and a shared link
 * reproduces it.
 *
 * ## Why this one component takes client JavaScript
 *
 * The rest of the page is server-rendered with no client bundle. Section 7.6
 * asks for live feedback though: typing a custom value has to clear the preset
 * highlight, and typing one that matches a preset has to light it up, both
 * before anything is submitted. That is state that only exists in the browser.
 *
 * It degrades properly. The presets are real links and the input sits in a
 * real GET form, so with JavaScript off, clicking a preset or submitting the
 * form still navigates and the server still renders the right horizon. The
 * client state only drives the highlight.
 */
export function HorizonSelector({
  managerId,
  horizon,
  maxHorizon,
  view,
  sort,
  carry,
}: {
  managerId: string
  horizon: Horizon
  /** Gameweeks left in the season: the largest value the input accepts. */
  maxHorizon: number
  /** Carried through so changing the horizon stays on the current view. */
  view: ViewId
  /** Carried through so changing the horizon keeps the Club Blocks sort. */
  sort: string | null
  /** Carried through so it survives too (section 8.2). */
  /** Ownership population and view-as target, carried untouched (section 8.2). */
  carry: CarriedState
}) {
  // Mirrors the input so the highlight can follow what is typed, rather than
  // only what has been applied. Seeded from the applied horizon; the caller
  // keys this component on that horizon, so a navigation remounts it and
  // reseeds the draft instead of needing an effect to resync.
  const [draft, setDraft] = useState(String(horizon))

  const href = (value: number) =>
    buildHref({ id: managerId, view, horizon: value, sort, ...carry })

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span
        id="horizon-label"
        className="text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        Horizon
      </span>

      <span className="flex flex-wrap items-center gap-2">
        <span
          role="group"
          aria-labelledby="horizon-label"
          className="inline-flex rounded-md border border-neutral-300 p-0.5 dark:border-neutral-700"
        >
          {[
            ...HORIZON_PRESETS.filter((preset) => preset < maxHorizon).map(
              (preset) => ({ value: preset, label: String(preset) })
            ),
            // "All" is the rest of the season. It resolves to a number like
            // any other horizon, so nothing downstream needs to know it is
            // special, and it lights up whenever the applied value happens to
            // be the whole remainder.
            { value: maxHorizon, label: 'All' },
          ].map(({ value, label }) => {
            // Highlights what is typed, not only what is applied, so a custom
            // value clears the presets as section 7.6 asks.
            const selected = draft === String(value)
            return (
              <Link
                key={label}
                href={href(value)}
                aria-current={selected ? 'true' : undefined}
                scroll={false}
                // Clicking a preset sets the numeric input (section 7.6).
                // Navigation reloads with the new value anyway; this keeps the
                // input in step immediately rather than after the round trip.
                onClick={() => setDraft(String(value))}
                className={`rounded px-2.5 py-1 text-sm font-medium tabular-nums transition-colors ${
                  selected
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800'
                }`}
              >
                {label}
                <span className="sr-only">
                  {label === 'All'
                    ? ` (${value} gameweeks, the rest of the season)`
                    : ' gameweeks'}
                </span>
              </Link>
            )
          })}
        </span>

        <span className="text-sm text-neutral-500 dark:text-neutral-400">
          or
        </span>

        <form action="/" method="get" className="flex items-center gap-2">
          {/* A GET form submits only its own fields, so the rest of the URL
              state has to ride along or applying a horizon would bounce the
              reader back to the default view and sort. */}
          {carriedFields({ id: managerId, view, sort, ...carry })
            // The number input writes this one itself.
            .filter((field) => field.name !== 'horizon')
            .map((field) => (
              <input
                key={field.name}
                type="hidden"
                name={field.name}
                value={field.value}
              />
            ))}
          <label htmlFor="horizon" className="sr-only">
            Custom horizon, 1 to {maxHorizon} gameweeks
          </label>
          <input
            id="horizon"
            name="horizon"
            type="number"
            min={1}
            max={maxHorizon}
            step={1}
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="w-16 rounded-md border border-neutral-300 px-2 py-1 text-sm tabular-nums text-neutral-900 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
          {/* The label is now one word, which leaves room to spell the unit
              out. The reader has to know what the number counts, and "GW"
              only reads as gameweeks to someone who already knows. */}
          <span
            aria-hidden
            className="text-sm text-neutral-500 dark:text-neutral-400"
          >
            gameweeks
          </span>
          <button
            type="submit"
            className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Apply
          </button>
        </form>
      </span>
    </div>
  )
}
