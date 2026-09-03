import { ErrorNotice } from '@/app/components/error-notice'
import { ManagerIdForm } from '@/app/components/manager-id-form'
import { SquadHeader } from '@/app/components/squad-header'
import { SquadTable } from '@/app/components/squad-table'
import { FplApiError } from '@/lib/fpl/errors'
import { loadSquad, type Squad } from '@/lib/fpl/squad'

/**
 * Squad loading, section 7.1.
 *
 * A Server Component that reads `?id=` and renders the squad in the response.
 * Section 8.2 puts application state in the URL, so the id in the address bar
 * is the whole input: a shared link loads the same squad with no client state
 * to rehydrate, and the page needs no JavaScript to work.
 *
 * On section 8.1, "all FPL API calls made in server-side route handlers, never
 * from the browser": this calls lib/fpl directly rather than fetching its own
 * /api routes over HTTP. The constraint that matters is constraint 1, that the
 * API sends no CORS headers and so cannot be called from a browser, and this
 * runs on the server. Going out through our own route handler would add a
 * network hop per render for nothing, since both paths share the same cache.
 * The /api routes stay the app's public surface for client-side callers.
 */
export default async function Page({ searchParams }: PageProps<'/'>) {
  const { id } = await searchParams
  // `?id=1&id=2` parses as an array. Take the first rather than failing.
  const rawId = Array.isArray(id) ? id[0] : id
  const trimmedId = rawId?.trim()

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          FPL Squad Matrix
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Load any manager&rsquo;s fifteen players, then switch the columns to
          answer a different question.
        </p>
      </div>

      <div className="mb-6">
        <ManagerIdForm currentId={trimmedId} />
      </div>

      {trimmedId ? <SquadSection id={trimmedId} /> : <EmptyState />}
    </main>
  )
}

async function SquadSection({ id }: { id: string }) {
  let squad: Squad
  try {
    squad = await loadSquad(parseManagerId(id))
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
      console.error('[squad] unexpected error', error)
    }

    return <ErrorNotice kind={fplError.kind} message={fplError.message} />
  }

  return (
    <div className="space-y-6">
      <SquadHeader manager={squad.manager} />
      <SquadTable squad={squad} />
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
  if (!/^\d+$/.test(value)) {
    throw new FplApiError(
      'bad_request',
      `"${value}" is not a manager ID.`
    )
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FplApiError('bad_request', `"${value}" is not a manager ID.`)
  }

  return parsed
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
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
