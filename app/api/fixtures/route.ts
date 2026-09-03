import { getFixtures } from '@/lib/fpl/api'
import { CACHE_SECONDS } from '@/lib/fpl/config'
import { toErrorResponse } from '@/lib/fpl/errors'
import { cachedJson } from '@/lib/fpl/http'

/**
 * GET /api/fixtures
 *
 * All 380 season fixtures with FDR for both sides. Feeds the Fixtures view
 * (7.2) and, through the Fixture Score, the Club Blocks view (7.5).
 *
 * Cached for 24 hours: changes rarely (section 8.3).
 */
export async function GET() {
  try {
    return cachedJson(await getFixtures(), CACHE_SECONDS.FIXTURES)
  } catch (error) {
    return toErrorResponse(error)
  }
}
