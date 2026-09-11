import type { ChipStatus } from '@/lib/fpl/chips'

/**
 * A rival's remaining chips (section 7.9).
 *
 * Shown on **The Edge and on Ownership**, both only in rival scope, and in
 * both cases only ever the rival's own chips. It sits under the direction
 * guidance on Ownership because it answers the question that guidance raises:
 * being told to chase a rival is worth little without knowing whether they
 * still hold a wildcard to answer with.
 *
 * Shared rather than copied. The two views would otherwise disagree about what
 * a spent chip looks like, and the allowance is a rule of the game that has
 * changed mid-season before.
 *
 * Deliberately no free transfer count: FPL does not publish one, and the only
 * way to infer it breaks around wildcard and free hit weeks (see `chips.ts`).
 */
export function ChipStrip({
  chips,
  rivalName,
}: {
  chips: ChipStatus[]
  rivalName: string
}) {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 text-xs dark:border-neutral-800">
      <p className="font-medium text-neutral-700 dark:text-neutral-300">
        Chips {rivalName} has left
      </p>
      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-neutral-600 dark:text-neutral-400">
        {chips.map((chip) => (
          <div key={chip.label} className="flex items-baseline gap-1.5">
            <dt>{chip.label}</dt>
            <dd
              className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${
                chip.remaining === 0
                  ? 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-600'
                  : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100'
              }`}
            >
              {chip.remaining} of {chip.total}
            </dd>
            {chip.playedIn.length > 0 && (
              <dd className="text-neutral-400 dark:text-neutral-500">
                used GW{chip.playedIn.join(', GW')}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  )
}
