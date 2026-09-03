/**
 * Error handling for the FPL API.
 *
 * Every failure mode is turned into an `FplApiError` with a `kind`, so route
 * handlers map errors to responses in one place and the UI can branch on a
 * stable string rather than an HTTP status.
 */

export type FplErrorKind =
  /** The caller sent something malformed, e.g. a non-numeric manager ID. */
  | 'bad_request'
  /** The manager, league or gameweek does not exist. */
  | 'not_found'
  /**
   * Constraint 3 (section 5): `picks/` only returns data for gameweeks whose
   * deadline has passed. Distinguished from `not_found` because the fix is to
   * wait, not to correct the ID.
   */
  | 'picks_not_yet_available'
  /** The FPL API rejected us, most likely the user-agent check. */
  | 'forbidden'
  /** The FPL API is up but erroring, or served a maintenance page. */
  | 'unavailable'
  /** We could not reach the FPL API at all. */
  | 'network'
  /** The FPL API did not respond in time. */
  | 'timeout'

const STATUS_BY_KIND: Record<FplErrorKind, number> = {
  bad_request: 400,
  not_found: 404,
  picks_not_yet_available: 409,
  forbidden: 502,
  unavailable: 503,
  network: 503,
  timeout: 504,
}

export class FplApiError extends Error {
  readonly kind: FplErrorKind
  /** Status returned by the FPL API, when the call got that far. */
  readonly upstreamStatus?: number

  constructor(
    kind: FplErrorKind,
    message: string,
    options: { cause?: unknown; upstreamStatus?: number } = {}
  ) {
    super(message, { cause: options.cause })
    this.name = 'FplApiError'
    this.kind = kind
    this.upstreamStatus = options.upstreamStatus
  }

  get status(): number {
    return STATUS_BY_KIND[this.kind]
  }
}

export type ErrorBody = {
  error: {
    code: FplErrorKind
    message: string
  }
}

/**
 * Turns any thrown value into a JSON response.
 *
 * Errors are never cached: a deadline-time outage must not be served for the
 * next hour, and the browser must be able to retry immediately.
 */
export function toErrorResponse(error: unknown): Response {
  const fplError =
    error instanceof FplApiError
      ? error
      : new FplApiError('unavailable', 'Unexpected error talking to the FPL API', {
          cause: error,
        })

  if (!(error instanceof FplApiError)) {
    console.error('[fpl] unexpected error', error)
  }

  const body: ErrorBody = {
    error: { code: fplError.kind, message: fplError.message },
  }

  return Response.json(body, {
    status: fplError.status,
    headers: { 'Cache-Control': 'no-store' },
  })
}
