import 'server-only'

import {
  BROWSER_USER_AGENT,
  FPL_BASE_URL,
  REQUEST_TIMEOUT_MS,
} from './config'
import { FplApiError } from './errors'

/**
 * The single point at which this app talks to the FPL API.
 *
 * Constraint 1 (section 5): the API sends no CORS headers, so it can only be
 * called from the server. The `server-only` import above turns any accidental
 * import from a Client Component into a build error rather than a runtime
 * failure in someone's browser.
 *
 * ## Why the fetch Data Cache and not `use cache`
 *
 * Next.js 16 offers `use cache` + `cacheLife` (Cache Components), which
 * replaces the deprecated `unstable_cache`. It is not the right tool here.
 * `use cache` defaults to per-instance in-memory storage, and on Vercel's
 * serverless runtime those entries do not persist across requests. Section 8.3
 * requires caching specifically to keep load off FPL's servers, and an
 * in-memory cache on ephemeral instances would not do that. Making `use cache`
 * durable means `use cache: remote`, which carries platform fees and breaks the
 * zero-cost target in section 8.4.
 *
 * The `fetch` Data Cache persists across serverless instances and across
 * deployments, and is free on Vercel's hobby tier. Next's own migration guide
 * calls out this persistence difference. So `cacheComponents` stays off and
 * caching is configured per request here.
 *
 * ## bootstrap-static is cached one level up
 *
 * A cache entry is capped at 2MB. `bootstrap-static` serialises to about
 * 2.31MB, so it can never be stored as a fetch response. It is fetched with
 * `revalidate: false` and its trimmed projection is cached instead, which
 * fits with room to spare. See `getBootstrap` in ./api.ts.
 */
type FplFetchOptions = {
  /**
   * How long the response stays in the Data Cache, in seconds, or `false` to
   * bypass it. Bypass is for a response too large to store, where the caller
   * caches a smaller derived value instead. See `getBootstrap` in ./api.ts.
   */
  revalidate: number | false
  /** Tags for on-demand invalidation via `revalidateTag`. */
  tags?: string[]
}

export async function fplFetch<T>(
  path: string,
  { revalidate, tags }: FplFetchOptions
): Promise<T> {
  const url = `${FPL_BASE_URL}${path}`

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        // Constraint 2: without a browser user-agent the API returns 403.
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'application/json',
      },
      ...(revalidate === false
        ? { cache: 'no-store' as const }
        : { cache: 'force-cache' as const, next: { revalidate, tags } }),
      // Only affects fetch memoization, which does not apply in Route
      // Handlers anyway. The Data Cache is unaffected, and Next drops the
      // signal during background revalidation.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : ''
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new FplApiError(
        'timeout',
        `The FPL API did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`,
        { cause }
      )
    }
    throw new FplApiError('network', 'Could not reach the FPL API.', { cause })
  }

  if (!response.ok) {
    throw errorForStatus(response.status, path)
  }

  // Around deadlines and during maintenance the API can answer 200 with an
  // HTML holding page. Only 200 responses are written to the Data Cache, so
  // this would otherwise be cached as if it were good data.
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('json')) {
    throw new FplApiError(
      'unavailable',
      'The FPL API returned a non-JSON response, which usually means it is down for maintenance.',
      { upstreamStatus: response.status }
    )
  }

  try {
    return (await response.json()) as T
  } catch (cause) {
    throw new FplApiError('unavailable', 'The FPL API returned malformed JSON.', {
      cause,
      upstreamStatus: response.status,
    })
  }
}

function errorForStatus(status: number, path: string): FplApiError {
  if (status === 404) {
    return new FplApiError('not_found', `No FPL data found for ${path}.`, {
      upstreamStatus: status,
    })
  }

  if (status === 403) {
    return new FplApiError(
      'forbidden',
      'The FPL API rejected the request. The browser user-agent it expects may have changed.',
      { upstreamStatus: status }
    )
  }

  if (status >= 500) {
    return new FplApiError(
      'unavailable',
      `The FPL API is unavailable (HTTP ${status}). It is often down around gameweek deadlines.`,
      { upstreamStatus: status }
    )
  }

  return new FplApiError(
    'unavailable',
    `Unexpected response from the FPL API (HTTP ${status}).`,
    { upstreamStatus: status }
  )
}
