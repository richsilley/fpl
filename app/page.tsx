import { ClubBlocksTable } from '@/app/components/club-blocks-table'
import { ErrorNotice } from '@/app/components/error-notice'
import { FixturesLegend } from '@/app/components/fixtures-legend'
import { FixturesTable } from '@/app/components/fixtures-table'
import { HorizonSelector } from '@/app/components/horizon-selector'
import { ManagerIdForm } from '@/app/components/manager-id-form'
import { SquadHeader } from '@/app/components/squad-header'
import { ViewTabs } from '@/app/components/view-tabs'
import { buildClubBlocks } from '@/lib/fpl/clubs'
import { FplApiError } from '@/lib/fpl/errors'
import { parseHorizon, type Horizon } from '@/lib/fpl/fixtures'
import {
  parseClubSort,
  parseView,
  type ClubSort,
  type ViewId,
} from '@/lib/fpl/params'
import { loadMatrixData, type MatrixData } from '@/lib/fpl/views'

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
  const sort = parseClubSort(first(params.sort))

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
}: {
  managerId: string
  view: ViewId
  horizon: Horizon
  sort: ClubSort
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
      <SquadHeader manager={data.squad.manager} />

      <ViewTabs
        managerId={managerId}
        view={view}
        horizon={data.horizon}
        sort={sort}
      />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {view === 'clubs' ? 'Club Blocks' : 'Fixtures'}
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {view === 'clubs'
                ? 'Who should I buy? '
                : 'Where are my fixture problems? '}
              Gameweek {data.startGameweek} onwards.
            </p>
          </div>
          {/* The applied horizon, not the requested one, so a clamped value
              shows what is actually on screen (section 7.6). Keyed on it so a
              navigation remounts the control and its input picks up the new
              value, rather than holding the one it was first rendered with. */}
          <HorizonSelector
            key={`${view}-${data.horizon}`}
            managerId={managerId}
            horizon={data.horizon}
            maxHorizon={data.maxHorizon}
            view={view}
            sort={sort}
          />
        </div>

        {view === 'clubs' ? (
          <ClubBlocksTable
            blocks={buildClubBlocks({
              teams: data.teams,
              fixtures: data.fixtures,
              squad: data.squad,
              startGameweek: data.startGameweek,
              horizon: data.horizon,
              columns: data.columns,
              sort,
            })}
            managerId={managerId}
            horizon={data.horizon}
            startGameweek={data.startGameweek}
            columns={data.columns}
            sort={sort}
          />
        ) : (
          <FixturesTable view={data} />
        )}

        <FixturesLegend />
      </section>
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
