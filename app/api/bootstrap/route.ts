import { getBootstrap } from '@/lib/fpl/api'
import { CACHE_SECONDS } from '@/lib/fpl/config'
import { toErrorResponse } from '@/lib/fpl/errors'
import { cachedJson } from '@/lib/fpl/http'

/**
 * GET /api/bootstrap
 *
 * All players, teams, gameweeks, prices, ownership, form, xG, xA and injury
 * status. Feeds the Form view (7.3), the global mode of the Ownership view
 * (7.4), and the player and club names every view needs.
 *
 * Cached for 1 hour: prices change once daily (section 8.3).
 *
 * ## This endpoint is a projection, not a faithful proxy
 *
 * Unlike the other three routes, this one does not return what the FPL API
 * returned. `elements` is trimmed from about 100 fields per player to the
 * twenty that sections 7.2 to 7.5 name; `events`, `teams` and `element_types`
 * are passed through whole. The field list is in lib/fpl/projection.ts and
 * repeated in CLAUDE.md.
 *
 * This was option 1 of the two recorded here previously, chosen because it was
 * the only one compatible with section 8.4. The alternative, a KV or Redis
 * cache handler, is exempt from the 2MB cache entry limit but costs money.
 *
 * The trigger was caching rather than payload size. At ~2.31MB the upstream
 * response is over the 2MB limit on a cache entry, so it was being rejected
 * and every request reached the FPL API, defeating section 8.3. Note that
 * projecting the response does not on its own fix that, since the limit
 * applies to the upstream body: the projection had to become the cached unit.
 * See `getBootstrap` in lib/fpl/api.ts for how.
 *
 * Cutting the response from 1.65MB to 298KB is the second benefit, and a real
 * one given mobile is the primary target (section 8.5).
 */
export async function GET() {
  try {
    return cachedJson(await getBootstrap(), CACHE_SECONDS.BOOTSTRAP)
  } catch (error) {
    return toErrorResponse(error)
  }
}
