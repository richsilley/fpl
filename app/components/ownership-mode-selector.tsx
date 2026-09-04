import Link from 'next/link'

import { AutoSubmitSelect } from '@/app/components/auto-submit-select'
import {
  buildHref,
  carriedFields,
  type AppState,
  type CarriedState,
  type ClubSort,
} from '@/lib/fpl/params'
import type { LeagueMember, ReferenceMode } from '@/lib/fpl/reference'
import type { SquadManager } from '@/lib/fpl/squad'
import type { Horizon } from '@/lib/fpl/horizon'

/**
 * Picks the comparison population for the Ownership view (section 7.4).
 *
 * Links and GET forms, like every other control, so the population lands in
 * the URL and the view stays shareable (section 8.2).
 *
 * The manager's own mini leagues are offered directly. Section 5.1 notes the
 * entry payload carries them, and it is already fetched, so making someone
 * look up a league ID for a league they are in would be a pointless step.
 *
 * ## Why `league` and `rival` can both be set
 *
 * Picking a rival out of a league keeps the league in the URL. It is no longer
 * the population — `rival` wins in `ownershipModeOf` — but it is what the
 * dropdown was built from, and clearing it would make the dropdown disappear
 * the instant it was used, leaving no way back to the league's other managers
 * except retyping the league.
 */
export function OwnershipModeSelector({
  managerId,
  manager,
  mode,
  leagueId,
  rivalId,
  horizon,
  sort,
  members,
  carry,
}: {
  managerId: string
  manager: SquadManager
  mode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
  horizon: Horizon
  sort: ClubSort
  /** The selected league's managers, or null when no league is selected. */
  members: LeagueMember[] | null
  /** View-as target, passed through so every link here preserves it. */
  carry: CarriedState
}) {
  // `league` and `rival` are what this control sets, so they are left out of
  // the base and written explicitly per link. The view-as target is not, so it
  // rides along untouched.
  const base: AppState = {
    id: managerId,
    view: 'ownership',
    horizon,
    sort,
    as: carry.as,
    asLeague: carry.asLeague,
  }
  const league = leagueId === null ? undefined : String(leagueId)

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

          {manager.leagues.map((entry) => (
            <ModeLink
              key={entry.id}
              href={buildHref({ ...base, league: String(entry.id) })}
              selected={mode === 'league' && leagueId === entry.id}
              label={entry.name}
              detail={entry.size === null ? undefined : `${entry.size}`}
            />
          ))}
        </span>
      </div>

      {/* Only meaningful once a league is selected, which is also the only
          time there is a list to build it from. In global mode there is no
          dropdown at all rather than an empty one. */}
      {members !== null && (
        <RivalPicker
          members={members}
          rivalId={mode === 'rival' ? rivalId : null}
          base={base}
          league={league}
        />
      )}

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
          // Given the league, so typing a rival from outside it does not throw
          // away the league the dropdown is built from.
          base={{ ...base, league }}
        />
      </div>
    </div>
  )
}

/**
 * The league's managers as a dropdown, so a rival can be chosen by name.
 *
 * Costs no extra request: the list comes from the standings call the league
 * comparison already makes, whose rows carry the manager ID, team name and
 * manager name (section 5.1).
 *
 * **Choosing a manager loads the comparison; there is no Compare button.**
 * Selecting a rival has exactly one possible meaning, so a second press to
 * confirm it asked the reader to say the same thing twice. The `<select>` is
 * still inside a real GET form and still has a submit button for anyone
 * without JavaScript; see `AutoSubmitSelect`.
 */
function RivalPicker({
  members,
  rivalId,
  base,
  league,
}: {
  members: LeagueMember[]
  rivalId: number | null
  base: AppState
  league: string | undefined
}) {
  if (members.length === 0) {
    return (
      <p className="border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-800/70 dark:text-neutral-400">
        This league has no other managers to compare against yet.
      </p>
    )
  }

  const state: AppState = { ...base, league }

  return (
    <div className="border-t border-neutral-100 pt-3 dark:border-neutral-800/70">
      <AutoSubmitSelect
        id="rival-pick"
        name="rival"
        label="A manager from this league"
        value={rivalId === null ? '' : String(rivalId)}
        placeholder="Choose a manager…"
        options={members.map((member) => ({
          value: String(member.id),
          label: `${member.teamName} — ${member.managerName}`,
          href: buildHref({ ...state, rival: String(member.id) }),
        }))}
        hidden={carriedFields(state)}
        submitLabel="Compare"
      />
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
 * client JavaScript. The hidden fields carry the rest of the URL state.
 *
 * These keep their button. Unlike a dropdown, a text field has no moment at
 * which the user has unambiguously finished, so there is nothing to act on
 * until they say so.
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
  base: AppState
}) {
  return (
    <form action="/" method="get" className="flex items-end gap-2">
      {carriedFields(base)
        // The text field writes this one itself; a hidden field of the same
        // name would submit both values.
        .filter((field) => field.name !== name)
        .map((field) => (
          <input
            key={field.name}
            type="hidden"
            name={field.name}
            value={field.value}
          />
        ))}

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
