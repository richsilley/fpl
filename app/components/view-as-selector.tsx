import Link from 'next/link'

import { AutoSubmitSelect } from '@/app/components/auto-submit-select'
import type { Horizon } from '@/lib/fpl/horizon'
import {
  buildHref,
  carriedFields,
  withoutViewAs,
  type CarriedState,
  type ViewId,
} from '@/lib/fpl/params'
import type { LeagueMember } from '@/lib/fpl/reference'
import type { SquadManager } from '@/lib/fpl/squad'

/**
 * Loads someone else's squad into every view.
 *
 * ## Two dropdowns, not one
 *
 * A rival is chosen through their league — pick the league, then pick the team
 * — because a flat list would be every manager in every league you are in, and
 * "Dave" means nothing without the league that gives it context. The league
 * dropdown also has to come first because it is what decides which managers
 * can be fetched at all.
 *
 * The team dropdown is therefore absent until a league is chosen. Rendering it
 * empty and disabled would be a control that does nothing, which is worse than
 * a control that is not there yet.
 *
 * ## It sits above the tabs, not inside a view
 *
 * Whose squad you are looking at outranks which columns you are looking at, so
 * the control lives above the view tabs and stays put on all four. Switching
 * view keeps the borrowed squad; switching squad keeps the view.
 *
 * ## `id` never changes
 *
 * The URL keeps your own manager ID in `id` and puts the borrowed one in `as`.
 * That is what makes reverting a single link with nothing to remember, and it
 * is why the league list stays yours rather than becoming the borrowed
 * manager's the moment you look at their squad.
 */
export function ViewAsSelector({
  managerId,
  leagues,
  members,
  viewingAs,
  view,
  horizon,
  sort,
  carry,
}: {
  /** The user's own manager ID: `id`, never the squad on screen. */
  managerId: string
  /** The user's own mini leagues. */
  leagues: SquadManager['leagues']
  /** Managers in the selected league, or null when none is selected. */
  members: LeagueMember[] | null
  /** The borrowed squad, when one is on screen. */
  viewingAs: { id: number; teamName: string } | null
  view: ViewId
  horizon: Horizon
  sort: string | null
  carry: CarriedState
}) {
  const base = { id: managerId, view, horizon, sort }
  const hidden = carriedFields({ ...base, ...carry })

  // Choosing a different league invalidates the manager chosen from the old
  // one, so `as` is cleared here. Choosing a manager keeps the league, so the
  // dropdown that produced them is still there to choose again from.
  const leagueOptions = leagues.map((league) => ({
    value: String(league.id),
    label:
      league.size === null
        ? league.name
        : `${league.name} (${league.size} managers)`,
    href: buildHref({
      ...base,
      ...carry,
      as: null,
      asLeague: String(league.id),
    }),
  }))

  const memberOptions = (members ?? []).map((member) => ({
    value: String(member.id),
    label: `${member.teamName} — ${member.managerName}`,
    href: buildHref({ ...base, ...carry, as: String(member.id) }),
  }))

  if (leagues.length === 0) {
    return null
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4 ${
        viewingAs
          ? 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/25'
          : 'border-neutral-200 dark:border-neutral-800'
      }`}
    >
      <span className="text-sm font-medium text-neutral-700 sm:pb-1 dark:text-neutral-300">
        View as
      </span>

      <AutoSubmitSelect
        id="viewas-league"
        name="asleague"
        label="From league"
        value={carry.asLeague ?? ''}
        placeholder="Choose a league…"
        options={leagueOptions}
        hidden={hidden}
        submitLabel="Show"
      />

      {members !== null && (
        <AutoSubmitSelect
          id="viewas-team"
          name="as"
          label="Team"
          value={carry.as ?? ''}
          placeholder="Choose a team…"
          options={memberOptions}
          hidden={hidden}
          submitLabel="View"
        />
      )}

      {/* Always on screen while a borrowed squad is, and one press: the way
          back must never be something you have to reconstruct from the
          dropdowns you came in through. */}
      {viewingAs && (
        <Link
          href={buildHref({ ...base, ...withoutViewAs(carry) })}
          scroll={false}
          className="inline-flex items-center gap-1.5 self-start rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 sm:self-auto dark:border-neutral-200 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <span aria-hidden>←</span>
          Back to my team
        </Link>
      )}

      {viewingAs && (
        <p
          role="status"
          className="w-full text-xs text-amber-900 dark:text-amber-200"
        >
          Showing{' '}
          <strong className="font-semibold">{viewingAs.teamName}</strong>. Every
          view below is their squad, not yours.
        </p>
      )}
    </div>
  )
}
