import { ErrorNotice } from '@/app/components/error-notice'
import { FixturesLegend } from '@/app/components/fixtures-legend'
import { FixturesTable } from '@/app/components/fixtures-table'
import { HorizonSelector } from '@/app/components/horizon-selector'
import { ManagerIdForm } from '@/app/components/manager-id-form'
import { SquadHeader } from '@/app/components/squad-header'
import { FplApiError } from '@/lib/fpl/errors'
import { parseHorizon, type Horizon } from '@/lib/fpl/fixtures'
import { loadFixturesView, type FixturesView } from '@/lib/fpl/views'

/**
 * Squad loading (section 7.1) and View 1, Fixtures (section 7.2).
 *
 * A Server Component reading `?id=` and `?horizon=`. Section 8.2 puts state in
 * the URL, so both controls are plain navigations and a shared link reproduces
 * the exact view. Everything here renders on the server; the only client
 * JavaScript on the page is the horizon control, which needs it for the live
 * preset highlight section 7.6 asks for, and which still works without it.
 *
 * There is no `?view=` yet. Section 8.2's example includes one, but with a
 * single view built it would only ever hold one value. It arrives with View 2,
 * along with something to switch between.
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
  // `?id=1&id=2` parses as an array. Take the first rather than failing.
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id
  const managerId = rawId?.trim()

  const rawHorizon = Array.isArray(params.horizon)
    ? params.horizon[0]
    : params.horizon
  const horizon = parseHorizon(rawHorizon)

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
          <FixturesSection managerId={managerId} horizon={horizon} />
        ) : (
          <EmptyState />
        )}
      </div>
    </main>
  )
}

async function FixturesSection({
  managerId,
  horizon,
}: {
  managerId: string
  horizon: Horizon
}) {
  let view: FixturesView
  try {
    view = await loadFixturesView(parseManagerId(managerId), horizon)
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
      console.error('[fixtures] unexpected error', error)
    }

    return <ErrorNotice kind={fplError.kind} message={fplError.message} />
  }

  return (
    <div className="space-y-6">
      <SquadHeader manager={view.squad.manager} />

      <section className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Fixtures
            </h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Where are my fixture problems? Gameweek {view.startGameweek}{' '}
              onwards.
            </p>
          </div>
          {/* The applied horizon, not the requested one, so a clamped value
              shows what is actually on screen (section 7.6). Keyed on it so a
              navigation remounts the control and its input picks up the new
              value, rather than holding the one it was first rendered with. */}
          <HorizonSelector
            key={view.horizon}
            managerId={managerId}
            horizon={view.horizon}
            maxHorizon={view.maxHorizon}
          />
        </div>

        <FixturesTable view={view} />
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
