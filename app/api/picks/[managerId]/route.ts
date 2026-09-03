import type { NextRequest } from 'next/server'

import {
  currentGameweek,
  getBootstrap,
  getPicks,
  secondsUntilNextDeadline,
} from '@/lib/fpl/api'
import { toErrorResponse } from '@/lib/fpl/errors'
import { cachedJson, parseId } from '@/lib/fpl/http'

/**
 * GET /api/picks/{managerId}[?gw=n]
 *
 * A manager's fifteen players. Rows for every view (section 4). `gw` defaults
 * to the most recent gameweek whose deadline has passed, which is what
 * section 7.1 loads.
 *
 * The response is the upstream payload unchanged; `entry_history` carries the
 * gameweek it is for, along with the rank and points the section 7.1 header
 * needs.
 *
 * Cached for the rest of the gameweek (section 8.3).
 */
export async function GET(
  request: NextRequest,
  context: RouteContext<'/api/picks/[managerId]'>
) {
  try {
    const { managerId } = await context.params
    const id = parseId(managerId, 'Manager ID')

    // Needed either way: to resolve the gameweek, to check its deadline has
    // passed, and to work out how long the picks stay valid.
    const { events } = await getBootstrap()

    const requestedGameweek = request.nextUrl.searchParams.get('gw')
    const gameweek = requestedGameweek
      ? parseId(requestedGameweek, 'Gameweek')
      : currentGameweek(events)

    const picks = await getPicks(id, gameweek, events)

    return cachedJson(picks, secondsUntilNextDeadline(events))
  } catch (error) {
    return toErrorResponse(error)
  }
}
