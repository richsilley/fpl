/**
 * Shared configuration for every call to the FPL API.
 *
 * See docs/FPL-Squad-Matrix-v1-Requirements.md sections 5 and 8.3.
 */

export const FPL_BASE_URL = 'https://fantasy.premierleague.com/api'

/**
 * Constraint 2 (section 5): the FPL API returns 403 to requests that don't
 * look like they came from a browser. Every server call sets this.
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Constraint 5 (section 5): the API goes down around gameweek deadlines and
 * through the off-season. Fail fast rather than holding a serverless
 * invocation open until the platform kills it, so we can return a clean error.
 */
export const REQUEST_TIMEOUT_MS = 8_000

/**
 * Cache durations, in seconds, from the table in section 8.3.
 *
 * `PICKS` is not a fixed duration: a manager's picks are immutable once the
 * deadline passes, so they are cached until the next deadline. See
 * `secondsUntilNextDeadline` in ./api.ts.
 */
export const CACHE_SECONDS = {
  /** Prices change once daily. */
  BOOTSTRAP: 60 * 60,
  /** Changes rarely. */
  FIXTURES: 60 * 60 * 24,
  /** Updates during and after matches. */
  LEAGUE_STANDINGS: 60 * 60,
  /**
   * Not in the section 8.3 table. Only the manager's name and team name are
   * read from it, and neither changes in practice, so this matches the
   * standings duration rather than inventing a longer one.
   */
  ENTRY: 60 * 60,
} as const

/** Floor for the picks cache, so a stale deadline can't disable caching. */
export const MIN_PICKS_CACHE_SECONDS = 60

/**
 * Used for picks once the season has ended and there is no next deadline.
 * Not a ceiling on the in-season value: gaps between deadlines run to a week
 * or more, and picks really are immutable across them.
 */
export const SEASON_OVER_PICKS_CACHE_SECONDS = 60 * 60 * 24

/**
 * Cache tags, so a single endpoint can be invalidated on demand without
 * waiting out its duration.
 */
export const CACHE_TAGS = {
  BOOTSTRAP: 'fpl:bootstrap',
  FIXTURES: 'fpl:fixtures',
  PICKS: 'fpl:picks',
  LEAGUE: 'fpl:league',
  ENTRY: 'fpl:entry',
} as const
