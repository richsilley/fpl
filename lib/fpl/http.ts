import 'server-only'

import { FplApiError } from './errors'

/**
 * Helpers shared by the route handlers in app/api.
 */

/**
 * Parses an ID from a route param or query string.
 *
 * FPL IDs are positive integers. Rejecting anything else here keeps malformed
 * input from becoming a pointless round trip to the FPL API.
 */
export function parseId(value: string | null, name: string): number {
  if (value === null || value.trim() === '') {
    throw new FplApiError('bad_request', `Missing ${name}.`)
  }

  if (!/^\d+$/.test(value.trim())) {
    throw new FplApiError(
      'bad_request',
      `${name} must be a positive whole number, got "${value}".`
    )
  }

  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new FplApiError('bad_request', `${name} is out of range: "${value}".`)
  }

  return parsed
}

/**
 * A JSON response the CDN may cache for `seconds`.
 *
 * This mirrors the Data Cache duration in a second, free layer: Vercel's edge
 * serves repeat requests without waking a function at all, which is what keeps
 * both the cost target (section 8.4) and the load on FPL's servers down as
 * usage grows. Route Handlers are dynamic by default, so without this Next
 * would send `no-store`.
 */
export function cachedJson(data: unknown, seconds: number): Response {
  return Response.json(data, {
    headers: {
      'Cache-Control': `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`,
    },
  })
}
