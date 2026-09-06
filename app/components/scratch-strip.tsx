import Link from 'next/link'

import type { ScratchPair, ScratchSquad } from '@/lib/fpl/scratch'
import { formatPrice } from '@/lib/format'

/**
 * The scratch squad's budget and warnings (section 7.7).
 *
 * ## Always on screen
 *
 * Section 7.7 asks for a persistent strip that is not scrolled away. It rides
 * in the sticky bar under the header rather than positioning itself, so the
 * two can never overlap. Over budget and a fourth player from one club are
 * both conditions you can create three swaps ago and only discover when you
 * try to make the transfers for real; the whole value of the warning is that
 * it is still there when you have stopped looking for it.
 *
 * ## Warnings never block
 *
 * They are stated plainly and that is all. A squad part-way through funding a
 * move is legitimately over budget, and one about to shed a defender may
 * legitimately hold four from a club for a moment. FPL rejects an invalid
 * final squad; this only has to make sure nothing is missed.
 */
export function ScratchStrip({
  scratch,
  resetHref,
  undoHref,
  dismissHref,
  showDropped,
}: {
  scratch: ScratchSquad
  resetHref: string
  undoHref: string
  /** Clears the stale-pair notice without touching the plan. */
  dismissHref: string
  showDropped: boolean
}) {
  const { applied, dropped, budget, warnings } = scratch
  const changed = applied.length > 0
  const problems = warnings.overBudget > 0 || warnings.clubsOverLimit.length > 0

  if (!changed && dropped.length === 0) {
    return null
  }

  return (
    <div
      className={`border-b px-5 py-3 backdrop-blur sm:px-8 lg:px-12 ${
        problems
          ? 'border-rose-300 bg-rose-50/95 dark:border-rose-900 dark:bg-rose-950/80'
          : 'border-neutral-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-900/90'
      }`}
    >
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2">
        {/* One line: what this is, how much has changed, what is left. The
            middle dots are separators, so they are hidden from the reader
            who is hearing this rather than seeing it. */}
        <span className="text-sm text-neutral-600 dark:text-neutral-300">
          <span className="font-semibold text-neutral-900 dark:text-neutral-50">
            Scratch squad
          </span>
          <Dot />
          {applied.length} change{applied.length === 1 ? '' : 's'}
          <Dot />
          <span
            className={`font-semibold tabular-nums ${
              budget.available < 0
                ? 'text-rose-700 dark:text-rose-300'
                : 'text-neutral-900 dark:text-neutral-50'
            }`}
          >
            {formatPrice(budget.available)}
          </span>{' '}
          available
        </span>

        {warnings.overBudget > 0 && (
          <Warning>Over budget by {formatPrice(warnings.overBudget)}</Warning>
        )}

        {warnings.clubsOverLimit.map((club) => (
          <Warning key={club.teamId}>
            {club.count} {club.clubName} players
          </Warning>
        ))}

        <span className="ml-auto flex items-center gap-2">
          {applied.length > 0 && (
            <Action href={undoHref}>Undo last change</Action>
          )}
          {changed && <Action href={resetHref}>Reset</Action>}
        </span>
      </div>

      {/* Two claims, and the order matters. The first is the one that stops a
          reader panicking that the app has edited their real team, so it leads
          and is emphasised; the caveat about the figures follows it.

          **The first sentence must never be truncated.** It is the only thing
          on screen saying the real team is untouched, so it is its own element
          that wraps rather than sharing a line that could clip. Section 7.7:
          the budget figures come from the last deadline and FPL does not
          republish them as prices move, so "available" without the caveat
          would overstate how exact it is. */}
      <p className="mx-auto mt-1.5 w-full max-w-[1600px] text-xs text-neutral-500 dark:text-neutral-400">
        <span className="font-medium text-neutral-700 dark:text-neutral-300">
          Nothing here changes your real FPL team.
        </span>{' '}
        Bank and squad value are from the last deadline and don&rsquo;t move
        with prices, so available funds are an estimate.
      </p>

      {showDropped && dropped.length > 0 && (
        <p
          role="status"
          className="mx-auto mt-2 flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <span>
            {dropped.length} saved change
            {dropped.length === 1 ? '' : 's'} no longer{' '}
            {dropped.length === 1 ? 'applies' : 'apply'}: the player they
            replaced is not in this squad any more. They have been dropped and
            the rest of the plan is unchanged.
          </span>
          <Link
            href={dismissHref}
            scroll={false}
            className="ml-auto shrink-0 font-medium underline underline-offset-2"
          >
            Dismiss
          </Link>
        </p>
      )}
    </div>
  )
}

/** A separator, not a word: hidden from screen readers. */
function Dot() {
  return (
    <span aria-hidden className="px-2 text-neutral-400 dark:text-neutral-600">
      &middot;
    </span>
  )
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-200 px-2 py-0.5 text-sm font-semibold text-rose-950 dark:bg-rose-900 dark:text-rose-50">
      <span aria-hidden>!</span>
      {children}
    </span>
  )
}

function Action({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      scroll={false}
      className="rounded-md border border-neutral-400 bg-white px-2.5 py-1 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
    >
      {children}
    </Link>
  )
}

/** Reads the applied pairs back as "Saka → Salah" for a summary line. */
export function describePairs(
  pairs: ScratchPair[],
  nameOf: (id: number) => string
): string {
  return pairs
    .map((pair) => `${nameOf(pair.out)} → ${nameOf(pair.in)}`)
    .join(', ')
}
