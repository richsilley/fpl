import type { NextRequest } from 'next/server'

import { getLeagueStandings } from '@/lib/fpl/api'
import { CACHE_SECONDS } from '@/lib/fpl/config'
import { toErrorResponse } from '@/lib/fpl/errors'
import { cachedJson, parseId } from '@/lib/fpl/http'

/**
 * GET /api/league/{leagueId}[?page=n]
 *
 * Classic league standings, which is how the Ownership view (7.4) gets the
 * manager IDs for its mini-league mode.
 *
 * The endpoint pages at 50, matching the 50-manager cap in section 7.4, so the
 * default page 1 is the top 50 by league rank. `standings.has_next` in the
 * response tells the caller a larger league needs the top-50-only notice.
 *
 * Cached for 1 hour: updates during and after matches (section 8.3).
 */

/**
 * Set explicitly rather than left to the platform default.
 *
 * This route itself makes one upstream call and is quick, but the default is
 * a property of the deployment target rather than of this code: it is ten
 * seconds on Vercel today and is not ours to depend on. The page that consumes
 * these standings fans out to fifty `picks/` calls and already declares sixty
 * for that reason (`app/page.tsx`); stating it here too means neither can be
 * silently retimed by a platform change.
 *
 * Sixty seconds is the hobby-tier ceiling. It is a cap, not a target — nothing
 * here should come close, and if it ever does the fix is the fan-out, not a
 * longer timeout.
 */
export const maxDuration = 60
export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/league/[leagueId]'>
) {
  try {
    const { leagueId } = await context.params
    const id = parseId(leagueId, 'League ID')

    const requestedPage = request.nextUrl.searchParams.get('page')
    const page = requestedPage ? parseId(requestedPage, 'Page') : 1

    const standings = await getLeagueStandings(id, page)

    return cachedJson(standings, CACHE_SECONDS.LEAGUE_STANDINGS)
  } catch (error) {
    return toErrorResponse(error)
  }
}
