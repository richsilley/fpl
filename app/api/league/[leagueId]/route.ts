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
