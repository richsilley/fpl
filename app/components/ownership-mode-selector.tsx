import Link from 'next/link'

import { buildHref, type ClubSort } from '@/lib/fpl/params'
import type { ReferenceMode } from '@/lib/fpl/reference'
import type { SquadManager } from '@/lib/fpl/squad'
import type { Horizon } from '@/lib/fpl/horizon'

/**
 * Picks the comparison population for the Ownership view (section 7.4).
 *
 * Links and GET forms, like every other control, so the population lands in
 * the URL and the view stays shareable (section 8.2). Each option sets one of
 * `league` or `rival` and clears the other, so the two never conflict.
 *
 * The manager's own mini leagues are offered directly. Section 5.1 notes the
 * entry payload carries them, and it is already fetched, so making someone
 * look up a league ID for a league they are in would be a pointless step.
 */
export function OwnershipModeSelector({
  managerId,
  manager,
  mode,
  leagueId,
  rivalId,
  horizon,
  sort,
}: {
  managerId: string
  manager: SquadManager
  mode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
  horizon: Horizon
  sort: ClubSort
}) {
  const base = { id: managerId, view: 'ownership' as const, horizon, sort }

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Compare against
        </span>

        <span className="flex flex-wrap items-center gap-1.5">
          <ModeLink
            href={buildHref(base)}
            selected={mode === 'global'}
            label="All managers"
          />

          {manager.leagues.map((league) => (
            <ModeLink
              key={league.id}
              href={buildHref({ ...base, league: String(league.id) })}
              selected={mode === 'league' && leagueId === league.id}
              label={league.name}
              detail={league.size === null ? undefined : `${league.size}`}
            />
          ))}
        </span>
      </div>

      <div className="flex flex-col gap-3 border-t border-neutral-100 pt-3 sm:flex-row sm:gap-6 dark:border-neutral-800/70">
        <IdForm
          name="league"
          label="Another league ID"
          placeholder="540385"
          current={mode === 'league' ? leagueId : null}
          base={base}
        />
        <IdForm
          name="rival"
          label="Rival manager ID"
          placeholder="3921581"
          current={mode === 'rival' ? rivalId : null}
          base={base}
        />
      </div>
    </div>
  )
}

function ModeLink({
  href,
  selected,
  label,
  detail,
}: {
  href: string
  selected: boolean
  label: string
  detail?: string
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'true' : undefined}
      scroll={false}
      className={`inline-flex items-baseline gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-colors ${
        selected
          ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
          : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
      }`}
    >
      <span className="max-w-[14rem] truncate">{label}</span>
      {detail && (
        <span
          className={`text-[11px] tabular-nums ${selected ? 'opacity-70' : 'text-neutral-400 dark:text-neutral-500'}`}
        >
          {detail}
        </span>
      )}
    </Link>
  )
}

/**
 * A plain GET form, so an arbitrary league or rival can be entered without any
 * client JavaScript. The hidden fields carry the rest of the URL state, and
 * the counterpart parameter is deliberately absent so submitting one mode
 * clears the other.
 */
function IdForm({
  name,
  label,
  placeholder,
  current,
  base,
}: {
  name: 'league' | 'rival'
  label: string
  placeholder: string
  current: number | null
  base: { id: string; view: 'ownership'; horizon: Horizon; sort: ClubSort }
}) {
  return (
    <form action="/" method="get" className="flex items-end gap-2">
      <input type="hidden" name="id" value={base.id} />
      <input type="hidden" name="view" value="ownership" />
      <input type="hidden" name="horizon" value={String(base.horizon)} />
      <input type="hidden" name="sort" value={base.sort} />

      <div>
        <label
          htmlFor={`${name}-id`}
          className="block text-xs font-medium text-neutral-600 dark:text-neutral-400"
        >
          {label}
        </label>
        <input
          id={`${name}-id`}
          name={name}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          defaultValue={current ?? ''}
          placeholder={placeholder}
          className="mt-1 w-32 rounded-md border border-neutral-300 px-2 py-1 text-sm tabular-nums text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/30 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-600"
        />
      </div>
      <button
        type="submit"
        className="rounded-md border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        Compare
      </button>
    </form>
  )
}
