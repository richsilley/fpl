import { ClubBlocksTable } from '@/app/components/club-blocks-table'
import { ErrorNotice } from '@/app/components/error-notice'
import { FixturesLegend } from '@/app/components/fixtures-legend'
import { FixturesTable } from '@/app/components/fixtures-table'
import { FormTable } from '@/app/components/form-table'
import { HorizonSelector } from '@/app/components/horizon-selector'
import { Suspense } from 'react'

import { ManagerIdForm } from '@/app/components/manager-id-form'
import { OwnershipModeSelector } from '@/app/components/ownership-mode-selector'
import { OwnershipTable } from '@/app/components/ownership-table'
import { SquadHeader } from '@/app/components/squad-header'
import { ViewTabs } from '@/app/components/view-tabs'
import { buildClubBlocks } from '@/lib/fpl/clubs'
import { FplApiError } from '@/lib/fpl/errors'
import { parseHorizon, type Horizon } from '@/lib/fpl/fixtures'
import {
  ownershipModeOf,
  parseClubSort,
  parseEntityId,
  parseFormSort,
  parseView,
  usesHorizon,
  VIEW_LABELS,
  type ClubSort,
  type ViewId,
} from '@/lib/fpl/params'
import {
  compareOwnership,
  globalPopulation,
  leagueMembers,
  leaguePopulation,
  LEAGUE_MANAGER_CAP,
  referenceContext,
  rivalPopulation,
  type LeagueMember,
  type ReferenceMode,
  type ReferencePopulation,
} from '@/lib/fpl/reference'
import type { Squad } from '@/lib/fpl/squad'
import { loadMatrixData, type MatrixData } from '@/lib/fpl/views'

/**
 * The league population makes up to fifty `picks/` calls. They are cached for
 * the rest of the gameweek, so this ceiling is only reached the first time a
 * league is opened in a gameweek, but the default of ten seconds is not
 * enough for that first load.
 */
export const maxDuration = 60

/** The question each view answers, from sections 7.2 to 7.5. */
const VIEW_QUESTIONS: Record<ViewId, string> = {
  fixtures: 'Where are my fixture problems?',
  form: 'Who is playing well, and who is at risk?',
  ownership:
    'Is this player worth owning, given who else owns them and where I sit?',
  clubs: 'Who should I buy?',
}

/**
 * The matrix: fifteen player rows, with the columns changing per view
 * (section 4).
 *
 * A Server Component reading `?id=`, `?view=`, `?horizon=` and `?sort=`.
 * Section 8.2 puts state in the URL, so every control is a plain navigation
 * and a shared link reproduces the exact view. Invalid values fall back to
 * their defaults rather than erroring, so `?id=X` alone lands on the fixtures
 * view at a 5-gameweek horizon.
 *
 * Almost everything renders on the server. The only client JavaScript is the
 * horizon control, which needs it for the live preset highlight section 7.6
 * asks for, and which still works without it.
 *
 * On section 8.1, "all FPL API calls made in server-side route handlers, never
 * from the browser": this calls lib/fpl directly rather than fetching its own
 * /api routes over HTTP. The constraint that matters is constraint 1, that the
 * API sends no CORS headers and so cannot be called from a browser, and this
 * runs on the server. Going out through our own route handler would add a
 * network hop per render for nothing, since both paths share the same cache.
 */
export default async function Page({ searchParams }: PageProps<'/'>) {
  const params = await searchParams
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value

  // `?id=1&id=2` parses as an array. Take the first rather than failing.
  const managerId = first(params.id)?.trim()
  const view = parseView(first(params.view))
  const horizon = parseHorizon(first(params.horizon))
  const rawSort = first(params.sort)
  const sort = parseClubSort(rawSort)
  const leagueId = parseEntityId(first(params.league))
  const rivalId = parseEntityId(first(params.rival))
  // An unparseable league or rival ID falls back to global rather than
  // erroring, per section 8.2.
  const ownershipMode = ownershipModeOf(
    leagueId === null ? undefined : String(leagueId),
    rivalId === null ? undefined : String(rivalId)
  )

  return (
    <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          FPL Squad Matrix
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Load any manager&rsquo;s fifteen players, then switch the columns to
          answer a different question.
        </p>
        <div className="mt-4">
          <ManagerIdForm currentId={managerId} />
        </div>
      </div>

      <div className="mt-8">
        {managerId ? (
          <MatrixSection
            managerId={managerId}
            view={view}
            horizon={horizon}
            sort={sort}
            rawSort={rawSort ?? null}
            ownershipMode={ownershipMode}
            leagueId={leagueId}
            rivalId={rivalId}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  )
}

async function MatrixSection({
  managerId,
  view,
  horizon,
  sort,
  rawSort,
  ownershipMode,
  leagueId,
  rivalId,
}: {
  managerId: string
  view: ViewId
  horizon: Horizon
  sort: ClubSort
  /** The sort exactly as the URL had it, so carriers do not lose the other view's value. */
  rawSort: string | null
  ownershipMode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
}) {
  let data: MatrixData
  try {
    data = await loadMatrixData(parseManagerId(managerId), horizon)
  } catch (error) {
    const fplError =
      error instanceof FplApiError
        ? error
        : new FplApiError(
            'unavailable',
            'Something went wrong loading that squad.',
            { cause: error }
          )

    if (!(error instanceof FplApiError)) {
      console.error('[matrix] unexpected error', error)
    }

    return <ErrorNotice kind={fplError.kind} message={fplError.message} />
  }

  return (
    <div className="space-y-6">
      <SquadHeader
        manager={data.squad.manager}
        totalPlayers={data.totalPlayers}
      />

      <ViewTabs
        managerId={managerId}
        view={view}
        horizon={data.horizon}
        sort={rawSort}
        league={leagueId === null ? null : String(leagueId)}
        rival={rivalId === null ? null : String(rivalId)}
      />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {VIEW_LABELS[view]}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {VIEW_QUESTIONS[view]}
              {usesHorizon(view) && ` Gameweek ${data.startGameweek} onwards.`}
            </p>
          </div>
          {/* Only the two horizon-driven views get the control. Showing it on
              the Form view would offer a setting that changes nothing there.
              The parameter is still carried through, so switching back to
              Fixtures returns to the horizon you left (section 7.6).

              The applied horizon, not the requested one, so a clamped value
              shows what is actually on screen. Keyed on it so a navigation
              remounts the control and its input picks up the new value. */}
          {usesHorizon(view) && (
            <HorizonSelector
              key={`${view}-${data.horizon}`}
              managerId={managerId}
              horizon={data.horizon}
              maxHorizon={data.maxHorizon}
              view={view}
              sort={rawSort}
              league={leagueId === null ? null : String(leagueId)}
              rival={rivalId === null ? null : String(rivalId)}
            />
          )}
        </div>

        {view === 'clubs' ? (
          <ClubBlocksTable
            blocks={buildClubBlocks({
              teams: data.teams,
              fixtures: data.fixtures,
              squad: data.squad,
              startGameweek: data.startGameweek,
              horizon: data.horizon,
              sort,
            })}
            managerId={managerId}
            horizon={data.horizon}
            startGameweek={data.startGameweek}
            sort={sort}
          />
        ) : view === 'form' ? (
          <FormTable
            squad={data.squad}
            managerId={managerId}
            sort={parseFormSort(rawSort ?? undefined)}
            horizon={data.horizon}
            league={leagueId === null ? null : String(leagueId)}
            rival={rivalId === null ? null : String(rivalId)}
          />
        ) : view === 'ownership' ? (
          <>
            {/* The rival dropdown needs the league's manager list, which is
                one cached standings call. Its own boundary so the mode links
                are on screen at once, and so a slow or failed standings fetch
                costs the dropdown and nothing else. */}
            <Suspense
              key={`selector-${leagueId ?? 'none'}`}
              fallback={
                <OwnershipModeSelector
                  managerId={managerId}
                  manager={data.squad.manager}
                  mode={ownershipMode}
                  leagueId={leagueId}
                  rivalId={rivalId}
                  horizon={data.horizon}
                  sort={sort}
                  members={null}
                />
              }
            >
              <ModeSelectorSection
                managerId={managerId}
                manager={data.squad.manager}
                mode={ownershipMode}
                leagueId={leagueId}
                rivalId={rivalId}
                horizon={data.horizon}
                sort={sort}
              />
            </Suspense>
            {/* The league population is one picks call per manager, up to
                fifty, and a single call runs over a second. Streaming means
                the squad header, tabs and selector are on screen immediately
                rather than the page hanging on the fan-out. Everything is
                cached for the rest of the gameweek, so this only bites the
                first time a league is opened. */}
            <Suspense
              key={`${ownershipMode}-${leagueId ?? rivalId ?? 'global'}`}
              fallback={<OwnershipLoading mode={ownershipMode} />}
            >
              <OwnershipSection
                squad={data.squad}
                totalPlayers={data.totalPlayers}
                mode={ownershipMode}
                leagueId={leagueId}
                rivalId={rivalId}
              />
            </Suspense>
          </>
        ) : (
          <FixturesTable view={data} />
        )}

        {/* The legend explains fixture shading and the Fixture Score, neither
            of which the Form view shows. */}
        {usesHorizon(view) && <FixturesLegend />}
      </section>
    </div>
  )
}

/**
 * The population selector, with the selected league's managers loaded for the
 * rival dropdown.
 *
 * Costs no extra request: `leagueMembers` reads the same cached standings call
 * the league comparison makes. A failure here is not worth an error panel — the
 * mode links and both ID forms still work — so it falls back to the selector
 * without a dropdown.
 */
async function ModeSelectorSection({
  managerId,
  manager,
  mode,
  leagueId,
  rivalId,
  horizon,
  sort,
}: {
  managerId: string
  manager: Squad['manager']
  mode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
  horizon: Horizon
  sort: ClubSort
}) {
  let members: LeagueMember[] | null = null
  if (leagueId !== null) {
    try {
      members = await leagueMembers(leagueId, manager.id)
    } catch (error) {
      console.error('[ownership] could not load league members', error)
    }
  }

  return (
    <OwnershipModeSelector
      managerId={managerId}
      manager={manager}
      mode={mode}
      leagueId={leagueId}
      rivalId={rivalId}
      horizon={horizon}
      sort={sort}
      members={members}
    />
  )
}

/**
 * Builds the reference population and renders the Ownership table.
 *
 * Separated so it can sit behind its own `<Suspense>` boundary: the league
 * population is the one slow path in the app, and the rest of the page has no
 * reason to wait for it.
 */
async function OwnershipSection({
  squad,
  totalPlayers,
  mode,
  leagueId,
  rivalId,
}: {
  squad: Squad
  totalPlayers: number
  mode: ReferenceMode
  leagueId: number | null
  rivalId: number | null
}) {
  const players = [...squad.startingXi, ...squad.bench]

  let reference: ReferencePopulation
  try {
    reference = await buildPopulation({
      mode,
      players,
      squad,
      totalPlayers,
      leagueId,
      rivalId,
    })
  } catch (error) {
    const fplError =
      error instanceof FplApiError
        ? error
        : new FplApiError(
            'unavailable',
            'Could not build the comparison population.',
            { cause: error }
          )

    if (!(error instanceof FplApiError)) {
      console.error('[ownership] unexpected error', error)
    }

    return <ErrorNotice kind={fplError.kind} message={fplError.message} />
  }

  return (
    <OwnershipTable
      rows={compareOwnership(players, reference)}
      reference={reference}
      teamName={squad.manager.teamName}
    />
  )
}

async function buildPopulation({
  mode,
  players,
  squad,
  totalPlayers,
  leagueId,
  rivalId,
}: {
  mode: ReferenceMode
  players: Squad['startingXi']
  squad: Squad
  totalPlayers: number
  leagueId: number | null
  rivalId: number | null
}): Promise<ReferencePopulation> {
  if (mode === 'league' && leagueId !== null) {
    const { events } = await referenceContext()
    return leaguePopulation(
      leagueId,
      squad.manager.id,
      squad.manager.gameweek,
      events
    )
  }

  if (mode === 'rival' && rivalId !== null) {
    const { events } = await referenceContext()
    return rivalPopulation(
      rivalId,
      squad.manager.overallRank,
      squad.manager.gameweek,
      events
    )
  }

  return globalPopulation(
    new Map(players.map((player) => [player.id, player])),
    squad.manager.overallRank,
    totalPlayers
  )
}

function OwnershipLoading({ mode }: { mode: ReferenceMode }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700"
    >
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {mode === 'league'
          ? `Loading up to ${LEAGUE_MANAGER_CAP} squads from the league…`
          : 'Loading the comparison…'}
      </p>
      {mode === 'league' && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
          This takes a moment the first time. Squads are then cached for the
          rest of the gameweek.
        </p>
      )}
    </div>
  )
}

/**
 * Validates the id before it reaches the data layer, so a typo produces a
 * useful message instead of a pointless round trip to the FPL API.
 *
 * Mirrors `parseId` in lib/fpl/http.ts, which does the same job for the route
 * handlers. Kept separate because the wording here is aimed at a reader
 * looking at the page rather than at an API consumer.
 */
function parseManagerId(value: string): number {
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FplApiError('bad_request', `"${value}" is not a manager ID.`)
  }
  return parsed
}

function EmptyState() {
  return (
    <div className="max-w-3xl rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Enter a manager ID to load a squad.
      </p>
      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-500">
        Yours is in the address bar on the FPL site when you open your Points
        tab, for example{' '}
        <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
          /entry/2695180/event/2
        </code>{' '}
        means your ID is 2695180.
      </p>
    </div>
  )
}
