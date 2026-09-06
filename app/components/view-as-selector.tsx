import { AutoSubmitSelect } from '@/app/components/auto-submit-select'
import type { Horizon } from '@/lib/fpl/horizon'
import {
  buildHref,
  carriedFields,
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
 * ## It lives in the menu; the header carries the state
 *
 * The picker is used once and then forgotten, so it sits in the menu drawer
 * rather than occupying the top of every page. What must stay visible is the
 * *fact* that a borrowed squad is on screen, and that belongs with the name of
 * the squad: the header turns amber and carries the way back (section 7.1).
 * Duplicating the button here would be two ways to do one thing.
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
  panel,
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
  /** Which overlay is open, so a step that narrows a choice can keep it open. */
  panel: 'menu' | 'population' | null
}) {
  const base = { id: managerId, view, horizon, sort }
  const hidden = carriedFields({ ...base, ...carry })
  // The no-JS path has to keep the drawer open too, so the league form's
  // hidden fields carry the panel and the team form's deliberately do not.
  const leagueHidden = carriedFields({ ...base, ...carry, panel })

  // Choosing a different league invalidates the manager chosen from the old
  // one, so `as` is cleared here. Choosing a manager keeps the league, so the
  // dropdown that produced them is still there to choose again from.
  //
  // **Picking a league keeps the drawer open**, because it is not the answer —
  // it is the question narrowing, and the list of teams it produces is the
  // next thing to read. Only picking a team closes it, because that is the
  // act the drawer exists for and there is nothing left to choose.
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
      panel,
    }),
  }))

  const memberOptions = (members ?? []).map((member) => ({
    value: String(member.id),
    label: `${member.teamName} — ${member.managerName}`,
    href: buildHref({ ...base, ...carry, as: String(member.id) }),
  }))

  if (leagues.length === 0) {
    return (
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        You are not in any mini leagues, so there is nobody to view as.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <AutoSubmitSelect
        id="viewas-league"
        name="asleague"
        label="From league"
        value={carry.asLeague ?? ''}
        placeholder="Choose a league…"
        options={leagueOptions}
        hidden={leagueHidden}
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

      {viewingAs && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Showing{' '}
          <strong className="font-semibold text-neutral-700 dark:text-neutral-200">
            {viewingAs.teamName}
          </strong>
          . The way back is in the header.
        </p>
      )}
    </div>
  )
}
