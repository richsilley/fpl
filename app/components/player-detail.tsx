import { FixtureCell, scoreTone } from '@/app/components/fixture-visuals'
import { BAR_TONE, OwnershipBar } from '@/app/components/ownership-table'
import { defconThreshold, formatDefcon } from '@/lib/fpl/defcon'
import { fixturesFor, type FixtureIndex } from '@/lib/fpl/fixtures'
import { formatPrice } from '@/lib/format'
import type { FplElement, FplTeam } from '@/lib/fpl/types'

/**
 * Everything the app knows about one player, in one panel (section 7.9).
 *
 * The Edge suggests players the reader has never looked at. Sending them to
 * three other views to check a suggestion is the worst possible ask at the
 * moment they are deciding, so the three answers come to them: how widely the
 * player is owned, what their fixtures look like over the horizon, and how
 * they have been scoring.
 *
 * **It reuses the other views' rendering rather than restating it.**
 * `FixtureCell`, `OwnershipBar` and the DefCon helpers are the same code the
 * Fixtures, Ownership and Form views run, so a fixture that reads amber there
 * cannot read green here.
 */
export function PlayerDetail({
  element,
  club,
  position,
  fixtures,
  gameweeks,
  globalOwnership,
  scopeOwnership,
  scopeLabel,
  matchesPlayed,
}: {
  element: FplElement
  club: FplTeam | undefined
  position: string
  fixtures: FixtureIndex
  gameweeks: number[]
  globalOwnership: number
  scopeOwnership: number
  scopeLabel: string
  matchesPlayed: number
}) {
  const isGlobalScope = scopeLabel === 'All FPL managers'
  const minutesPerMatch =
    matchesPlayed > 0 ? Math.round(element.minutes / matchesPlayed) : null
  const threshold = defconThreshold(position)

  return (
    <div className="flex max-h-[calc(100vh-6rem)] flex-col">
      <div className="shrink-0 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
          {element.web_name}
        </h3>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {club?.name ?? ''} &middot; {position} &middot;{' '}
          {formatPrice(element.now_cost)}
        </p>
      </div>

      <div className="space-y-5 overflow-y-auto p-4">
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Ownership
          </h4>
          <dl className="mt-2 space-y-2">
            <Bar
              label="All FPL managers"
              percent={globalOwnership}
              tone={BAR_TONE.global}
            />
            {/* In global scope the two figures are the same number, and a
                second identical bar would imply a comparison that is not
                being made. */}
            {!isGlobalScope && (
              <Bar
                label={scopeLabel}
                percent={scopeOwnership}
                tone={BAR_TONE.league}
              />
            )}
          </dl>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Fixtures
          </h4>
          <div className="relative mt-2 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  {gameweeks.map((gameweek) => (
                    <th
                      key={gameweek}
                      scope="col"
                      className="border-b border-l border-neutral-100 bg-neutral-50 px-1 py-1.5 text-center text-xs font-medium tabular-nums text-neutral-600 first:border-l-0 dark:border-neutral-800/70 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      <span className="sr-only">Gameweek </span>
                      <span aria-hidden>GW</span>
                      {gameweek}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {gameweeks.map((gameweek) => (
                    <td
                      key={gameweek}
                      className="h-px border-l border-neutral-100 p-0 first:border-l-0 dark:border-neutral-800/70"
                    >
                      <FixtureCell
                        fixtures={fixturesFor(fixtures, element.team, gameweek)}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Form
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-3">
            <Stat label="Price" value={formatPrice(element.now_cost)} />
            <Stat
              label="GW change"
              value={formatChange(element.cost_change_event)}
            />
            <Stat
              label="Season change"
              value={formatChange(element.cost_change_start)}
            />
            <Stat label="Points" value={String(element.total_points)} />
            <Stat label="PPG" value={element.points_per_game} />
            <Stat
              label="Mins"
              value={minutesPerMatch === null ? '—' : String(minutesPerMatch)}
            />
            <Stat label="Form" value={element.form} />
            <Stat
              label="xGI"
              value={
                position === 'GKP' ? '—' : element.expected_goal_involvements
              }
            />
            <Stat
              label="DefCon"
              value={
                threshold === null
                  ? '—'
                  : formatDefcon(element.defensive_contribution_per_90)
              }
            />
            <Stat label="xP" value={String(element.ep_next)} />
            <Stat
              label="Market"
              value={formatNet(
                element.transfers_in_event - element.transfers_out_event
              )}
            />
          </dl>
          {element.news && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {element.news}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

function Bar({
  label,
  percent,
  tone,
}: {
  label: string
  percent: number
  tone: string
}) {
  return (
    <div>
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="mt-0.5">
        <OwnershipBar percent={percent} tone={tone} />
      </dd>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-neutral-100 pb-1 dark:border-neutral-800/70">
      <dt className="text-xs text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd className="font-medium tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </dd>
    </div>
  )
}

/** Zero renders empty, as on the Form view: the column shows what moved. */
function formatChange(tenths: number): string {
  if (tenths === 0) {
    return '—'
  }
  return `${tenths > 0 ? '+' : '−'}£${Math.abs(tenths / 10).toFixed(1)}m`
}

/** Plain words, not a signed number beside the label "Market". */
function formatNet(net: number): string {
  const magnitude = Math.abs(net)
  const rounded =
    magnitude >= 1000 ? `${Math.round(magnitude / 1000)}k` : String(magnitude)
  if (net === 0) {
    return 'level'
  }
  return net > 0 ? `${rounded} buying` : `${rounded} selling`
}

export { scoreTone }
